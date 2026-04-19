"use client";

import { useState, useMemo, type ReactNode } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, MessageSquareText } from "lucide-react";
import { resolveTranscriptBracketLabel } from "@/lib/interviews/speaker-display";
import { cn } from "@/lib/utils";

interface TranscriptViewerProps {
  transcriptRaw: string;
  speakerMap?: Record<string, string>;
  actions?: ReactNode;
}

/**
 * Flat, muted speaker surfaces — no gradients, no blur, no shadows.
 * Each variant is a single tonal bg + a 2px pastel left accent + a quiet
 * speaker label. Palette is desaturated so the transcript feels calm and
 * premium rather than institutional.
 */
const SPEAKER_VARIANTS = [
  {
    // Soft blue — primary speaker
    block: cn(
      "rounded-[10px] border border-[rgba(147,147,147,0.10)] bg-[rgba(91,156,246,0.055)]",
      "border-l-2 border-l-[rgba(91,156,246,0.45)]",
      "py-3 pl-4 pr-4"
    ),
    label: "text-[11.5px] font-semibold tracking-[-0.005em] text-[#8EB6F3]",
  },
  {
    // Soft slate — neutral secondary speaker
    block: cn(
      "rounded-[10px] border border-[rgba(147,147,147,0.10)] bg-white/[0.028]",
      "border-l-2 border-l-white/25",
      "py-3 pl-4 pr-4"
    ),
    label: "text-[11.5px] font-semibold tracking-[-0.005em] text-white/70",
  },
  {
    // Soft mauve — third speaker / host
    block: cn(
      "rounded-[10px] border border-[rgba(147,147,147,0.10)] bg-[rgba(167,139,250,0.045)]",
      "border-l-2 border-l-[rgba(167,139,250,0.40)]",
      "py-3 pl-4 pr-4"
    ),
    label: "text-[11.5px] font-semibold tracking-[-0.005em] text-[#B8A5F6]",
  },
] as const;

/**
 * Read-only transcript with search. The parent passes the string to show: usually
 * `transcript_full` (immutable ASR), or after human review reprocessing the
 * reviewed display built from `reviewed_utterances` (stored as `transcript_display`).
 */
export function TranscriptViewer({
  transcriptRaw,
  speakerMap,
  actions,
}: TranscriptViewerProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const segments = useMemo(() => {
    type Label = { speaker: string; start: number; contentStart: number };

    function buildSegments(
      text: string,
      labels: Label[],
      nameMap?: Record<string, string>
    ): Array<{ speaker: string | null; text: string }> {
      const parts: Array<{ speaker: string | null; text: string }> = [];

      if (labels[0].start > 0) {
        const before = text.slice(0, labels[0].start).trim();
        if (before) parts.push({ speaker: null, text: before });
      }

      for (let i = 0; i < labels.length; i++) {
        const endIndex =
          i + 1 < labels.length ? labels[i + 1].start : text.length;
        const speakerName = resolveTranscriptBracketLabel(
          labels[i].speaker,
          nameMap
        );
        const chunk = text.slice(labels[i].contentStart, endIndex).trim();
        if (chunk) parts.push({ speaker: speakerName, text: chunk });
      }

      return parts;
    }

    const bracketRegex = /\[([^\]]+)\]:\s*/g;
    const bracketLabels: Label[] = [];
    let m: RegExpExecArray | null;
    while ((m = bracketRegex.exec(transcriptRaw)) !== null) {
      bracketLabels.push({
        speaker: m[1],
        start: m.index,
        contentStart: m.index + m[0].length,
      });
    }
    if (bracketLabels.length > 0) {
      return buildSegments(transcriptRaw, bracketLabels, speakerMap);
    }

    const lineRegex =
      /^([A-Z][A-Za-z\u00C0-\u017E]*(?:[ \t]+[A-Za-z\u00C0-\u017E.'-]+){0,4}):\s+(?=[A-Za-z\u00C0-\u017E"'\u201C\u2018])/gm;
    const lineLabels: Label[] = [];
    while ((m = lineRegex.exec(transcriptRaw)) !== null) {
      lineLabels.push({
        speaker: m[1].trim(),
        start: m.index,
        contentStart: m.index + m[0].length,
      });
    }

    const distinctSpeakers = new Set(lineLabels.map((l) => l.speaker));
    if (lineLabels.length >= 3 && distinctSpeakers.size >= 2) {
      return buildSegments(transcriptRaw, lineLabels);
    }

    const paragraphs = transcriptRaw
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (paragraphs.length > 1) {
      return paragraphs.map((text) => ({ speaker: null, text }));
    }

    return [{ speaker: null, text: transcriptRaw }];
  }, [transcriptRaw, speakerMap]);

  const speakerVariants = useMemo(() => {
    const map = new Map<string, (typeof SPEAKER_VARIANTS)[number]>();
    let i = 0;
    for (const seg of segments) {
      if (seg.speaker && !map.has(seg.speaker)) {
        map.set(seg.speaker, SPEAKER_VARIANTS[i % SPEAKER_VARIANTS.length]);
        i++;
      }
    }
    return map;
  }, [segments]);

  const filteredSegments = useMemo(() => {
    if (!searchQuery.trim()) return segments;
    const q = searchQuery.toLowerCase();
    return segments.filter(
      (seg) =>
        seg.text.toLowerCase().includes(q) ||
        seg.speaker?.toLowerCase().includes(q)
    );
  }, [segments, searchQuery]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <MessageSquareText className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Full Transcript</CardTitle>
            {actions}
          </div>
          <div className="relative w-64 shrink-0">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search transcript..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] rounded-[10px] border border-[rgba(147,147,147,0.10)] bg-transparent p-4">
          <div className="space-y-2.5">
            {filteredSegments.map((seg, i) => {
              const variant = seg.speaker
                ? speakerVariants.get(seg.speaker)
                : undefined;

              return (
                <div
                  key={i}
                  className={
                    variant
                      ? cn("group", variant.block)
                      : "group rounded-[10px] border border-[rgba(147,147,147,0.08)] bg-white/[0.018] px-4 py-3"
                  }
                >
                  {seg.speaker && variant && (
                    <p className={cn("mb-1.5", variant.label)}>{seg.speaker}</p>
                  )}
                  <p className="text-[13.5px] leading-[1.65] text-white/78">
                    {searchQuery ? (
                      <HighlightText
                        text={seg.text}
                        highlight={searchQuery}
                      />
                    ) : (
                      seg.text
                    )}
                  </p>
                </div>
              );
            })}
            {filteredSegments.length === 0 && searchQuery && (
              <p className="py-8 text-center text-sm text-white/40">
                No matches found for &ldquo;{searchQuery}&rdquo;
              </p>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function HighlightText({
  text,
  highlight,
}: {
  text: string;
  highlight: string;
}) {
  if (!highlight.trim()) return <>{text}</>;

  const regex = new RegExp(
    `(${highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
    "gi"
  );
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark
            key={i}
            className="rounded-sm bg-amber-400/18 px-0.5 text-white/90"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
