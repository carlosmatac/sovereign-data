/**
 * Interview source-type metadata.
 *
 * `source_type` (`audio` | `document` | `text` | `video`) governs both:
 *   - which icon belongs in the leading IconWell on row UIs
 *   - which colour-coded source pill we render alongside duration/status,
 *     so users can tell *what kind of source* an interview comes from
 *     even when no duration is present (document/text uploads have no
 *     audio — see `docs/features/done/interview-transcript-review.md`).
 *
 * Discipline:
 *   - One label, one icon, one accent per source type. Never per row.
 *   - Accents are pulled from the existing Sovereign palette family
 *     (emerald / violet / amber) — restrained, not loud.
 *   - The pill consumes the hex through the standard `SectionChip`
 *     `tone="accent"` recipe (bg @ 18%, border @ 50%, text @ 80%) so the
 *     visual contract matches every other tonal pill in the system
 *     (network filter chips, region pills, status pills).
 *   - Unknown source types fall back to the neutral slate accent so the
 *     UI never breaks on an enum that gets added without updating this
 *     mapping; the row still renders.
 *
 * Reusable: import from anywhere that needs to render the same chip.
 */

import { FileText, Mic, Video, type LucideIcon } from "lucide-react";

import type { SourceType } from "@/types/database";

export interface InterviewSourceMeta {
  /** Short human label used in the source pill. */
  label: string;
  /** Accent hex used by SectionChip / icon tinting. */
  color: string;
  /** Lucide icon used in the leading IconWell. */
  Icon: LucideIcon;
}

const SOURCE_META: Record<SourceType, InterviewSourceMeta> = {
  audio: {
    label: "Audio",
    color: "#34D399", // emerald — voice / live recording family
    Icon: Mic,
  },
  document: {
    label: "Transcript",
    color: "#A78BFA", // violet — text / document family
    Icon: FileText,
  },
  text: {
    // `text` (pasted-in transcripts) shares the document/transcript family:
    // no audio, transcript-only, same icon and accent. Kept as a separate
    // entry rather than aliased so future divergence is trivial.
    label: "Transcript",
    color: "#A78BFA",
    Icon: FileText,
  },
  video: {
    label: "Video",
    color: "#FB923C", // orange — moving picture / media family
    Icon: Video,
  },
};

const FALLBACK_META: InterviewSourceMeta = {
  label: "Source",
  color: "#94A3B8",
  Icon: FileText,
};

/**
 * Returns label / color / icon for the given source type.
 * Always returns a value — falls back to a neutral slate "Source" entry.
 */
export function interviewSourceMeta(
  source: SourceType | string | null | undefined
): InterviewSourceMeta {
  if (!source) return FALLBACK_META;
  return SOURCE_META[source as SourceType] ?? FALLBACK_META;
}
