"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  RELATION_TYPE_VALUES,
  type RelationType,
  type RelationshipOrigin,
  type RelationshipReviewStatus,
} from "@/types/database";
import {
  approveRelationship,
  rejectRelationship,
  restoreRelationship,
  updateRelationshipType,
} from "@/app/actions/relationship-editorial";

export type RelationshipListItem = {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relation_type: RelationType;
  confidence: number;
  evidence_text: string | null;
  review_status: RelationshipReviewStatus;
  origin: RelationshipOrigin;
};

type EntityNameLookup = Record<string, { name: string; type: string }>;

type Props = {
  relationships: RelationshipListItem[];
  entityNameMap: EntityNameLookup;
  canEdit: boolean;
};

function humanizeRelationType(value: string): string {
  return value.replace(/_/g, " ");
}

function statusLabel(status: RelationshipReviewStatus): string {
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Pending";
}

function originLabel(origin: RelationshipOrigin): string | null {
  if (origin === "human_edited") return "Edited";
  if (origin === "human_created") return "Manual";
  return null;
}

export function RelationshipsList({
  relationships,
  entityNameMap,
  canEdit,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const order: Record<RelationshipReviewStatus, number> = {
      approved: 0,
      pending: 1,
      rejected: 2,
    };
    return [...relationships].sort(
      (a, b) => order[a.review_status] - order[b.review_status]
    );
  }, [relationships]);

  const runAction = (
    relationshipId: string,
    action: () => Promise<{ success: true } | { error: string }>,
    successMessage: string
  ) => {
    setActiveId(relationshipId);
    startTransition(async () => {
      try {
        const result = await action();
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        toast.success(successMessage);
        router.refresh();
      } finally {
        setActiveId(null);
      }
    });
  };

  return (
    <ul className="space-y-2">
      {sorted.map((rel) => {
        const source = entityNameMap[rel.source_entity_id];
        const target = entityNameMap[rel.target_entity_id];
        if (!source || !target) return null;

        const isRejected = rel.review_status === "rejected";
        const isApproved = rel.review_status === "approved";
        const isBusy = pending && activeId === rel.id;
        const originHint = originLabel(rel.origin);

        return (
          <li
            key={rel.id}
            className={`rounded-[10px] border px-3.5 py-3 ${
              isRejected ? "opacity-55" : ""
            }`}
            style={{ borderColor: "var(--sv-border-divider)", background: "var(--sv-accent,rgba(255,255,255,0.022))" }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[13px] tracking-[-0.005em] text-foreground/88">
                  <span className="truncate font-medium">{source.name}</span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                  <span className="truncate font-medium">{target.name}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span
                    className={`inline-flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.06em] ${
                      isRejected
                        ? "text-muted-foreground/60 line-through"
                        : "text-[#5B9CF6]/85"
                    }`}
                  >
                    <span
                      className={`h-1 w-1 rounded-full ${
                        isRejected ? "bg-muted-foreground/40" : "bg-[#5B9CF6]/70"
                      }`}
                    />
                    {humanizeRelationType(rel.relation_type)}
                  </span>
                  <span className="text-[10.5px] tabular-nums text-muted-foreground">
                    {Math.round(rel.confidence * 100)}% confidence
                  </span>
                  <span
                    className={`text-[10.5px] uppercase tracking-[0.06em] ${
                      isApproved
                        ? "text-emerald-500/80 dark:text-emerald-300/80"
                        : isRejected
                          ? "text-rose-500/70 dark:text-rose-300/70"
                          : "text-muted-foreground"
                    }`}
                  >
                    {statusLabel(rel.review_status)}
                  </span>
                  {originHint && (
                    <span className="text-[10.5px] uppercase tracking-[0.06em] text-amber-600/70 dark:text-amber-200/70">
                      {originHint}
                    </span>
                  )}
                </div>
                {rel.evidence_text && (
                  <p className="mt-2 border-l border-border/50 pl-3 text-[12px] leading-[1.55] italic text-muted-foreground">
                    &ldquo;{rel.evidence_text}&rdquo;
                  </p>
                )}
              </div>

              {canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                      disabled={isBusy}
                      aria-label="Relationship actions"
                    >
                      {isBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                      Change relation type
                    </DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={rel.relation_type}
                      onValueChange={(value) => {
                        if (value === rel.relation_type) return;
                        runAction(
                          rel.id,
                          () =>
                            updateRelationshipType(
                              rel.id,
                              value as RelationType
                            ),
                          "Relation type updated"
                        );
                      }}
                    >
                      {RELATION_TYPE_VALUES.map((value) => (
                        <DropdownMenuRadioItem
                          key={value}
                          value={value}
                          className="text-xs capitalize"
                        >
                          {humanizeRelationType(value)}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                    <DropdownMenuSeparator />
                    {!isApproved && (
                      <DropdownMenuItem
                        onSelect={() =>
                          runAction(
                            rel.id,
                            () => approveRelationship(rel.id),
                            "Relationship approved"
                          )
                        }
                      >
                        <Check className="mr-2 h-3.5 w-3.5" />
                        Approve
                      </DropdownMenuItem>
                    )}
                    {!isRejected && (
                      <DropdownMenuItem
                        onSelect={() =>
                          runAction(
                            rel.id,
                            () => rejectRelationship(rel.id),
                            "Relationship rejected"
                          )
                        }
                      >
                        <X className="mr-2 h-3.5 w-3.5" />
                        Reject
                      </DropdownMenuItem>
                    )}
                    {(isApproved || isRejected) && (
                      <DropdownMenuItem
                        onSelect={() =>
                          runAction(
                            rel.id,
                            () => restoreRelationship(rel.id),
                            "Reverted to pending"
                          )
                        }
                      >
                        <RotateCcw className="mr-2 h-3.5 w-3.5" />
                        Revert to pending
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

