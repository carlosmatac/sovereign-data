// ============================================
// Text Interview Chunking
// ============================================
// Structure-aware chunking for plain-text interview sources.
// Detects whether the text is Q&A-formatted, speaker-labelled,
// article-style prose, or freeform — and chunks accordingly.

import { AI_CONFIG } from "@/lib/constants";
import type { TextChunk } from "./chunking";

export type TextStructureType =
  | "qa_structured"
  | "speaker_transcript"
  | "article_style"
  | "freeform";

// ── Detection regexes ─────────────────────────────────────────────────────

/** "Q:", "P:", "Pregunta:", "Question:" at start of line (case-insensitive) */
const QA_LINE_RE = /^(Q|P|Pregunta|Question)\s*:/i;

/**
 * Speaker transcript line: "NAME:" where NAME is ≥2 capitalized chars
 * e.g. "John:", "MODERATOR:", "María José:"
 */
const SPEAKER_LINE_RE = /^[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñA-ZÁÉÍÓÚÜÑ]{1,}(\s[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñA-ZÁÉÍÓÚÜÑ]+)*\s*:/;

// ── Token estimation (mirrors chunking.ts) ───────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const CHUNK_MAX_TOKENS = 600;
const CHUNK_MIN_TOKENS = 50;

// ── Auto-detect structure ─────────────────────────────────────────────────

export function detectTextStructure(text: string): TextStructureType {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return "freeform";

  const qaMatches = lines.filter((l) => QA_LINE_RE.test(l.trim())).length;
  if (qaMatches >= 2) return "qa_structured";

  const speakerMatches = lines.filter((l) =>
    SPEAKER_LINE_RE.test(l.trim())
  ).length;
  const speakerRatio = speakerMatches / lines.length;
  if (speakerMatches >= 3 && speakerRatio >= 0.1) return "speaker_transcript";

  // If paragraphs are separated by blank lines → article_style
  const hasParagraphBreaks = /\n{2,}/.test(text);
  if (hasParagraphBreaks) return "article_style";

  return "freeform";
}

// ── Merge short chunks into previous ─────────────────────────────────────

function mergeShortChunks(chunks: TextChunk[]): TextChunk[] {
  const merged: TextChunk[] = [];
  for (const chunk of chunks) {
    const prev = merged[merged.length - 1];
    const tokens = estimateTokens(chunk.content);
    if (
      prev &&
      tokens < CHUNK_MIN_TOKENS &&
      chunk.speaker === prev.speaker &&
      estimateTokens(prev.content) + tokens <= CHUNK_MAX_TOKENS
    ) {
      prev.content = prev.content + "\n\n" + chunk.content;
    } else {
      merged.push({ ...chunk });
    }
  }
  return merged.map((c, i) => ({ ...c, chunkIndex: i }));
}

// ── Chunking strategies ───────────────────────────────────────────────────

/** Split oversized text at word boundaries */
function splitByTokens(text: string, speaker: string | null): TextChunk[] {
  const words = text.split(/\s+/);
  const parts: string[] = [];
  let current = "";
  for (const word of words) {
    if (estimateTokens(current + " " + word) > CHUNK_MAX_TOKENS && current) {
      parts.push(current.trim());
      current = word;
    } else {
      current += (current ? " " : "") + word;
    }
  }
  if (current.trim()) parts.push(current.trim());

  return parts.map((part, i) => ({
    content: part,
    speaker,
    startTime: null,
    endTime: null,
    chunkIndex: i,
  }));
}

/**
 * Chunk Q&A-formatted text.
 * Groups Q+A pairs as a single chunk where possible; splits oversized pairs.
 */
function chunkQaStructured(text: string): TextChunk[] {
  const lines = text.split("\n");
  const chunks: TextChunk[] = [];
  let currentBlock = "";

  for (const line of lines) {
    const trimmed = line.trim();
    const isQLine = QA_LINE_RE.test(trimmed);
    const blockTokens = estimateTokens(currentBlock);

    if (isQLine && currentBlock && blockTokens > CHUNK_MIN_TOKENS) {
      // Flush current block before starting a new Q
      if (estimateTokens(currentBlock) > CHUNK_MAX_TOKENS) {
        chunks.push(...splitByTokens(currentBlock.trim(), null));
      } else {
        chunks.push({
          content: currentBlock.trim(),
          speaker: null,
          startTime: null,
          endTime: null,
          chunkIndex: 0,
        });
      }
      currentBlock = "";
    }

    currentBlock += (currentBlock ? "\n" : "") + line;
  }

  if (currentBlock.trim()) {
    if (estimateTokens(currentBlock) > CHUNK_MAX_TOKENS) {
      chunks.push(...splitByTokens(currentBlock.trim(), null));
    } else {
      chunks.push({
        content: currentBlock.trim(),
        speaker: null,
        startTime: null,
        endTime: null,
        chunkIndex: 0,
      });
    }
  }

  return mergeShortChunks(chunks).map((c, i) => ({ ...c, chunkIndex: i }));
}

