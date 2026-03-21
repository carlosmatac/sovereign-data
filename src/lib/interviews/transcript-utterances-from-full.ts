import type { ReviewedUtterance, SourceUtterance, SpeakerMap } from "@/types/database";
import { normalizeTranscriptDisplay } from "@/lib/transcript/normalizeDisplay";

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
  const labelToCode = new Map<string, string>();
  for (const [code, label] of Object.entries(speakerMap)) {
    labelToCode.set(label, code);
  }

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
