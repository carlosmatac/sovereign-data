"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Target,
  DollarSign,
  Clock,
  Repeat2,
  TrendingUp,
  AlertCircle,
  RefreshCw,
  Inbox,
} from "lucide-react";
import {
  type Deal,
  type DealStage,
  type DealType,
  type DealKpis,
  type PipelineStage,
  STAGE_LABELS,
  getDeals,
  mapHubspotDealsToUiDeals,
  selectKpis,
  selectPipelineHealth,
} from "@/lib/mockHubspot";

const REVENUE_TARGET = 200_000;

function formatUSD(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

const STAGE_BADGE_VARIANT: Record<DealStage, string> = {
  pitch_completed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  reviewing_proposal: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  negotiation: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  contract_sent: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  closed_won: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  closed_lost: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

// ── Loading Skeleton ─────────────────────────────────────────────

function WarRoomSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline gap-2">
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-5 w-24" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-24" />
              <Skeleton className="mt-1 h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-28" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Error State ──────────────────────────────────────────────────

function WarRoomError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-destructive/50">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="mb-4 h-10 w-10 text-destructive" />
        <h3 className="text-lg font-semibold">Sales data unavailable</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {message}
        </p>
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Empty State ──────────────────────────────────────────────────

function WarRoomEmpty() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <Inbox className="mb-4 h-10 w-10 text-muted-foreground" />
        <h3 className="text-lg font-semibold">No deals yet</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Once your Country Manager starts closing deals, revenue and pipeline
          data will appear here automatically.
        </p>
      </CardContent>
    </Card>
  );
}

// ── KPI Cards ────────────────────────────────────────────────────

function GoalCard({ kpis }: { kpis: DealKpis }) {
  return (
    <Card className="sv-hover-card">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-medium">
            Revenue Target
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tight">
            {formatUSD(kpis.closedCash)}
          </span>
          <span className="text-lg text-muted-foreground">
            / {formatUSD(kpis.target)}
          </span>
        </div>
        <Progress
          value={kpis.progressPct}
          className="h-3"
          aria-label={`Revenue progress: ${kpis.progressPct.toFixed(1)}% of target`}
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{kpis.progressPct.toFixed(1)}% achieved</span>
          <span>
            {formatUSD(kpis.target - kpis.closedCash)} remaining
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function FinancialCards({ kpis }: { kpis: DealKpis }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card className="sv-hover-card">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">
            Cash Deals Signed
          </CardTitle>
          <DollarSign className="h-4 w-4 text-green-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatUSD(kpis.closedCash)}</div>
          <p className="text-xs text-muted-foreground">
            {kpis.closedCashCount} deal{kpis.closedCashCount !== 1 ? "s" : ""} closed
          </p>
        </CardContent>
      </Card>

      <Card className="sv-hover-card">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">
            Pending Collection
          </CardTitle>
          <Clock className="h-4 w-4 text-amber-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatUSD(kpis.pendingCollection)}
          </div>
          <p className="text-xs text-muted-foreground">
            {kpis.pendingCount} invoice{kpis.pendingCount !== 1 ? "s" : ""} outstanding
          </p>
        </CardContent>
      </Card>

      <Card className="sv-hover-card">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Barter Volume</CardTitle>
          <Repeat2 className="h-4 w-4 text-purple-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatUSD(kpis.barterVolume)}
          </div>
          <p className="text-xs text-muted-foreground">
            {kpis.barterCount} barter deal{kpis.barterCount !== 1 ? "s" : ""}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Pipeline Health ──────────────────────────────────────────────

function PipelineHealthCard({ stages }: { stages: PipelineStage[] }) {
  const total = stages.reduce((s, st) => s + st.count, 0);

  return (
    <Card className="sv-hover-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">
              Pipeline Health
            </CardTitle>
          </div>
          <span className="text-xs text-muted-foreground">
            {total} active deal{total !== 1 ? "s" : ""}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stages.map((st) => (
            <div
              key={st.stage}
              className="rounded-lg border p-3 text-center"
            >
              <div className="text-2xl font-bold">{st.count}</div>
              <div className="mt-0.5 text-xs font-medium text-muted-foreground">
                {st.label}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {formatUSD(st.value)}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Deals Table ──────────────────────────────────────────────────

function DealsPreview({ deals }: { deals: Deal[] }) {
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    let result = deals;
    if (stageFilter !== "all") {
      result = result.filter((d) => d.stage === stageFilter);
    }
    if (typeFilter !== "all") {
      result = result.filter((d) => d.type === typeFilter);
    }
    return result.sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [deals, stageFilter, typeFilter]);

  return (
    <Card className="sv-hover-card">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-sm font-medium">Recent Deals</CardTitle>
            <CardDescription>Top deals by value</CardDescription>
          </div>
          <div className="flex gap-2">
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger size="sm" className="w-[150px]">
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {Object.entries(STAGE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger size="sm" className="w-[120px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="barter">Barter</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No deals match the selected filters.
          </p>
        ) : (
          <div className="space-y-2">
            {/* Header (hidden on mobile, shown on sm+) */}
            <div className="hidden text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1fr_1fr_100px_130px_80px] sm:gap-3 sm:px-3 sm:py-1">
              <span>Deal</span>
              <span>Company</span>
              <span className="text-right">Amount</span>
              <span>Stage</span>
              <span>Type</span>
            </div>
            {filtered.map((deal) => (
              <div
                key={deal.id}
                className="rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-muted/50"
              >
                {/* Mobile layout */}
                <div className="flex items-center justify-between sm:hidden">
                  <div>
                    <div className="font-medium">{deal.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {deal.company}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatUSD(deal.amount)}</div>
                    <div className="mt-0.5 flex gap-1">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STAGE_BADGE_VARIANT[deal.stage]}`}
                      >
                        {STAGE_LABELS[deal.stage]}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Desktop layout */}
                <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_100px_130px_80px] sm:items-center sm:gap-3">
                  <span className="truncate font-medium">{deal.name}</span>
                  <span className="truncate text-muted-foreground">
                    {deal.company}
                  </span>
                  <span className="text-right font-semibold tabular-nums">
                    {formatUSD(deal.amount)}
                  </span>
                  <span
                    className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STAGE_BADGE_VARIANT[deal.stage]}`}
                  >
                    {STAGE_LABELS[deal.stage]}
                  </span>
                  <Badge
                    variant={deal.type === "cash" ? "default" : "secondary"}
                    className="w-fit text-[11px]"
                  >
                    {deal.type === "cash" ? "Cash" : "Barter"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Component ───────────────────────────────────────────────

export function SalesWarRoom({ projectId }: { projectId: string }) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await getDeals(projectId);
      setDeals(mapHubspotDealsToUiDeals(raw));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deals");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  if (loading) return <WarRoomSkeleton />;
  if (error) return <WarRoomError message={error} onRetry={fetchDeals} />;
  if (deals.length === 0) return <WarRoomEmpty />;

  const kpis = selectKpis(deals, REVENUE_TARGET);
  const pipeline = selectPipelineHealth(deals);

  return (
    <div className="space-y-4">
      <GoalCard kpis={kpis} />
      <FinancialCards kpis={kpis} />
      <PipelineHealthCard stages={pipeline} />
      <DealsPreview deals={deals} />
      <p className="text-right text-[11px] text-muted-foreground">
        Last synced: {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} (mock data)
      </p>
    </div>
  );
}
