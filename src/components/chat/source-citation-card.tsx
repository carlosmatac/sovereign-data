"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { getSourceTypeMeta } from "@/lib/ui/source-type";

// ── Types ────────────────────────────────────────────────────────────────────

export type SourceCardExcerpt = {
  content: string;
  speaker: string | null;
  startTime: number | null;
  position: number;
  usedInText: boolean;
};

/**
 * One card per source, aggregated from multiple evidence/chunk rows.
 * Built in intelligence-chat-view.tsx from the API evidence payload.
 */
export type SourceCard = {
  sourceId: string;
  title: string;
  sourceType: string;
  summary: string | null;
  intervieweeName: string | null;
  intervieweeOrg: string | null;
  /**
   * Positions where this source was directly cited in the assistant text
   * (used_in_text = true), deduplicated and sorted ascending.
   * Used for the card footer label ([1], [1] +2, etc.).
   */
  citedPositions: number[];
  /** Total number of evidence rows for this source (cited + context). */
  totalChunks: number;
  /** True if at least one evidence row has used_in_text = true. */
  usedInText: boolean;
  excerpts: SourceCardExcerpt[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatMinSec(seconds: number | null): string | null {
  if (seconds === null) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Card ─────────────────────────────────────────────────────────────────────

export function SourceCitationCard({ card }: { card: SourceCard }) {
  const [open, setOpen] = useState(false);
  const meta = getSourceTypeMeta(card.sourceType);
  const Icon = meta.Icon;

  // Only show the positions that were directly cited in text — NOT the full
  // list of context chunks (which inflates the count misleadingly).
  const cited = card.citedPositions; // already sorted + deduplicated
  const citationSummary =
    cited.length === 0
      ? null
      : cited.length === 1
        ? `[${cited[0]}]`
        : `[${cited[0]}] +${cited.length - 1}`;

  const primaryEntity =
    card.intervieweeName ??
    (card.intervieweeOrg ? card.intervieweeOrg : null);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group flex w-[200px] flex-col gap-2 rounded-xl border bg-muted/30 p-3 text-left transition-colors",
          card.usedInText
            ? "border-primary/30 hover:border-primary/50 hover:bg-primary/5"
            : "border-border/50 hover:border-border/80 hover:bg-muted/50"
        )}
      >
        {/* Type badge row */}
        <div className="flex items-center justify-between gap-1">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
              meta.badgeClass
            )}
          >
            <Icon className="h-2.5 w-2.5" aria-hidden />
            {meta.label}
          </span>
          {card.usedInText && (
            <span className="rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              Cited
            </span>
          )}
        </div>

        {/* Title */}
        <p className="line-clamp-2 text-[12px] font-medium leading-tight text-foreground">
          {card.title}
        </p>

        {/* Footer: entity + citation label or context hint */}
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {primaryEntity && (
            <span className="min-w-0 flex-1 truncate">{primaryEntity}</span>
          )}
          {citationSummary ? (
            <span
              className={cn(
                "shrink-0 font-mono opacity-50",
                !primaryEntity && "ml-auto"
              )}
            >
              {citationSummary}
            </span>
          ) : (
            <span
              className={cn(
                "shrink-0 opacity-40",
                !primaryEntity && "ml-auto"
              )}
            >
              Supporting context
            </span>
          )}
        </div>
      </button>

      <SourceDetailDrawer
        card={card}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

// ── Drawer ───────────────────────────────────────────────────────────────────

function SourceDetailDrawer({
  card,
  open,
  onClose,
}: {
  card: SourceCard;
  open: boolean;
  onClose: () => void;
}) {
  const meta = getSourceTypeMeta(card.sourceType);
  const Icon = meta.Icon;

  // Prefer cited excerpts; fall back to context chunks (max 3)
  const citedExcerpts = card.excerpts.filter((e) => e.usedInText);
  const displayExcerpts =
    citedExcerpts.length > 0
      ? citedExcerpts
      : card.excerpts.slice(0, 3);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="flex w-[420px] flex-col gap-0 overflow-y-auto p-0 sm:w-[480px]"
      >
        {/* Header */}
        <SheetHeader className="border-b border-border/50 px-6 pb-4 pt-6">
          <div className="mb-2 flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                meta.badgeClass
              )}
            >
              <Icon className="h-3 w-3" aria-hidden />
              {meta.label}
            </span>
            {card.usedInText && (
              <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                Cited
              </span>
            )}
          </div>
          <SheetTitle className="text-[15px] leading-snug">
            {card.title}
          </SheetTitle>
        </SheetHeader>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-5 px-6 py-5">
          {/* Interviewee / Org */}
          {(card.intervieweeName || card.intervieweeOrg) && (
            <div>
              <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                {card.intervieweeName ? "Interviewee" : "Organization"}
              </p>
              <p className="text-[13px] text-foreground">
                {card.intervieweeName}
                {card.intervieweeOrg && (
                  <span className="text-muted-foreground">
                    {card.intervieweeName ? " · " : ""}
                    {card.intervieweeOrg}
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Summary */}
          {card.summary && (
            <div>
              <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                Summary
              </p>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {card.summary}
              </p>
            </div>
          )}

          {/* Excerpts */}
          {displayExcerpts.length > 0 && (
            <div>
              <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                {citedExcerpts.length > 0 ? "Cited excerpts" : "Context used"}
              </p>
              <div className="flex flex-col gap-2">
                {displayExcerpts.map((excerpt, i) => (
                  <div
                    key={i}
                    className={cn(
                      "rounded-lg border p-3 text-[12.5px] leading-relaxed",
                      excerpt.usedInText
                        ? "border-primary/20 bg-primary/5"
                        : "border-border/50 bg-muted/30"
                    )}
                  >
                    {(excerpt.speaker || excerpt.startTime !== null) && (
                      <div className="mb-1.5 text-[10px] font-medium text-muted-foreground">
                        {excerpt.speaker && (
                          <span>{excerpt.speaker}</span>
                        )}
                        {excerpt.startTime !== null && (
                          <span>
                            {excerpt.speaker ? " · " : ""}
                            {formatMinSec(excerpt.startTime)}
                          </span>
                        )}
                        <span className="ml-1.5 opacity-50">
                          [{excerpt.position}]
                        </span>
                      </div>
                    )}
                    <p className="line-clamp-5 text-foreground/80">
                      {excerpt.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Open source link */}
          <div className="mt-auto border-t border-border/40 pt-4">
            <a
              href={`/interviews/${card.sourceId}`}
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Open full source
            </a>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
