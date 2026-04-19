import type { ReviewedUtterance, SourceUtterance, SpeakerMap } from "@/types/database";
import { normalizeTranscriptDisplay } from "@/lib/transcript/normalizeDisplay";
import { buildSpeakerLabelToCodeMap } from "@/lib/interviews/speaker-display";
import {
  detectTextStructure,
  type TextStructureType,
} from "@/lib/ai/chunking-text-interview";

/**
 * Build `[Speaker label]: text` blocks from utterance rows (inverse of
 * {@link parseTranscriptFullToUtterances}). Used after human review reprocessing
 * to refresh `transcript_display` and the interview detail transcript viewer.
 */
export function formatUtterancesToTranscriptFull(
  utterances: Array<{ speaker: string; text: string }>,
  speakerMap: SpeakerMap
): string {
  return utterances
    .map((u) => {
      const label = speakerMap[u.speaker] ?? u.speaker;
      return `[${label}]: ${u.text}`;
    })
    .join("\n\n");
}

/** Bracket-formatted string for the interview detail transcript when intel is from human review. */
export function resolveTranscriptTextForInterviewViewer(params: {
  transcript_full: string | null;
  transcript_display: string | null;
  reviewed_utterances: unknown;
  last_intel_source: string | null;
  speaker_map: SpeakerMap;
  interviewee_name: string | null;
  interviewee_org: string | null;
}): string | null {
  if (params.last_intel_source === "human_review") {
    if (params.transcript_display?.trim()) {
      return params.transcript_display;
    }
    const utterances = params.reviewed_utterances;
    if (!Array.isArray(utterances) || utterances.length === 0) {
      return params.transcript_full;
    }
    const parsed: Array<{ speaker: string; text: string }> = [];
    for (const row of utterances) {
      if (typeof row !== "object" || row === null) return params.transcript_full;
      const o = row as Record<string, unknown>;
      if (typeof o.speaker !== "string" || typeof o.text !== "string") {
        return params.transcript_full;
      }
      parsed.push({ speaker: o.speaker, text: o.text });
    }
    const formatted = formatUtterancesToTranscriptFull(parsed, params.speaker_map);
    return normalizeTranscriptDisplay(formatted, {
      intervieweeName: params.interviewee_name,
      intervieweeOrg: params.interviewee_org,
    }).transcriptDisplay;
  }
  return params.transcript_full;
}

/**
 * Convert immutable ASR rows (milliseconds) into review rows (**seconds**)
 * for the editor and HTML audio playback. Order matches `transcript_full`
 * when both come from the same AssemblyAI run.
 */
export function sourceUtterancesToReviewedUtterances(
  rows: SourceUtterance[]
): ReviewedUtterance[] {
  return rows.map((u) => ({
    speaker: u.speaker,
    text: u.text,
    start: u.start / 1000,
    end: u.end / 1000,
  }));
}

/**
 * Legacy fallback: build review utterances from `transcript_full` only when
 * `source_utterances` is unavailable. Assigns **synthetic** equal time slots
 * over `audio_duration` — not real diarization timing; audio playback will
 * not match ASR boundaries.
 */
export function parseTranscriptFullToUtterances(
  transcriptFull: string,
  speakerMap: SpeakerMap,
  audioDurationSeconds: number | null
): ReviewedUtterance[] {
  const labelToCode = buildSpeakerLabelToCodeMap(speakerMap);

  const blocks = transcriptFull.trim().split(/\n\n+/);
  const parsedBlocks = blocks.filter((b) => {
    const t = b.trim();
    return /^\[[^\]]+\]\s*:/.test(t);
  });
  const n = Math.max(1, parsedBlocks.length);
  const totalSec =
    audioDurationSeconds != null && audioDurationSeconds > 0
      ? audioDurationSeconds
      : n * 30;
  const slot = totalSec / n;

  const out: ReviewedUtterance[] = [];
  let i = 0;
  for (const block of blocks) {
    const trimmed = block.trim();
    const m = trimmed.match(/^\[([^\]]+)\]\s*:\s*([\s\S]*)$/);
    if (!m) continue;
    const label = m[1];
    const text = m[2].trim();
    if (!text) continue;
    const speaker = labelToCode.get(label) ?? label;
    const start = i * slot;
    const end = (i + 1) * slot;
    i++;
    out.push({ speaker, text, start, end });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Text-source review (PR3 follow-up): build editable utterances from
