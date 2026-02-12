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
      // Fits in one chunk
      chunks.push({
        content: `[${group.speaker}]: ${group.text}`,
        speaker: group.speaker,
        startTime: group.start / 1000, // ms -> seconds
        endTime: group.end / 1000,
        chunkIndex: chunkIndex++,
      });
    } else {
      // Split at sentence boundaries
      const sentences = group.text.match(/[^.!?]+[.!?]+/g) || [group.text];
      let currentChunk = "";
      const totalDuration = group.end - group.start;
      const totalLength = group.text.length;
      let chunkStartPos = 0;

      for (const sentence of sentences) {
        const candidateTokens = estimateTokens(currentChunk + " " + sentence);

        if (candidateTokens > AI_CONFIG.chunkSize && currentChunk) {
          // Emit current chunk
          const startRatio = chunkStartPos / totalLength;
          const endRatio = (chunkStartPos + currentChunk.length) / totalLength;

          chunks.push({
            content: `[${group.speaker}]: ${currentChunk.trim()}`,
            speaker: group.speaker,
            startTime: (group.start + totalDuration * startRatio) / 1000,
            endTime: (group.start + totalDuration * endRatio) / 1000,
            chunkIndex: chunkIndex++,
          });

          chunkStartPos += currentChunk.length;
          currentChunk = sentence;
        } else {
          currentChunk += " " + sentence;
        }
      }

      // Emit remaining content
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

  return chunks;
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
      currentChunk = paragraph;
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

  return chunks;
}
