import type { ReviewedUtterance, SpeakerMap } from "@/types/database";

/**
 * Build review utterances from `transcript_full` (`[Speaker A]: text` blocks)
 * when `reviewed_utterances` has not been saved yet.
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
