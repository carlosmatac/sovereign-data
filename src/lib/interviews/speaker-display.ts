import type { SpeakerMap } from "@/types/database";

/**
 * Map a speaker label as it appears inside transcript brackets (e.g. "Speaker A")
 * to the user-facing display name from `speaker_map`.
 *
 * Keys in `speaker_map` are stable diarization ids (e.g. "A"); values are display
 * strings. Transcript text keeps the bracket label from pipeline time (often
 * `Speaker ${id}`), so we match that pattern as well as the current map value.
 */
export function resolveTranscriptBracketLabel(
  labelFromTranscript: string,
  map: SpeakerMap | Record<string, string> | undefined
): string {
  if (!map || Object.keys(map).length === 0) {
    return labelFromTranscript;
  }

  if (map[labelFromTranscript] !== undefined) {
    return map[labelFromTranscript];
  }

  for (const [code, displayName] of Object.entries(map)) {
    if (displayName === labelFromTranscript) {
      return displayName;
    }
    if (`Speaker ${code}` === labelFromTranscript) {
      return displayName;
    }
  }

  return labelFromTranscript;
}

/**
 * Build label→code entries for parsing `[label]:` blocks back to stable speaker codes.
 */
export function buildSpeakerLabelToCodeMap(
  speakerMap: SpeakerMap | Record<string, string>
): Map<string, string> {
  const labelToCode = new Map<string, string>();
  for (const [code, label] of Object.entries(speakerMap)) {
    labelToCode.set(label, code);
    labelToCode.set(`Speaker ${code}`, code);
  }
  return labelToCode;
}
