"use client";

import { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, MessageSquareText } from "lucide-react";

interface TranscriptViewerProps {
  transcript: string;
  speakerMap?: Record<string, string>;
}

const SPEAKER_STYLES = [
  { badge: "text-blue-700 bg-blue-50 border-blue-200", bar: "bg-blue-400" },
  { badge: "text-emerald-700 bg-emerald-50 border-emerald-200", bar: "bg-emerald-400" },
  { badge: "text-purple-700 bg-purple-50 border-purple-200", bar: "bg-purple-400" },
  { badge: "text-orange-700 bg-orange-50 border-orange-200", bar: "bg-orange-400" },
  { badge: "text-pink-700 bg-pink-50 border-pink-200", bar: "bg-pink-400" },
  { badge: "text-cyan-700 bg-cyan-50 border-cyan-200", bar: "bg-cyan-400" },
];

export function TranscriptViewer({
  transcript,
  speakerMap,
}: TranscriptViewerProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Parse transcript into speaker segments
  const segments = useMemo(() => {
    const speakerRegex = /\[([^\]]+)\]:\s*/g;
    const parts: Array<{ speaker: string | null; text: string }> = [];

    // Collect all label positions in one pass
    const labels: Array<{ speaker: string; start: number; contentStart: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = speakerRegex.exec(transcript)) !== null) {
      labels.push({
        speaker: m[1],
        start: m.index,
        contentStart: m.index + m[0].length,
      });
    }

    if (labels.length === 0) {
      return [{ speaker: null, text: transcript }];
    }

    // Text before first label
    if (labels[0].start > 0) {
      const before = transcript.slice(0, labels[0].start).trim();
      if (before) parts.push({ speaker: null, text: before });
    }

    // Build segments from label positions
    for (let i = 0; i < labels.length; i++) {
      const endIndex = i + 1 < labels.length ? labels[i + 1].start : transcript.length;
      const speakerName = speakerMap?.[labels[i].speaker] ?? labels[i].speaker;
      const text = transcript.slice(labels[i].contentStart, endIndex).trim();
      if (text) {
        parts.push({ speaker: speakerName, text });
      }
    }

    return parts;
  }, [transcript, speakerMap]);

  // Build speaker -> style map
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

  // Filter segments by search
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
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Full Transcript</CardTitle>
          </div>
          <div className="relative w-64">
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
