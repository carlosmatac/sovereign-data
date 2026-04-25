"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  approveRelationship,
  rejectRelationship,
  restoreRelationship,
  updateRelationshipType,
} from "@/app/actions/relationship-editorial";
import {
  RELATION_TYPE_VALUES,
  type RelationType,
  type RelationshipReviewStatus,
} from "@/types/database";
import type {
  GovernanceRelationshipDirectionFilter,
  GovernanceRelationshipRow,
  GovernanceRelationshipStatusFilter,
} from "@/lib/admin/load-governance-relationships";

interface Props {
  entityId: string;
  rows: GovernanceRelationshipRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  statusFilter: GovernanceRelationshipStatusFilter;
  directionFilter: GovernanceRelationshipDirectionFilter;
}

const STATUS_OPTIONS: ReadonlyArray<{
  value: GovernanceRelationshipStatusFilter;
  label: string;
}> = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active (pending + approved)" },
  { value: "pending", label: "Pending only" },
  { value: "approved", label: "Approved only" },
  { value: "rejected", label: "Rejected only" },
];

const DIRECTION_OPTIONS: ReadonlyArray<{
  value: GovernanceRelationshipDirectionFilter;
  label: string;
}> = [
  { value: "all", label: "All directions" },
  { value: "incoming", label: "Incoming" },
  { value: "outgoing", label: "Outgoing" },
];

function humanizeRelationType(value: string): string {
  return value.replace(/_/g, " ");
}

function statusLabel(status: RelationshipReviewStatus): string {
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Pending";
}

function statusBadgeClass(status: RelationshipReviewStatus): string {
  if (status === "approved")
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-500 dark:text-emerald-300";
  if (status === "rejected")
    return "border-rose-500/30 bg-rose-500/10 text-rose-500 dark:text-rose-300";
  return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300";
}

export function GovernanceRelationshipsSection({
  entityId,
  rows,
  page,
  pageSize,
  totalCount,
  totalPages,
  statusFilter,
  directionFilter,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);

  const baseHref = useMemo(() => {
    return `/admin/entities/${entityId}`;
  }, [entityId]);

  const buildHrefFor = (next: {
    page?: number;
    statusFilter?: GovernanceRelationshipStatusFilter;
    directionFilter?: GovernanceRelationshipDirectionFilter;
  }) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (next.statusFilter !== undefined) {
      if (next.statusFilter === "all") {
        params.delete("rel_status");
      } else {
        params.set("rel_status", next.statusFilter);
      }
    }
    if (next.directionFilter !== undefined) {
      if (next.directionFilter === "all") {
        params.delete("rel_direction");
      } else {
        params.set("rel_direction", next.directionFilter);
      }
    }
    if (next.page !== undefined) {
      if (next.page <= 1) {
        params.delete("rel_page");
      } else {
        params.set("rel_page", String(next.page));
      }
    }
    const qs = params.toString();
    return `${baseHref}${qs ? `?${qs}` : ""}#relationships`;
  };

  const goTo = (href: string) => {
    router.push(href, { scroll: false });
  };

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

  const summaryParts: string[] = [];
  if (statusFilter !== "all") {
    const s = STATUS_OPTIONS.find((o) => o.value === statusFilter);
    if (s) summaryParts.push(s.label);
  }
  if (directionFilter !== "all") {
    const d = DIRECTION_OPTIONS.find((o) => o.value === directionFilter);
    if (d) summaryParts.push(d.label);
  }
  const summary = summaryParts.length > 0 ? summaryParts.join(" · ") : null;

  return (
    <section
      id="relationships"
      className="space-y-3 scroll-mt-20"
      data-testid="governance-relationships-section"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Relationships
          </h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            All graph edges where this entity is source or target. Includes
            rejected rows so you can restore or re-classify them.
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            <span className="tabular-nums font-medium">{totalCount}</span>{" "}
            row{totalCount === 1 ? "" : "s"}
            {summary ? ` · ${summary}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={statusFilter}
            onValueChange={(v) =>
              goTo(
                buildHrefFor({
                  statusFilter: v as GovernanceRelationshipStatusFilter,
                  page: 1,
                })
              )
            }
          >
            <SelectTrigger className="h-8 w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={directionFilter}
            onValueChange={(v) =>
              goTo(
                buildHrefFor({
                  directionFilter:
                    v as GovernanceRelationshipDirectionFilter,
                  page: 1,
                })
              )
            }
          >
            <SelectTrigger className="h-8 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIRECTION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[110px]">Direction</TableHead>
              <TableHead>Related entity</TableHead>
              <TableHead className="w-[180px]">Relation</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[110px]">Origin</TableHead>
              <TableHead className="w-[100px] text-right">Confidence</TableHead>
              <TableHead>Source interview</TableHead>
              <TableHead className="w-[60px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-muted-foreground py-10 text-center text-sm"
                >
                  No relationships match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((rel) => {
                const isRejected = rel.review_status === "rejected";
                const isApproved = rel.review_status === "approved";
                const isBusy = pending && activeId === rel.id;
                const isOutgoing = rel.direction === "outgoing";
                return (
                  <TableRow
                    key={rel.id}
                    className={isRejected ? "opacity-60" : ""}
                  >
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide">
                        {isOutgoing ? (
                          <ArrowUpRight className="h-3.5 w-3.5 text-sky-500" />
                        ) : (
                          <ArrowDownLeft className="h-3.5 w-3.5 text-violet-500" />
                        )}
                        <span className="text-muted-foreground">
                          {isOutgoing ? "Outgoing" : "Incoming"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <Link
                          href={`/admin/entities/${rel.related_entity_id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {rel.related_entity_name}
                        </Link>
                        <span className="text-muted-foreground text-[11px] uppercase tracking-wide">
                          {rel.related_entity_type}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm capitalize">
                          {humanizeRelationType(rel.relation_type)}
                        </span>
                        {rel.evidence_text ? (
                          <span
                            className="text-muted-foreground line-clamp-2 text-xs italic"
                            title={rel.evidence_text}
                          >
                            “{rel.evidence_text}”
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10.5px] uppercase tracking-wide ${statusBadgeClass(
                          rel.review_status
                        )}`}
                      >
                        {statusLabel(rel.review_status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-xs uppercase tracking-wide">
                        {rel.origin === "human_edited"
                          ? "Edited"
                          : rel.origin === "human_created"
                            ? "Manual"
                            : "LLM"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {Math.round(rel.confidence * 100)}%
                    </TableCell>
                    <TableCell>
                      {rel.interview_id ? (
                        <Link
                          href={`/interviews/${rel.interview_id}#relationships`}
                          className="inline-flex items-center gap-1 text-xs hover:underline"
                          title={rel.interview_title ?? rel.interview_id}
                        >
                          <span className="max-w-[220px] truncate">
                            {rel.interview_title ?? rel.interview_id}
                          </span>
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
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
                          <DropdownMenuLabel className="text-muted-foreground text-xs uppercase tracking-wide">
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
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-2 pt-1 text-xs">
          <span className="text-muted-foreground">
            Page {page} of {totalPages} · {pageSize} per page
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              asChild={page > 1}
            >
              {page > 1 ? (
                <Link href={buildHrefFor({ page: page - 1 })}>Previous</Link>
              ) : (
                <span>Previous</span>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              asChild={page < totalPages}
            >
              {page < totalPages ? (
                <Link href={buildHrefFor({ page: page + 1 })}>Next</Link>
              ) : (
                <span>Next</span>
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
