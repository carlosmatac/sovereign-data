"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
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
import type { EntityType, ReviewedUtterance, TranscriptReviewStatus } from "@/types/database";
import type { SpeakerMap } from "@/types/database";
import {
  saveTranscriptReviewDraft,
  markInterviewReviewReady,
  addReviewSeedFromEntity,
  createReviewSeedEntity,
  removeReviewSeedEntity,
} from "@/app/actions/interview-review";

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

  useEffect(() => {
    setUtterances(initialUtterances);
  }, [initialUtterances]);

  const speakerLabel = useCallback(
    (code: string) => speakerMap[code] ?? `Speaker ${code}`,
    [speakerMap]
  );

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

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

  const emptyState = utterances.length === 0;

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div>
        <Link
          href={`/interviews/${interviewId}`}
          className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to interview
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Transcript review</h1>
        <p className="mt-1 text-muted-foreground">{interviewTitle}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
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
            <Badge variant="secondary" className="text-xs">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Ready for reprocess (run from API / next phase)
            </Badge>
          )}
        </div>
      </div>

      {reprocessing && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm">
          Reprocessing in progress — editing is disabled until it finishes.
        </div>
      )}

      {parseWarning && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {parseWarning}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Reviewed utterances</CardTitle>
          <CardDescription>
            Correct ASR text per segment. Times are preserved for chunk alignment; edit text only
            unless you re-run from a future utterance editor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {emptyState ? (
            <p className="text-sm text-muted-foreground">
              No utterances to edit. Ensure this interview has a speaker-labelled transcript, then
              save a draft from the interview detail page after upload completes.
            </p>
          ) : (
            <ScrollArea className="h-[min(60vh,520px)] pr-4">
              <div className="space-y-4">
                {utterances.map((u, i) => (
                  <div
                    key={`${u.speaker}-${u.start}-${i}`}
                    className="rounded-lg border bg-card/50 p-3"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{speakerLabel(u.speaker)}</Badge>
                      <span>
                        {formatTime(u.start)} – {formatTime(u.end)}
                      </span>
                    </div>
                    <Textarea
                      value={u.text}
                      onChange={(e) => updateText(i, e.target.value)}
                      disabled={reprocessing}
                      rows={3}
                      className="resize-y text-sm"
                    />
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
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
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Human-confirmed entities</CardTitle>
              <CardDescription>
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
