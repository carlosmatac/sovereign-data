// ============================================
// Transcript Chunking — Speaker-Aware Semantic Chunks
// ============================================

import { AI_CONFIG } from "@/lib/constants";

export interface TranscriptUtterance {
  speaker: string;
  text: string;
  start: number; // milliseconds
  end: number;   // milliseconds
}

export interface TextChunk {
  content: string;
  speaker: string | null;
  startTime: number | null; // seconds
  endTime: number | null;   // seconds
  chunkIndex: number;
}

/**
 * Rough token count estimation.
 * GPT-family tokenizers average ~4 chars per token for English.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const ABBREVIATIONS = new Set([
  "dr", "mr", "mrs", "ms", "prof", "gen", "col", "sgt", "rev",
  "inc", "corp", "ltd", "co", "jr", "sr", "st", "ft",
  "no", "vs", "vol", "dept", "est", "govt", "approx",
  "hon", "pres", "rep", "sen", "gov", "amb", "min", "sec",
  "fig", "ref", "etc", "al", "avg",
]);

const CHUNK_MIN_TOKENS = 50;
const CHUNK_MAX_TOKENS = 600;

/**
 * Extract the last ~overlapTokens worth of text, breaking at a word boundary.
 * Used to carry context forward between consecutive chunks.
 */
function getOverlapText(text: string, overlapTokens: number): string {
  if (overlapTokens <= 0) return "";
  const chars = overlapTokens * 4;
  const trimmed = text.trim();
  if (trimmed.length <= chars) return trimmed;

  let start = trimmed.length - chars;
  const nextSpace = trimmed.indexOf(" ", start);
  if (nextSpace !== -1 && nextSpace < trimmed.length - 20) {
    start = nextSpace + 1;
  }
  return trimmed.substring(start);
}