// `transcript_full` for `source_type='text'` (and any future no-audio source
// such as `document`) when `source_utterances` is unavailable.
//
// Mirrors the structure detection used by `chunkTextInterview` so the editor
// shows the same logical units the chunker will see on reprocess. Times are
// synthetic equal slots (1 second per utterance) — text sources have no
// audio playback (`chunkAudioEnabled` is false in the editor) and the search
// rail position calculations are character-length based, not time based, so
// real timestamps are unnecessary.
// ──────────────────────────────────────────────────────────────────────────

const QA_LINE_RE = /^(Q|P|Pregunta|Question)\s*:/i;
const ANSWER_LINE_RE = /^(A|R|Respuesta|Answer)\s*:/i;
const SPEAKER_LINE_RE =
  /^[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñA-ZÁÉÍÓÚÜÑ]{1,}(\s[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñA-ZÁÉÍÓÚÜÑ]+)*\s*:/;

const QA_SPEAKER_MAP: SpeakerMap = { Q: "Question", A: "Answer" };
const PARAGRAPH_SPEAKER_MAP: SpeakerMap = { P: "Paragraph" };

export type TextReviewParseResult = {
  utterances: ReviewedUtterance[];
  /**
   * Speaker codes the parser introduced (Q/A/P/<name>) mapped to user-facing
   * labels. Caller should overlay these onto `interview.speaker_map` so the
   * existing speakerMap-based UI keeps working without any UI branch on
   * source_type.
   */
  speakerMap: SpeakerMap;
  /** Structure used (auto-detected when no hint is supplied). */
  detectedStructure: TextStructureType;
};

function emptyResult(structure: TextStructureType): TextReviewParseResult {
  return { utterances: [], speakerMap: {}, detectedStructure: structure };
}

function pushUtterance(
  out: ReviewedUtterance[],
  speaker: string,
  text: string
): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const start = out.length;
  out.push({ speaker, text: trimmed, start, end: start + 1 });
}

function parseQaUtterances(text: string): ReviewedUtterance[] {
  const lines = text.split("\n");
  const out: ReviewedUtterance[] = [];
  let currentSpeaker: "Q" | "A" | null = null;
  let buffer = "";
  let sawQaMarker = false;

  const flush = () => {
    if (currentSpeaker && buffer.trim()) {
      pushUtterance(out, currentSpeaker, buffer);
    }
    buffer = "";
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      // Blank line inside a Q-block ⇒ start of an answer paragraph if we are
      // still in the Q. Otherwise it is just whitespace inside the same A.
      if (currentSpeaker === "Q" && buffer.trim()) {
        flush();
        currentSpeaker = "A";
      } else {
        buffer += "\n";
      }
      continue;
    }

    if (QA_LINE_RE.test(trimmed)) {
      flush();
      currentSpeaker = "Q";
      buffer = trimmed.replace(QA_LINE_RE, "").trim();
      sawQaMarker = true;
      continue;
    }

    if (ANSWER_LINE_RE.test(trimmed)) {
      flush();
      currentSpeaker = "A";
      buffer = trimmed.replace(ANSWER_LINE_RE, "").trim();
      sawQaMarker = true;
      continue;
    }

    if (currentSpeaker === null) {
      // Pre-amble before the first Q — treat as A so it is still editable.
      currentSpeaker = "A";
    }
    buffer += (buffer ? " " : "") + trimmed;
  }
  flush();

  // If the hint said QA but no Q/A markers actually appeared, signal "no
  // useful QA structure" so the caller can fall back to paragraph parsing.
  return sawQaMarker ? out : [];
}

