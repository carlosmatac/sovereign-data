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
import { ScrollArea } from "@/components/ui/scroll-area";
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

function countSubstringOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let idx = 0;
  while (idx <= haystack.length) {
    const i = haystack.indexOf(needle, idx);
    if (i === -1) break;
    n++;
    idx = i + needle.length;
  }
  return n;
}

function replaceAllNonOverlapping(
  haystack: string,
  needle: string,
  replacement: string
): string {
  if (!needle) return haystack;
  let result = "";
  let idx = 0;
  while (idx < haystack.length) {
    const i = haystack.indexOf(needle, idx);
    if (i === -1) {
      result += haystack.slice(idx);
      break;
    }
    result += haystack.slice(idx, i) + replacement;
    idx = i + needle.length;
  }
  return result;
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
  const [transcriptFind, setTranscriptFind] = useState("");
  const [transcriptReplace, setTranscriptReplace] = useState("");

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

  const findReplaceMatchCount = useMemo(() => {
    const needle = transcriptFind;
    if (!needle) return 0;
    let total = 0;
    for (const u of utterances) {
      total += countSubstringOccurrences(u.text, needle);
    }
    return total;
  }, [utterances, transcriptFind]);

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

    const onTimeUpdate = () => {
      if (el.currentTime >= segmentEndRef.current - CHUNK_END_EPSILON_SEC) {
        el.pause();
        setPlayingChunkIndex(null);
      }
    };
    el.addEventListener("timeupdate", onTimeUpdate);
    return () => el.removeEventListener("timeupdate", onTimeUpdate);
  }, [playingChunkIndex]);

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
          void el.play().catch(() => toast.error("Could not play audio"));
        } else {
          el.pause();
        }
        return;
      }

      segmentEndRef.current = u.end;
      el.pause();
      el.currentTime = u.start;
      setPlayingChunkIndex(index);
      void el.play().catch(() => {
        toast.error("Could not play audio");
        setPlayingChunkIndex(null);
      });
    },
    [chunkAudioEnabled, playingChunkIndex, utterances, reprocessing]
  );

  const onReplaceAllInTranscript = useCallback(() => {
    const needle = transcriptFind;
    if (!needle || findReplaceMatchCount === 0 || reprocessing) return;
    const n = findReplaceMatchCount;
    setUtterances((prev) =>
      prev.map((u) => ({
        ...u,
        text: replaceAllNonOverlapping(u.text, needle, transcriptReplace),
      }))
    );
    toast.success(
      `Replaced ${n} match${n === 1 ? "" : "es"} in the reviewed transcript. Save draft when ready.`
    );
  }, [transcriptFind, transcriptReplace, findReplaceMatchCount, reprocessing]);

  const emptyState = utterances.length === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-8">
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

      <Card className="shadow-sm">
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
              <div className="mb-4 flex flex-col gap-3 rounded-lg border border-dashed bg-muted/20 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="grid min-w-0 flex-1 gap-1.5 sm:min-w-[200px]">
                  <Label htmlFor="tr-find" className="text-xs text-muted-foreground">
                    Find in reviewed text
                  </Label>
                  <Input
                    id="tr-find"
                    value={transcriptFind}
                    onChange={(e) => setTranscriptFind(e.target.value)}
                    placeholder="Search…"
                    disabled={reprocessing}
                    autoComplete="off"
                  />
                </div>
                <div className="grid min-w-0 flex-1 gap-1.5 sm:min-w-[200px]">
                  <Label htmlFor="tr-replace" className="text-xs text-muted-foreground">
                    Replace with
                  </Label>
                  <Input
                    id="tr-replace"
                    value={transcriptReplace}
                    onChange={(e) => setTranscriptReplace(e.target.value)}
                    placeholder="Replacement (can be empty)"
                    disabled={reprocessing}
                    autoComplete="off"
                  />
                </div>
                <div className="flex flex-col gap-2 sm:shrink-0">
                  <p className="text-xs text-muted-foreground">
                    {transcriptFind
                      ? `${findReplaceMatchCount} match${findReplaceMatchCount === 1 ? "" : "es"} found`
                      : "Enter text to search"}
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full sm:w-auto"
                    disabled={
                      reprocessing || !transcriptFind || findReplaceMatchCount === 0
                    }
                    onClick={onReplaceAllInTranscript}
                  >
                    Replace all
                  </Button>
                </div>
              </div>
              <ScrollArea className="h-[min(65vh,600px)] pr-4">
                <div className="space-y-5">
                  {utterances.map((u, i) => (
                    <div
                      key={`${u.speaker}-${u.start}-${i}`}
                      className={cn(
                        "rounded-lg border bg-card/50 p-4 transition-[box-shadow,ring]",
                        playingChunkIndex === i &&
                          !audioPaused &&
                          "ring-2 ring-primary/45 border-primary/35",
                        playingChunkIndex === i &&
                          audioPaused &&
                          "ring-1 ring-muted-foreground/40"
                      )}
                    >
                      <div className="mb-2.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                          <Badge variant="outline" className="font-normal">
                            {speakerLabel(u.speaker)}
                          </Badge>
                          <span className="tabular-nums">
                            {formatTime(u.start)} – {formatTime(u.end)}
                          </span>
                        </div>
                        {chunkAudioEnabled && isValidChunkTimeRange(u) ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            disabled={reprocessing}
                            aria-label={
                              playingChunkIndex === i && !audioPaused
                                ? "Pause audio for this segment"
                                : "Play audio for this segment"
                            }
                            onClick={() => toggleChunkAudio(i)}
                          >
                            {playingChunkIndex === i && !audioPaused ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                        ) : null}
                      </div>
                    <Textarea
                      value={u.text}
                      onChange={(e) => updateText(i, e.target.value)}
                      disabled={reprocessing}
                      rows={4}
                      className="resize-y text-base leading-relaxed"
                    />
                  </div>
                  ))}
                </div>
              </ScrollArea>
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

      <Card className="shadow-sm">
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