function splitSentences(text: string): string[] {
  if (!text.trim()) return [];

  const sentences: string[] = [];
  let start = 0;

  const pattern = /([.!?]+)\s+/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const nextCharIdx = match.index + match[0].length;
    const nextChar = text[nextCharIdx];

    if (!nextChar || !/[A-Z\u00C0-\u024F"'\u201C\u2018([]/.test(nextChar)) continue;

    if (match[1][0] === ".") {
      const textBefore = text.substring(start, match.index);
      const wordMatch = textBefore.match(/(\w+)$/);
      if (wordMatch) {
        const word = wordMatch[1].toLowerCase();
        if (ABBREVIATIONS.has(word)) continue;
        if (/^[a-zA-Z]$/.test(wordMatch[1])) continue;
      }
      const nearPeriod = text.substring(Math.max(0, match.index - 3), match.index);
      if (/[A-Z]\.[A-Z]$/.test(nearPeriod)) continue;
    }

    const sentenceEnd = match.index + match[1].length;
    const sentence = text.substring(start, sentenceEnd).trim();
    if (sentence) sentences.push(sentence);
    start = nextCharIdx;
  }

  const remaining = text.substring(start).trim();
  if (remaining) sentences.push(remaining);

  return sentences.length > 0 ? sentences : [text];
}

function getChunkBody(chunk: TextChunk): string {
  const match = chunk.content.match(/^\[.+?\]:\s*/);
  return match ? chunk.content.substring(match[0].length) : chunk.content;
}

function formatChunkContent(speaker: string | null, body: string): string {
  return speaker ? `[${speaker}]: ${body}` : body;
}

function splitOversizedChunk(chunk: TextChunk): TextChunk[] {
  const body = getChunkBody(chunk);
  const words = body.split(/\s+/);
  const targetTokens = AI_CONFIG.chunkSize;
  const parts: string[] = [];
  let current = "";

  for (const word of words) {
    if (estimateTokens(current + " " + word) > targetTokens && current) {
      parts.push(current.trim());
      current = word;
    } else {
      current += (current ? " " : "") + word;
    }
  }
  if (current.trim()) parts.push(current.trim());

  if (parts.length <= 1) return [chunk];

  return parts.map((part, i) => ({
    ...chunk,
    content: formatChunkContent(chunk.speaker, part),
    startTime:
      chunk.startTime !== null && chunk.endTime !== null
        ? chunk.startTime + ((chunk.endTime - chunk.startTime) * i) / parts.length
        : chunk.startTime,
    endTime:
      chunk.startTime !== null && chunk.endTime !== null
        ? chunk.startTime +
          ((chunk.endTime - chunk.startTime) * (i + 1)) / parts.length
        : chunk.endTime,
    chunkIndex: 0,
  }));
}

/**
 * Post-process chunks to enforce token bounds:
 * - Split any chunk over CHUNK_MAX_TOKENS at word boundaries
 * - Merge any chunk under CHUNK_MIN_TOKENS into its previous same-speaker neighbor
 * - Reassign sequential chunk indices
 */
function enforceChunkBounds(chunks: TextChunk[]): TextChunk[] {
  if (chunks.length === 0) return [];

  let expanded: TextChunk[] = [];
  for (const chunk of chunks) {
    if (estimateTokens(chunk.content) > CHUNK_MAX_TOKENS) {
      expanded.push(...splitOversizedChunk(chunk));
    } else {
      expanded.push(chunk);
    }
  }

  const merged: TextChunk[] = [];
  for (const chunk of expanded) {
    const prev = merged[merged.length - 1];
    const chunkTokens = estimateTokens(chunk.content);

    if (
      prev &&
      chunkTokens < CHUNK_MIN_TOKENS &&
      chunk.speaker === prev.speaker &&
      estimateTokens(prev.content) + chunkTokens <= CHUNK_MAX_TOKENS
    ) {
      prev.content = formatChunkContent(
        prev.speaker,
        getChunkBody(prev) + " " + getChunkBody(chunk)
      );
      prev.endTime = chunk.endTime ?? prev.endTime;
    } else {
      merged.push({ ...chunk });
    }
  }

  return merged.map((c, i) => ({ ...c, chunkIndex: i }));
}

/**
 * Chunk a diarized transcript into semantic segments.
 *
 * Strategy:
 * 1. Group consecutive utterances by the same speaker.
 * 2. If a speaker group exceeds the target chunk size, split at sentence boundaries.
 * 3. Respect speaker turns — never merge different speakers into one chunk.
 * 4. Add overlap between chunks for context continuity.
 */
export function chunkTranscript(
  utterances: TranscriptUtterance[]
): TextChunk[] {
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;

  // Group consecutive utterances by the same speaker
  const groups: Array<{
    speaker: string;
    text: string;
    start: number;
    end: number;
  }> = [];

  for (const utterance of utterances) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.speaker === utterance.speaker) {
      lastGroup.text += " " + utterance.text;
      lastGroup.end = utterance.end;
    } else {
      groups.push({
        speaker: utterance.speaker,
        text: utterance.text,
        start: utterance.start,
        end: utterance.end,
      });
    }
  }

  for (const group of groups) {
    const tokens = estimateTokens(group.text);

    if (tokens <= AI_CONFIG.chunkSize) {
      chunks.push({
        content: `[${group.speaker}]: ${group.text}`,
        speaker: group.speaker,
        startTime: group.start / 1000,
        endTime: group.end / 1000,
        chunkIndex: chunkIndex++,
      });
    } else {
      const sentences = splitSentences(group.text);
      let currentChunk = "";
      let overlapLen = 0;
      const totalDuration = group.end - group.start;
      const totalLength = group.text.length;
      let chunkStartPos = 0;

      for (const sentence of sentences) {
        const candidateTokens = estimateTokens(currentChunk + " " + sentence);

        if (candidateTokens > AI_CONFIG.chunkSize && currentChunk) {
          const newContentLen = currentChunk.length - overlapLen;
          const startRatio = chunkStartPos / totalLength;
          const endRatio = (chunkStartPos + newContentLen) / totalLength;

          chunks.push({
            content: `[${group.speaker}]: ${currentChunk.trim()}`,
            speaker: group.speaker,
            startTime: (group.start + totalDuration * startRatio) / 1000,
            endTime: (group.start + totalDuration * endRatio) / 1000,
            chunkIndex: chunkIndex++,
          });

          chunkStartPos += newContentLen;
          const overlap = getOverlapText(currentChunk, AI_CONFIG.chunkOverlap);
          overlapLen = overlap.length + 1;
          currentChunk = overlap + " " + sentence;
        } else {
          currentChunk += " " + sentence;
        }
      }

      if (currentChunk.trim()) {
        const startRatio = chunkStartPos / totalLength;
        chunks.push({
          content: `[${group.speaker}]: ${currentChunk.trim()}`,
          speaker: group.speaker,
          startTime: (group.start + totalDuration * startRatio) / 1000,
          endTime: group.end / 1000,
          chunkIndex: chunkIndex++,
        });
      }
    }
  }

  return enforceChunkBounds(chunks);
}

/**
 * Chunk a plain (non-diarized) transcript.
 * Falls back to paragraph-based splitting.
 */
export function chunkPlainText(text: string): TextChunk[] {
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    const candidateTokens = estimateTokens(currentChunk + "\n\n" + paragraph);

    if (candidateTokens > AI_CONFIG.chunkSize && currentChunk) {
      chunks.push({
        content: currentChunk.trim(),
        speaker: null,
        startTime: null,
        endTime: null,
        chunkIndex: chunkIndex++,
      });
      const overlap = getOverlapText(currentChunk, AI_CONFIG.chunkOverlap);
      currentChunk = overlap ? overlap + "\n\n" + paragraph : paragraph;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      speaker: null,
      startTime: null,
      endTime: null,
      chunkIndex: chunkIndex++,
    });
  }

  return enforceChunkBounds(chunks);
}
