import { Mic, FileText, Video, FileIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type SourceTypeMeta = {
  label: string;
  /** Tailwind classes for the badge pill */
  badgeClass: string;
  Icon: LucideIcon;
};

const SOURCE_TYPE_MAP: Record<string, SourceTypeMeta> = {
  audio: {
    label: "Interview",
    badgeClass:
      "bg-indigo-500/15 text-indigo-400 border-indigo-500/25",
    Icon: Mic,
  },
  document: {
    label: "Document",
    badgeClass:
      "bg-amber-500/15 text-amber-400 border-amber-500/25",
    Icon: FileText,
  },
  video: {
    label: "Video",
    badgeClass:
      "bg-purple-500/15 text-purple-400 border-purple-500/25",
    Icon: Video,
  },
  text: {
    label: "Note",
    badgeClass:
      "bg-slate-500/15 text-slate-300 border-slate-500/25",
    Icon: FileIcon,
  },
};

const FALLBACK: SourceTypeMeta = SOURCE_TYPE_MAP.text;

export function getSourceTypeMeta(sourceType: string): SourceTypeMeta {
  return SOURCE_TYPE_MAP[sourceType] ?? FALLBACK;
}