function parseSpeakerTranscriptUtterances(text: string): {
  utterances: ReviewedUtterance[];
  speakerMap: SpeakerMap;
} {
  const lines = text.split("\n");
  const out: ReviewedUtterance[] = [];
  const speakerMap: SpeakerMap = {};
  let currentSpeaker: string | null = null;
  let buffer = "";

  const flush = () => {
    if (currentSpeaker && buffer.trim()) {
      pushUtterance(out, currentSpeaker, buffer);
      speakerMap[currentSpeaker] = currentSpeaker;
    }
    buffer = "";
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      buffer += " ";
      continue;
    }

    if (SPEAKER_LINE_RE.test(trimmed)) {
      flush();
      const colonIdx = trimmed.indexOf(":");
      currentSpeaker = trimmed.slice(0, colonIdx).trim();
      buffer = trimmed.slice(colonIdx + 1).trim();
      continue;
    }

    if (currentSpeaker === null) {
      // Pre-amble before any speaker line — keep visible under a generic code.
      currentSpeaker = "P";
    }
    buffer += (buffer ? " " : "") + trimmed;
  }
  flush();

  if (speakerMap.P) speakerMap.P = "Paragraph";
  return { utterances: out, speakerMap };
}

function parseParagraphUtterances(text: string): ReviewedUtterance[] {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  const out: ReviewedUtterance[] = [];
  for (const para of paragraphs) {
    pushUtterance(out, "P", para.replace(/\s+/g, " "));
  }
  return out;
}

/**
 * Build review-shaped utterances from a plain-text source (no AssemblyAI
 * diarization). Used by the transcript review page when `source_type` has no
 * `source_utterances` row (i.e. `text` and `document`).
 */
export function parseTextInterviewToUtterances(
  text: string,
  structureHint?: TextStructureType
): TextReviewParseResult {
  if (!text || !text.trim()) {
    return emptyResult(structureHint ?? "freeform");
  }
  const structure = structureHint ?? detectTextStructure(text);

  switch (structure) {
    case "qa_structured": {
      const utterances = parseQaUtterances(text);
      if (utterances.length === 0) {
        // Fall through to paragraph parsing if Q/A detection produced nothing.
        const paragraphs = parseParagraphUtterances(text);
        return {
          utterances: paragraphs,
          speakerMap: paragraphs.length > 0 ? { ...PARAGRAPH_SPEAKER_MAP } : {},
          detectedStructure: "article_style",
        };
      }
      return {
        utterances,
        speakerMap: { ...QA_SPEAKER_MAP },
        detectedStructure: structure,
      };
    }
    case "speaker_transcript": {
      const { utterances, speakerMap } =
        parseSpeakerTranscriptUtterances(text);
      if (utterances.length === 0) {
        const paragraphs = parseParagraphUtterances(text);
        return {
          utterances: paragraphs,
          speakerMap: paragraphs.length > 0 ? { ...PARAGRAPH_SPEAKER_MAP } : {},
          detectedStructure: "article_style",
        };
      }
      return {
        utterances,
        speakerMap,
        detectedStructure: structure,
      };
    }
    case "article_style":
    case "freeform":
    default: {
      const utterances = parseParagraphUtterances(text);
      if (utterances.length === 0) {
        // Single-line text with no paragraph breaks — keep it as one utterance.
        const single: ReviewedUtterance[] = [];
        pushUtterance(single, "P", text);
        return {
          utterances: single,
          speakerMap: single.length > 0 ? { ...PARAGRAPH_SPEAKER_MAP } : {},
          detectedStructure: structure,
        };
      }
      return {
        utterances,
        speakerMap: { ...PARAGRAPH_SPEAKER_MAP },
        detectedStructure: structure,
      };
    }
  }
}
