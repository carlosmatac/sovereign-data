"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pause,
  Play,
  Plus,
  Save,
  Search,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type {
  EntityType,
  InterviewStatus,
  ReviewedUtterance,
  SourceType,
  TranscriptReviewStatus,
} from "@/types/database";
import type { SpeakerMap } from "@/types/database";
import {
  saveTranscriptReviewDraft,
  markInterviewReviewReady,
  addReviewSeedFromEntity,
  createReviewSeedEntity,
  removeReviewSeedEntity,
} from "@/app/actions/interview-review";
import { cn } from "@/lib/utils";

/** Match status-tracker: background poll when review reprocessing is active (no pipeline UI on this page). */
const PIPELINE_POLL_MS = 10_000;

const CHUNK_END_EPSILON_SEC = 0.06;

function isValidChunkTimeRange(u: ReviewedUtterance): boolean {
  return (
    Number.isFinite(u.start) &&
    Number.isFinite(u.end) &&
    u.start >= 0 &&
    u.end > u.start
  );
}

function replaceAllNonOverlappingInsensitive(
  haystack: string,
  needle: string,
  replacement: string
): string {
  if (!needle) return haystack;
  const hLower = haystack.toLowerCase();
  const nLower = needle.toLowerCase();
  let result = "";
  let i = 0;
  while (i < haystack.length) {
    const found = hLower.indexOf(nLower, i);
    if (found === -1) {
      result += haystack.slice(i);
      break;
    }
    result += haystack.slice(i, found) + replacement;
    i = found + needle.length;
  }
  return result;
}

/** One search hit in document order (case-insensitive). */
type TextMatchOccurrence = {
  utteranceIndex: number;
  start: number;
  end: number;
  globalIndex: number;
};

function buildFlatMatches(
  utterances: ReviewedUtterance[],
  needle: string
): TextMatchOccurrence[] {
  if (!needle) return [];
  const nLower = needle.toLowerCase();
  const out: TextMatchOccurrence[] = [];
  let g = 0;
  utterances.forEach((u, ui) => {
    const t = u.text;
    const lower = t.toLowerCase();
    let idx = 0;
    while (idx <= lower.length) {
      const found = lower.indexOf(nLower, idx);
      if (found === -1) break;
      const end = found + needle.length;
      out.push({ utteranceIndex: ui, start: found, end, globalIndex: g++ });
      idx = found + nLower.length;
    }
  });
  return out;
}

type HighlightSeg = { text: string; kind: "plain" | "dim" | "active" };

function buildHighlightSegments(
  text: string,
  occs: TextMatchOccurrence[],
  activeMatchGlobal: number
): HighlightSeg[] {
  if (occs.length === 0) return [{ text, kind: "plain" }];
  const sorted = [...occs].sort((a, b) => a.start - b.start);
  const segs: HighlightSeg[] = [];
  let cursor = 0;
  for (const o of sorted) {
    if (o.start > cursor) {
      segs.push({ text: text.slice(cursor, o.start), kind: "plain" });
    }
    const kind =
      activeMatchGlobal >= 0 && o.globalIndex === activeMatchGlobal ? "active" : "dim";
    segs.push({ text: text.slice(o.start, o.end), kind });
    cursor = o.end;
  }
  if (cursor < text.length) {
    segs.push({ text: text.slice(cursor), kind: "plain" });
  }
  return segs;
}