/**
 * Chunk speaker-labelled text.
 * Groups consecutive lines by speaker; flushes on speaker change.
 */
function chunkSpeakerTranscript(text: string): TextChunk[] {
  const lines = text.split("\n");
  const chunks: TextChunk[] = [];
  let currentSpeaker: string | null = null;
  let currentText = "";

  function flush() {
    if (currentText.trim()) {
      if (estimateTokens(currentText) > CHUNK_MAX_TOKENS) {
        chunks.push(...splitByTokens(currentText.trim(), currentSpeaker));
      } else {
        chunks.push({
          content: currentSpeaker
            ? `[${currentSpeaker}]: ${currentText.trim()}`
            : currentText.trim(),
          speaker: currentSpeaker,
          startTime: null,
          endTime: null,
          chunkIndex: 0,
        });
      }
    }
    currentText = "";
  }

  for (const line of lines) {
    const trimmed = line.trim();
    const speakerMatch = trimmed.match(SPEAKER_LINE_RE);

    if (speakerMatch) {
      flush();
      const colonIdx = trimmed.indexOf(":");
      currentSpeaker = trimmed.slice(0, colonIdx).trim();
      currentText = trimmed.slice(colonIdx + 1).trim();
    } else {
      currentText += (currentText ? " " : "") + trimmed;
    }
  }

  flush();

  return mergeShortChunks(chunks).map((c, i) => ({ ...c, chunkIndex: i }));
}

/**
 * Chunk paragraph-separated prose (article or freeform).
 * Splits on double newlines; accumulates until chunk size limit.
 */
function chunkByParagraphs(text: string): TextChunk[] {
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  const chunks: TextChunk[] = [];
  let current = "";

  for (const para of paragraphs) {
    const candidate = current ? current + "\n\n" + para : para;
    if (estimateTokens(candidate) > AI_CONFIG.chunkSize && current) {
      chunks.push({
        content: current.trim(),
        speaker: null,
        startTime: null,
        endTime: null,
        chunkIndex: 0,
      });
      current = para;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) {
    chunks.push({
      content: current.trim(),
      speaker: null,
      startTime: null,
      endTime: null,
      chunkIndex: 0,
    });
  }

  return mergeShortChunks(chunks).map((c, i) => ({ ...c, chunkIndex: i }));
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Chunk a plain-text interview/document source.
 *
 * @param text - Full text content.
 * @param structureHint - Optional override for structure detection. When omitted,
 *   the structure is auto-detected and returned in the result's metadata.
 * @returns Array of TextChunk objects. Each chunk has a `speaker` field (null for
 *   non-speaker-labelled sources).
 */
export function chunkTextInterview(
  text: string,
  structureHint?: TextStructureType
): TextChunk[] & { detectedStructure: TextStructureType } {
  const structure = structureHint ?? detectTextStructure(text);
  let chunks: TextChunk[];

  switch (structure) {
    case "qa_structured":
      chunks = chunkQaStructured(text);
      break;
    case "speaker_transcript":
      chunks = chunkSpeakerTranscript(text);
      break;
    case "article_style":
    case "freeform":
    default:
      chunks = chunkByParagraphs(text);
      break;
  }

  // Guarantee at least one chunk for non-empty input
  if (chunks.length === 0 && text.trim()) {
    chunks = [
      {
        content: text.trim().slice(0, CHUNK_MAX_TOKENS * 4),
        speaker: null,
        startTime: null,
        endTime: null,
        chunkIndex: 0,
      },
    ];
  }

  const result = chunks as TextChunk[] & { detectedStructure: TextStructureType };
  result.detectedStructure = structure;
  return result;
}
