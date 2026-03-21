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

interface TranscriptViewerProps {
  transcriptRaw: string;
  speakerMap?: Record<string, string>;
  actions?: ReactNode;
}

const SPEAKER_STYLES = [
  { badge: "text-blue-700 bg-blue-50 border-blue-200", bar: "bg-blue-400" },
  { badge: "text-emerald-700 bg-emerald-50 border-emerald-200", bar: "bg-emerald-400" },
  { badge: "text-purple-700 bg-purple-50 border-purple-200", bar: "bg-purple-400" },
  { badge: "text-orange-700 bg-orange-50 border-orange-200", bar: "bg-orange-400" },
  { badge: "text-pink-700 bg-pink-50 border-pink-200", bar: "bg-pink-400" },
  { badge: "text-cyan-700 bg-cyan-50 border-cyan-200", bar: "bg-cyan-400" },
];

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

  const speakerStyles = useMemo(() => {
    const map = new Map<string, (typeof SPEAKER_STYLES)[0]>();
    let colorIndex = 0;
    for (const seg of segments) {
      if (seg.speaker && !map.has(seg.speaker)) {
        map.set(seg.speaker, SPEAKER_STYLES[colorIndex % SPEAKER_STYLES.length]);
        colorIndex++;
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
        <ScrollArea className="h-[500px] rounded-md border p-4">
          <div className="space-y-3">
            {filteredSegments.map((seg, i) => {
              const style = seg.speaker
                ? speakerStyles.get(seg.speaker)
                : undefined;

              return (
                <div
                  key={i}
                  className={`group rounded-md ${
                    style ? `border-l-[3px] ${style.bar} pl-3 py-1` : ""
                  }`}
                >
                  {seg.speaker && style && (
                    <span
                      className={`mb-1.5 inline-block rounded-md border px-2 py-0.5 text-xs font-semibold ${style.badge}`}
                    >
                      {seg.speaker}
                    </span>
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
          <mark key={i} className="rounded-sm bg-yellow-200 px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