function HighlightedTranscriptTextarea({
  value,
  onChange,
  disabled,
  rows,
  utteranceIndex,
  occurrences,
  activeMatchGlobal,
  onRegisterTextarea,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  rows: number;
  utteranceIndex: number;
  occurrences: TextMatchOccurrence[];
  activeMatchGlobal: number;
  onRegisterTextarea: (i: number, el: HTMLTextAreaElement | null) => void;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const segments = useMemo(
    () => buildHighlightSegments(value, occurrences, activeMatchGlobal),
    [value, occurrences, activeMatchGlobal]
  );

  return (
    <div className="relative w-full min-w-0 rounded-md border border-input/80 bg-background shadow-xs">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]">
        <div
          className="break-words px-3 py-2 text-base leading-relaxed whitespace-pre-wrap"
          style={{ transform: `translateY(-${scrollTop}px)` }}
        >
          {segments.map((seg, idx) =>
            seg.kind === "plain" ? (
              <span key={idx}>{seg.text}</span>
            ) : seg.kind === "dim" ? (
              <mark
                key={idx}
                className="rounded-[3px] bg-amber-500/16 px-px text-inherit dark:bg-amber-400/12"
              >
                {seg.text}
              </mark>
            ) : (
              <mark
                key={idx}
                className="rounded-[3px] bg-amber-400/40 px-px font-medium text-inherit shadow-[inset_0_0_0_1px_rgba(217,119,6,0.35)] dark:bg-amber-500/35 dark:shadow-[inset_0_0_0_1px_rgba(251,191,36,0.35)]"
              >
                {seg.text}
              </mark>
            )
          )}
        </div>
      </div>
      <textarea
        ref={(el) => onRegisterTextarea(utteranceIndex, el)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={rows}
        spellCheck={false}
        className={cn(
          "relative z-10 min-h-[5.5rem] w-full resize-y border-0 bg-transparent px-3 py-2 text-base leading-relaxed text-transparent caret-foreground shadow-none",
          "selection:bg-primary/20",
          "focus-visible:ring-0 focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
        style={{ WebkitTextFillColor: "transparent" }}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        aria-label="Transcript segment text"
      />
    </div>
  );
}

const ENTITY_TYPES: EntityType[] = [
  "PERSON",
  "COMPANY",
  "GOVERNMENT",
  "ORGANIZATION",
  "LOCATION",
  "EVENT",
];

export type ReviewSeedRow = {
  id: string;
  display_name: string;
  entity_type: EntityType;
  entity_id: string | null;
};

type Props = {
  interviewId: string;
  projectId: string;
  interviewTitle: string;
  speakerMap: SpeakerMap;
  initialUtterances: ReviewedUtterance[];
  reviewStatus: TranscriptReviewStatus;
  lastIntelSource: string | null;
  seeds: ReviewSeedRow[];
  parseWarning?: string | null;
  sourceType: SourceType;
  audioUrl: string | null;
};

export function TranscriptReviewEditor({
  interviewId,
  projectId,
  interviewTitle,
  speakerMap,
  initialUtterances,
  reviewStatus,
  lastIntelSource,
  seeds,
  parseWarning,
  sourceType,
  audioUrl,
}: Props) {
  const router = useRouter();
  const [utterances, setUtterances] = useState<ReviewedUtterance[]>(initialUtterances);
  const [pending, startTransition] = useTransition();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{ id: string; name: string; type: string }>
  >([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createType, setCreateType] = useState<EntityType>("COMPANY");
  const [reprocessStarting, setReprocessStarting] = useState(false);
  const lastPipelineStatusRef = useRef<InterviewStatus | null>(null);
  const sharedAudioRef = useRef<HTMLAudioElement | null>(null);
  const segmentEndRef = useRef<number>(0);
  const [playingChunkIndex, setPlayingChunkIndex] = useState<number | null>(null);
  const [audioPaused, setAudioPaused] = useState(true);
  const [activeClipTime, setActiveClipTime] = useState<number | null>(null);
  const [transcriptFind, setTranscriptFind] = useState("");
  const [transcriptReplace, setTranscriptReplace] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1);
  const [searchEpoch, setSearchEpoch] = useState(0);
  const utteranceRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const textareaRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());
  const flatMatchesRef = useRef<TextMatchOccurrence[]>([]);
  const prevNeedleRef = useRef<string>("");
  const focusMatchAfterNavRef = useRef(false);

  const chunkAudioEnabled =
    sourceType !== "document" && Boolean(audioUrl?.trim());
  // Utterances are not reset when `initialUtterances` props change (e.g. after router.refresh()
  // from seed actions) so unsaved transcript edits are preserved until Save or full page reload.

  const speakerLabel = useCallback(
    (code: string) => speakerMap[code] ?? `Speaker ${code}`,
    [speakerMap]
  );

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const flatMatches = useMemo(
    () => buildFlatMatches(utterances, transcriptFind),
    [utterances, transcriptFind]
  );
  const findReplaceMatchCount = flatMatches.length;
  flatMatchesRef.current = flatMatches;

  /** Vertical positions (0–100%) for match rail ticks, proportional to character span. */
  const findMatchRailMarkers = useMemo(() => {
    const needle = transcriptFind;
    if (!needle || flatMatches.length === 0) return [];
    const gap = 2;
    const totalWeight =
      utterances.reduce((s, u) => s + u.text.length, 0) +
      Math.max(0, utterances.length - 1) * gap;
    if (totalWeight <= 0) return [];

    return flatMatches.map((m) => {
      let pref = 0;
      for (let i = 0; i < m.utteranceIndex; i++) {
        pref += utterances[i].text.length + gap;
      }
      const center = m.start + needle.length / 2;
      const pos = pref + center;
      return {
        key: `g-${m.globalIndex}`,
        topPct: (pos / totalWeight) * 100,
        utteranceIndex: m.utteranceIndex,
        globalIndex: m.globalIndex,
      };
    });
  }, [utterances, transcriptFind, flatMatches]);

  useEffect(() => {
    const el = sharedAudioRef.current;
    if (!el || !chunkAudioEnabled) return;
    const onPlay = () => setAudioPaused(false);
    const onPause = () => setAudioPaused(true);
    const onEnded = () => {
      setPlayingChunkIndex(null);
      setAudioPaused(true);
    };
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
    };
  }, [chunkAudioEnabled, audioUrl]);

  useEffect(() => {
    const el = sharedAudioRef.current;
    if (!el || playingChunkIndex === null) return;
    const u = utterances[playingChunkIndex];
    if (!u || !isValidChunkTimeRange(u)) return;

    const onTimeUpdate = () => {
      const t = el.currentTime;
      setActiveClipTime(t);
      if (t >= segmentEndRef.current - CHUNK_END_EPSILON_SEC) {
        el.pause();
        setPlayingChunkIndex(null);
        setActiveClipTime(null);
      } else if (t < u.start - 0.05) {
        el.currentTime = u.start;
      }
    };
    el.addEventListener("timeupdate", onTimeUpdate);
    return () => el.removeEventListener("timeupdate", onTimeUpdate);
  }, [playingChunkIndex, utterances]);

  useEffect(() => {
    if (!searchOpen || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/entities/search?q=${encodeURIComponent(searchQuery.trim())}`
        );
        const json = await res.json();
        if (res.ok && Array.isArray(json.entities)) {
          setSearchResults(json.entities);
        } else {
          setSearchResults([]);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, searchOpen, projectId]);

  const reprocessing = reviewStatus === "reprocessing";
  const readyForReprocess = reviewStatus === "ready";
  const reprocessBusy = reprocessStarting || reprocessing;

  useEffect(() => {
    if (reprocessing) {
      const el = sharedAudioRef.current;
      el?.pause();
      setPlayingChunkIndex(null);
      setActiveClipTime(null);
    }
  }, [reprocessing]);

  useEffect(() => {
    if (reviewStatus !== "reprocessing") {
      lastPipelineStatusRef.current = null;
      return;
    }

    const applyPipelineStatus = (newStatus: InterviewStatus, err?: string | null) => {
      if (newStatus === lastPipelineStatusRef.current) return;
      lastPipelineStatusRef.current = newStatus;

      if (newStatus === "COMPLETED") {
        router.push(`/interviews/${interviewId}`);
        return;
      }
      if (newStatus === "FAILED") {
        if (err) toast.error(err);
        router.refresh();
      }
    };

    const poll = async () => {
      try {
        const res = await fetch(`/api/interviews/${interviewId}/poll`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          status?: InterviewStatus;
          error_message?: string | null;
        };
        if (data.status) {
          applyPipelineStatus(data.status, data.error_message ?? null);
        }
      } catch {
        /* poll is best-effort */
      }
    };

    void poll();
    const pollId = window.setInterval(poll, PIPELINE_POLL_MS);

    const supabase = createClient();
    const channel = supabase
      .channel(`interview-${interviewId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "interviews",
          filter: `id=eq.${interviewId}`,
        },
        (payload) => {
          const newStatus = payload.new.status as InterviewStatus;
          applyPipelineStatus(newStatus, payload.new.error_message as string | null);
        }
      )
      .subscribe();

    return () => {
      window.clearInterval(pollId);
      supabase.removeChannel(channel);
    };
  }, [reviewStatus, interviewId, router]);

  useEffect(() => {
    if (reviewStatus === "reprocessing") {
      setReprocessStarting(false);
    }
  }, [reviewStatus]);

  const onRunReprocess = async () => {
    setReprocessStarting(true);
    try {
      const res = await fetch(`/api/interviews/${interviewId}/reprocess-review`, {
        method: "POST",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(json.error ?? "Could not start reprocessing");
        setReprocessStarting(false);
        return;
      }
      toast.success("Reprocessing started — pipeline runs in the background.");
      router.refresh();
    } catch {
      toast.error("Could not start reprocessing");
      setReprocessStarting(false);
    }
  };

  const onSaveDraft = () => {
    startTransition(async () => {
      const r = await saveTranscriptReviewDraft(interviewId, utterances);
      if ("error" in r && r.error) toast.error(r.error);
      else {
        toast.success("Draft saved");
        router.refresh();
      }
    });
  };

  const onMarkReady = () => {
    startTransition(async () => {
      const r = await markInterviewReviewReady(interviewId);
      if ("error" in r && r.error) toast.error(r.error);
      else {
        toast.success("Marked ready for reprocessing");
        router.refresh();
      }
    });
  };

  const onPickEntity = (entityId: string) => {
    startTransition(async () => {
      const r = await addReviewSeedFromEntity(interviewId, entityId);
      if ("error" in r && r.error) toast.error(r.error);
      else {
        toast.success("Entity added");
        setSearchOpen(false);
        setSearchQuery("");
        router.refresh();
      }
    });
  };

  const onCreateEntity = () => {
    startTransition(async () => {
      const r = await createReviewSeedEntity(
        interviewId,
        projectId,
        createName,
        createType
      );
      if ("error" in r && r.error) toast.error(r.error);
      else {
        toast.success("Entity created and added");
        setCreateOpen(false);
        setCreateName("");
        router.refresh();
      }
    });
  };

  const onRemoveSeed = (seedId: string) => {
    startTransition(async () => {
      const r = await removeReviewSeedEntity(seedId, interviewId);
      if ("error" in r && r.error) toast.error(r.error);
      else {
        toast.success("Removed");
        router.refresh();
      }
    });
  };

  const updateText = (index: number, text: string) => {
    setUtterances((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], text };
      return next;
    });
  };

  const toggleChunkAudio = useCallback(
    (index: number) => {
      const el = sharedAudioRef.current;
      if (!el || !chunkAudioEnabled || reprocessing) return;
      const u = utterances[index];
      if (!isValidChunkTimeRange(u)) return;

      if (playingChunkIndex === index) {
        if (el.paused) {
          segmentEndRef.current = u.end;
          setActiveClipTime(el.currentTime);
          void el.play().catch(() => toast.error("Could not play audio"));
        } else {
          el.pause();
          setActiveClipTime(el.currentTime);
        }
        return;
      }

      segmentEndRef.current = u.end;
      el.pause();
      el.currentTime = u.start;
      setActiveClipTime(u.start);
      setPlayingChunkIndex(index);
      void el.play().catch(() => {
        toast.error("Could not play audio");
        setPlayingChunkIndex(null);
        setActiveClipTime(null);
      });
    },
    [chunkAudioEnabled, playingChunkIndex, utterances, reprocessing]
  );

  const seekWithinUtterance = useCallback(
    (index: number, rawTime: number) => {
      const el = sharedAudioRef.current;
      if (!el || !chunkAudioEnabled || reprocessing) return;
      const u = utterances[index];
      if (!isValidChunkTimeRange(u)) return;
      const t = Math.min(u.end, Math.max(u.start, rawTime));
      segmentEndRef.current = u.end;
      el.currentTime = t;
      setPlayingChunkIndex(index);
      setActiveClipTime(t);
    },
    [chunkAudioEnabled, utterances, reprocessing]
  );

  const scrollToUtterance = useCallback((index: number) => {
    utteranceRefs.current.get(index)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, []);

  useEffect(() => {
    const n = transcriptFind;
    if (n !== prevNeedleRef.current) {
      prevNeedleRef.current = n;
      focusMatchAfterNavRef.current = false;
      if (!n) {
        setActiveMatchIndex(-1);
        return;
      }
      setActiveMatchIndex(0);
      setSearchEpoch((e) => e + 1);
      return;
    }
    if (!n) return;
    if (flatMatches.length === 0) {
      setActiveMatchIndex(-1);
      return;
    }
    setActiveMatchIndex((prev) =>
      prev < 0 ? 0 : Math.min(prev, flatMatches.length - 1)
    );
  }, [transcriptFind, flatMatches]);

  useEffect(() => {
    if (activeMatchIndex < 0) return;
    const list = flatMatchesRef.current;
    if (list.length === 0) return;
    const m = list[activeMatchIndex];
    if (!m) return;
    scrollToUtterance(m.utteranceIndex);
    const id = requestAnimationFrame(() => {
      if (!focusMatchAfterNavRef.current) return;
      focusMatchAfterNavRef.current = false;
      const ta = textareaRefs.current.get(m.utteranceIndex);
      if (ta) {
        ta.focus();
        try {
          ta.setSelectionRange(m.start, m.end);
        } catch {
          /* selection may be invalid transiently */
        }
      }
    });
    return () => cancelAnimationFrame(id);
  }, [activeMatchIndex, searchEpoch, scrollToUtterance]);

  const goPrevMatch = useCallback(() => {
    focusMatchAfterNavRef.current = true;
    setActiveMatchIndex((i) => {
      const len = flatMatchesRef.current.length;
      if (len === 0) return -1;
      if (i <= 0) return len - 1;
      return i - 1;
    });
  }, []);

  const goNextMatch = useCallback(() => {
    focusMatchAfterNavRef.current = true;
    setActiveMatchIndex((i) => {
      const len = flatMatchesRef.current.length;
      if (len === 0) return -1;
      if (i < 0) return 0;
      return (i + 1) % len;
    });
  }, []);

  const registerTranscriptTextarea = useCallback(
    (rowIndex: number, el: HTMLTextAreaElement | null) => {
      if (el) textareaRefs.current.set(rowIndex, el);
      else textareaRefs.current.delete(rowIndex);
    },
    []
  );

  const onReplaceAllInTranscript = useCallback(() => {
    const needle = transcriptFind;
    if (!needle || findReplaceMatchCount === 0 || reprocessing) return;
    const n = findReplaceMatchCount;
    setUtterances((prev) =>
      prev.map((u) => ({
        ...u,
        text: replaceAllNonOverlappingInsensitive(u.text, needle, transcriptReplace),
      }))
    );
    toast.success(
      `Replaced ${n} match${n === 1 ? "" : "es"} in the reviewed transcript. Save draft when ready.`
    );
  }, [transcriptFind, transcriptReplace, findReplaceMatchCount, reprocessing]);

  const emptyState = utterances.length === 0;

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-8 px-6 py-8">
      {chunkAudioEnabled && audioUrl ? (
        <audio
          ref={sharedAudioRef}
          src={audioUrl}
          preload="metadata"
          className="hidden"
          aria-hidden
          onError={() => toast.error("Audio failed to load")}
        />
      ) : null}
      <div>
        <Link
          href={`/interviews/${interviewId}`}
          className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to interview
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Transcript review</h1>
        <p className="mt-2 text-base text-muted-foreground">{interviewTitle}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
          {lastIntelSource && (
            <span>
              Last intel: <span className="text-foreground">{lastIntelSource}</span>
            </span>
          )}
          <span>
            Review status:{" "}
            <span className="text-foreground">{reviewStatus}</span>
          </span>
          {readyForReprocess && (
            <Badge variant="secondary" className="text-xs font-normal">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Ready to reprocess
            </Badge>
          )}
          {reprocessing && (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
              Intel pipeline running — editing is paused.
            </span>
          )}
        </div>
      </div>

      {parseWarning && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {parseWarning}
        </div>
      )}

      <Card className="w-full min-w-0 shadow-sm">
        <CardHeader className="space-y-1.5 pb-4">
          <CardTitle className="text-xl">Reviewed utterances</CardTitle>
          <CardDescription className="text-base leading-relaxed">
            Correct ASR text per segment. Times are preserved for chunk alignment; edit text only
            unless you re-run from a future utterance editor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {emptyState ? (
            <p className="text-base text-muted-foreground">
              No utterances to edit. Ensure this interview has a speaker-labelled transcript, then
              save a draft from the interview detail page after upload completes.
            </p>
          ) : (
            <>
              <div className="mb-4 rounded-xl border border-border/60 bg-card/40 px-3 py-2.5 backdrop-blur-[2px] dark:border-border/50 dark:bg-card/30">
                <div className="flex flex-col gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border/50 bg-input/25 px-2.5 py-1 dark:border-border/40 dark:bg-input/20">
                      <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
                      <Input
                        id="tr-find"
                        value={transcriptFind}
                        onChange={(e) => setTranscriptFind(e.target.value)}
                        placeholder="Find in transcript…"
                        disabled={reprocessing}
                        autoComplete="off"
                        className="h-8 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 md:text-sm"
                        aria-label="Find in reviewed transcript (case-insensitive)"
                      />
                    </div>
                    {transcriptFind ? (
                      flatMatches.length > 0 ? (
                        <div className="flex items-center gap-0.5">
                          <span
                            className="min-w-[4.5rem] px-1 text-center text-xs font-medium tabular-nums text-amber-800/90 dark:text-amber-200/85"
                            role="status"
                            aria-live="polite"
                          >
                            {activeMatchIndex >= 0
                              ? `${activeMatchIndex + 1} of ${flatMatches.length}`
                              : `0 of ${flatMatches.length}`}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            disabled={reprocessing}
                            aria-label="Previous match"
                            onClick={goPrevMatch}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            disabled={reprocessing}
                            aria-label="Next match"
                            onClick={goNextMatch}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No matches</span>
                      )
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-2.5 dark:border-border/30">
                    <Input
                      id="tr-replace"
                      value={transcriptReplace}
                      onChange={(e) => setTranscriptReplace(e.target.value)}
                      placeholder="Replace with…"
                      disabled={reprocessing}
                      autoComplete="off"
                      className="h-9 min-w-0 flex-1 border-border/50 bg-background/60 text-sm shadow-sm dark:bg-background/40 sm:max-w-xl"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 shrink-0 border-border/60 text-xs font-medium"
                      disabled={
                        reprocessing || !transcriptFind || findReplaceMatchCount === 0
                      }
                      onClick={onReplaceAllInTranscript}
                    >
                      Replace all
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex h-[min(65vh,600px)] w-full min-w-0 gap-2">
                {transcriptFind && findMatchRailMarkers.length > 0 ? (
                  <div
                    className="relative w-3 shrink-0 rounded-full border border-border/70 bg-muted/50"
                    aria-label="Match positions in transcript"
                  >
                    <div className="absolute inset-x-0 top-2 bottom-2 mx-auto w-px rounded-full bg-muted-foreground/25" />
                    {findMatchRailMarkers.map((mk) => (
                      <button
                        key={mk.key}
                        type="button"
                        title="Go to this match"
                        className={cn(
                          "absolute left-1/2 z-10 h-2.5 w-2.5 rounded-sm bg-amber-500/90 shadow-sm ring-1 ring-amber-700/25 transition-transform hover:scale-125 hover:bg-amber-400 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none dark:ring-amber-400/30",
                          mk.globalIndex === activeMatchIndex &&
                            "h-3 w-3 bg-amber-400 ring-2 ring-amber-600/50 dark:bg-amber-400 dark:ring-amber-300/60"
                        )}
                        style={{
                          top: `${mk.topPct}%`,
                          transform: "translate(-50%, -50%)",
                        }}
                        onClick={() => {
                          focusMatchAfterNavRef.current = true;
                          setActiveMatchIndex(mk.globalIndex);
                        }}
                      />
                    ))}
                  </div>
                ) : null}
                <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain pr-1">
                  <div className="space-y-5 pb-1">
                    {utterances.map((u, rowIndex) => {
                      const clipSliderValue =
                        playingChunkIndex === rowIndex
                          ? Math.min(
                              u.end,
                              Math.max(u.start, activeClipTime ?? u.start)
                            )
                          : u.start;
                      return (
                        <div
                          key={`${u.speaker}-${u.start}-${rowIndex}`}
                          ref={(el) => {
                            if (el) utteranceRefs.current.set(rowIndex, el);
                            else utteranceRefs.current.delete(rowIndex);
                          }}
                          className={cn(
                            "rounded-lg border bg-card/50 p-4 transition-[box-shadow,ring]",
                            playingChunkIndex === rowIndex &&
                              !audioPaused &&
                              "ring-2 ring-primary/45 border-primary/35",
                            playingChunkIndex === rowIndex &&
                              audioPaused &&
                              "ring-1 ring-muted-foreground/40"
                          )}
                        >
                          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                              <Badge variant="outline" className="font-normal">
                                {speakerLabel(u.speaker)}
                              </Badge>
                              <span className="tabular-nums">
                                {formatTime(u.start)} – {formatTime(u.end)}
                              </span>
                            </div>
                          </div>
                          {chunkAudioEnabled && isValidChunkTimeRange(u) ? (
                            <div className="mb-2.5 flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                disabled={reprocessing}
                                aria-label={
                                  playingChunkIndex === rowIndex && !audioPaused
                                    ? "Pause audio for this segment"
                                    : "Play audio for this segment"
                                }
                                onClick={() => toggleChunkAudio(rowIndex)}
                              >
                                {playingChunkIndex === rowIndex && !audioPaused ? (
                                  <Pause className="h-4 w-4" />
                                ) : (
                                  <Play className="h-4 w-4" />
                                )}
                              </Button>
                              <input
                                type="range"
                                className="h-2 min-w-0 flex-1 cursor-pointer accent-amber-600 disabled:cursor-not-allowed disabled:opacity-50 dark:accent-amber-500"
                                min={u.start}
                                max={u.end}
                                step={0.01}
                                value={clipSliderValue}
                                disabled={reprocessing}
                                aria-valuemin={u.start}
                                aria-valuemax={u.end}
                                aria-valuenow={clipSliderValue}
                                aria-label={`Seek within this utterance (${formatTime(u.start)} to ${formatTime(u.end)})`}
                                onChange={(e) =>
                                  seekWithinUtterance(rowIndex, parseFloat(e.target.value))
                                }
                              />
                            </div>
                          ) : null}
                          {transcriptFind ? (
                            <HighlightedTranscriptTextarea
                              value={u.text}
                              onChange={(v) => updateText(rowIndex, v)}
                              disabled={reprocessing}
                              rows={4}
                              utteranceIndex={rowIndex}
                              occurrences={flatMatches.filter(
                                (m) => m.utteranceIndex === rowIndex
                              )}
                              activeMatchGlobal={activeMatchIndex}
                              onRegisterTextarea={registerTranscriptTextarea}
                            />
                          ) : (
                            <Textarea
                              value={u.text}
                              onChange={(e) => updateText(rowIndex, e.target.value)}
                              disabled={reprocessing}
                              rows={4}
                              className="resize-y text-base leading-relaxed"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            <Button
              onClick={onSaveDraft}
              disabled={pending || reprocessing || emptyState}
            >
              {pending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save draft
            </Button>
            <Button
              variant="secondary"
              onClick={onMarkReady}
              disabled={pending || reprocessing || emptyState}
            >
              Mark ready for reprocess
            </Button>
            {(readyForReprocess || reprocessing) && (
              <Button
                variant="default"
                onClick={() => void onRunReprocess()}
                disabled={pending || emptyState || reprocessBusy}
              >
                {reprocessBusy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {reprocessBusy ? "Reprocessing…" : "Run reprocessing"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="w-full min-w-0 shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-xl">Human-confirmed entities</CardTitle>
              <CardDescription className="text-base leading-relaxed">
                Strong inputs for the next reprocessing run: mention recovery and relationships.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" disabled={reprocessing}>
                    <Search className="mr-2 h-4 w-4" />
                    Link existing
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search entities…"
                      value={searchQuery}
                      onValueChange={setSearchQuery}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {searchLoading ? (
                          <span className="flex items-center justify-center gap-2 py-4 text-sm">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Searching…
                          </span>
                        ) : searchQuery.trim().length < 2 ? (
                          <span className="py-4 text-center text-sm text-muted-foreground">
                            Type at least 2 characters
                          </span>
                        ) : (
                          "No matches"
                        )}
                      </CommandEmpty>
                      <CommandGroup>
                        {searchResults.map((e) => (
                          <CommandItem
                            key={e.id}
                            value={e.id}
                            onSelect={() => onPickEntity(e.id)}
                          >
                            <span className="truncate font-medium">{e.name}</span>
                            <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                              {e.type}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <Button
                variant="default"
                size="sm"
                disabled={reprocessing}
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create &amp; add
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {seeds.length === 0 ? (
            <p className="text-sm text-muted-foreground">No seed entities yet.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {seeds.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{s.display_name}</div>
                    <div className="text-xs text-muted-foreground">{s.entity_type}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={reprocessing}
                    onClick={() => onRemoveSeed(s.id)}
                    aria-label="Remove seed"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New entity for this review</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="seed-name">Name</Label>
              <Input
                id="seed-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Endesa"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={createType}
                onValueChange={(v) => setCreateType(v as EntityType)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onCreateEntity} disabled={pending || !createName.trim()}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
