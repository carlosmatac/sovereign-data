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
 * Layered dark surfaces: soft gradient, inset highlight, light shadow — depth without
 * saturated fills. Each variant reads as a distinct “tone” for speaker separation.
 */
const SPEAKER_VARIANTS = [
  {
    block: cn(
      "rounded-xl border border-border/45 py-2.5 pl-3.5 pr-3",
      "border-l-[3px] border-l-primary/28",
      "bg-gradient-to-br from-primary/[0.09] via-card/55 to-card/[0.22]",
      "shadow-sm shadow-black/15 ring-1 ring-inset ring-white/[0.06]",
      "backdrop-blur-[2px]",
      "dark:border-border/35 dark:from-primary/[0.065] dark:via-card/42 dark:to-card/[0.18] dark:shadow-black/35"
    ),
    badge: cn(
      "mb-1.5 inline-block rounded-md border border-border/40 px-2 py-0.5 text-xs font-medium",
      "bg-background/50 text-foreground/90 shadow-sm ring-1 ring-inset ring-white/[0.05]",
      "dark:bg-background/25 dark:text-foreground/88"
    ),
  },
  {
    block: cn(
      "rounded-xl border border-border/45 py-2.5 pl-3.5 pr-3",
      "border-l-[3px] border-l-foreground/16",
      "bg-gradient-to-br from-muted/30 via-card/50 to-card/[0.2]",
      "shadow-sm shadow-black/12 ring-1 ring-inset ring-white/[0.05]",
      "backdrop-blur-[2px]",
      "dark:border-border/35 dark:from-muted/18 dark:via-card/38 dark:to-card/[0.15] dark:shadow-black/32"
    ),
    badge: cn(
      "mb-1.5 inline-block rounded-md border border-border/40 px-2 py-0.5 text-xs font-medium",
      "bg-background/45 text-foreground/88 shadow-sm ring-1 ring-inset ring-white/[0.045]",
      "dark:bg-background/22 dark:text-foreground/86"
    ),
  },
  {
    block: cn(
      "rounded-xl border border-border/45 py-2.5 pl-3.5 pr-3",
      "border-l-[3px] border-l-muted-foreground/42",
      "bg-gradient-to-br from-secondary/[0.14] via-card/48 to-muted/[0.12]",
      "shadow-sm shadow-black/12 ring-1 ring-inset ring-white/[0.055]",
      "backdrop-blur-[2px]",
      "dark:border-border/35 dark:from-secondary/[0.1] dark:via-card/36 dark:to-muted/[0.1] dark:shadow-black/30"
    ),
    badge: cn(
      "mb-1.5 inline-block rounded-md border border-border/40 px-2 py-0.5 text-xs font-medium",
      "bg-background/48 text-foreground/87 shadow-sm ring-1 ring-inset ring-white/[0.05]",
      "dark:bg-background/24 dark:text-foreground/85"
    ),
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
        <ScrollArea className="h-[500px] rounded-md border border-border/50 bg-muted/5 p-4 dark:bg-muted/[0.04]">
          <div className="space-y-3.5">
            {filteredSegments.map((seg, i) => {
              const variant = seg.speaker
                ? speakerVariants.get(seg.speaker)
                : undefined;

              return (
                <div
                  key={i}
                  className={variant ? cn("group", variant.block) : "group"}
                >
                  {seg.speaker && variant && (
                    <span className={variant.badge}>{seg.speaker}</span>
                  )}
                  <p className="text-sm leading-relaxed text-foreground/90">
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
              <p className="py-8 text-center text-sm text-muted-foreground">
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
            className="rounded-sm bg-amber-500/14 px-0.5 text-foreground dark:bg-amber-400/10"
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
