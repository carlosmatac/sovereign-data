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

// Assign consistent colors to speakers
const SPEAKER_COLORS = [
  "text-blue-700 bg-blue-50 border-blue-200",
  "text-emerald-700 bg-emerald-50 border-emerald-200",
  "text-purple-700 bg-purple-50 border-purple-200",
  "text-orange-700 bg-orange-50 border-orange-200",
  "text-pink-700 bg-pink-50 border-pink-200",
  "text-cyan-700 bg-cyan-50 border-cyan-200",
];

export function TranscriptViewer({
  transcript,
  speakerMap,
}: TranscriptViewerProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Parse transcript into speaker segments
  const segments = useMemo(() => {
    // Try to parse speaker-labeled transcript: "[Speaker A]: text"
    const speakerRegex = /\[([^\]]+)\]:\s*/g;
    const parts: Array<{ speaker: string | null; text: string }> = [];

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = speakerRegex.exec(transcript)) !== null) {
      // Text before this speaker label (if any)
      if (match.index > lastIndex && parts.length === 0) {
        const beforeText = transcript.slice(lastIndex, match.index).trim();
        if (beforeText) {
          parts.push({ speaker: null, text: beforeText });
        }
      }

      // Find the end: either the next speaker label or end of string
      const nextMatch = speakerRegex.exec(transcript);
      const endIndex = nextMatch ? nextMatch.index : transcript.length;

      // Reset regex position to where we found nextMatch
      if (nextMatch) {
        speakerRegex.lastIndex = nextMatch.index;
      }

      const speakerLabel = match[1];
      const speakerName = speakerMap?.[speakerLabel] ?? speakerLabel;
      const text = transcript
        .slice(match.index + match[0].length, endIndex)
        .trim();

      if (text) {
        parts.push({ speaker: speakerName, text });
      }

      lastIndex = endIndex;
    }

    // If no speaker labels found, return as single block
    if (parts.length === 0) {
      return [{ speaker: null, text: transcript }];
    }

    return parts;
  }, [transcript, speakerMap]);

  // Build speaker -> color map
  const speakerColors = useMemo(() => {
    const map = new Map<string, string>();
    let colorIndex = 0;
    for (const seg of segments) {
      if (seg.speaker && !map.has(seg.speaker)) {
        map.set(seg.speaker, SPEAKER_COLORS[colorIndex % SPEAKER_COLORS.length]);
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
          <div className="space-y-4">
            {filteredSegments.map((seg, i) => {
              const colorClasses = seg.speaker
                ? speakerColors.get(seg.speaker) ?? ""
                : "";

              return (
                <div key={i} className="group">
                  {seg.speaker && (
                    <span
                      className={`mb-1 inline-block rounded-md border px-2 py-0.5 text-xs font-medium ${colorClasses}`}
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
