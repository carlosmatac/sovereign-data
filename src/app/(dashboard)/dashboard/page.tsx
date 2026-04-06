import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Mic,
  FolderKanban,
  Users,
  Clock,
  CheckCircle2,
  Loader2,
  XCircle,
  Upload,
  ArrowUpRight,
  MessageSquare,
  Network,
  TrendingUp,
  Hash,
} from "lucide-react";
import Link from "next/link";
import { STATUS_LABELS } from "@/lib/constants";
import { IconWrapper } from "@/components/ui/icon-wrapper";
import type { InterviewStatus } from "@/types/database";
import { InterviewsByProjectChart } from "@/components/dashboard/interviews-by-project-chart";
import { TopicDistributionChart } from "@/components/dashboard/topic-distribution-chart";

export default async function DashboardPage() {
  const supabase = await createClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [
    projectsResult,
    interviewsResult,
    entitiesResult,
    recentInterviewsResult,
    relationshipsResult,
    allInterviewsResult,
  ] = await Promise.all([
    admin.from("projects").select("id, name, country", { count: "exact" }),
    admin.from("interviews").select("id, status", { count: "exact" }),
    admin.from("entities").select("id", { count: "exact", head: true }),
    admin
      .from("interviews")
      .select("id, title, status, created_at, projects(name, country)")
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("entity_relationships")
      .select("id", { count: "exact", head: true }),
    admin
      .from("interviews")
      .select("id, status, topics, project_id, projects(name)")
      .eq("status", "COMPLETED"),
  ]);

  const projectCount = projectsResult.count ?? 0;
  const interviews = interviewsResult.data ?? [];
  const interviewCount = interviewsResult.count ?? 0;
  const entityCount = entitiesResult.count ?? 0;
  const recentInterviews = recentInterviewsResult.data ?? [];
  const relationshipCount = relationshipsResult.count ?? 0;
  const completedInterviews = allInterviewsResult.data ?? [];

  const statusCounts: Record<string, number> = {};
  interviews.forEach((i) => {
    statusCounts[i.status] = (statusCounts[i.status] ?? 0) + 1;
  });

  const completedCount = statusCounts["COMPLETED"] ?? 0;
  const processingCount =
    (statusCounts["PROCESSING"] ?? 0) +
    (statusCounts["TRANSCRIBING"] ?? 0) +
    (statusCounts["EXTRACTING"] ?? 0) +
    (statusCounts["EMBEDDING"] ?? 0);
  const failedCount = statusCounts["FAILED"] ?? 0;

  // Interviews by project
  const projectsData = projectsResult.data ?? [];
  const projectInterviewCounts: Record<
    string,
    { name: string; country: string | null; total: number; completed: number }
  > = {};
  projectsData.forEach((p) => {
    projectInterviewCounts[p.id] = {
      name: p.name,
      country: p.country,
      total: 0,
      completed: 0,
    };
  });
  completedInterviews.forEach((i) => {
    const entry = projectInterviewCounts[i.project_id];
    if (entry) {
      entry.total += 1;
      if (i.status === "COMPLETED") entry.completed += 1;
    }
  });
  const projectBreakdown = Object.values(projectInterviewCounts)
    .filter((p) => p.total > 0)
    .sort((a, b) => b.total - a.total);

  // Topic distribution
  const topicCounts: Record<string, number> = {};
  completedInterviews.forEach((i) => {
    const topics = i.topics as string[] | null;
    topics?.forEach((t) => {
      topicCounts[t] = (topicCounts[t] ?? 0) + 1;
    });
  });
  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([topic, count]) => ({ topic, count }));

  return (
    <div className="p-6 lg:p-8">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/60">
            Intelligence Platform
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        </div>
        <Button size="sm" asChild className="gap-1.5">
          <Link href="/interviews/upload">
            <Upload className="h-3.5 w-3.5" />
            Upload Interview
          </Link>
        </Button>
      </div>

      {/* ── KPI Row — 3 metrics ────────────────────────────────── */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatsCard
          title="Projects"
          value={projectCount}
          icon={FolderKanban}
          iconColor="blue"
          description="Active intelligence projects"
          href="/projects"
        />
        <StatsCard
          title="Interviews"
          value={interviewCount}
          icon={Mic}
          iconColor="indigo"
          description={`${completedCount} completed · ${processingCount} processing`}
          href="/interviews"
        />
        <StatsCard
          title="Entities"
          value={entityCount}
          icon={Users}
          iconColor="amber"
          description={`${relationshipCount} relationships mapped`}
          href="/network"
        />
      </div>

      {/* ── Middle row: Recent + Side panel ───────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Interviews */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div>
                <CardTitle className="text-sm font-semibold tracking-tight">
                  Recent Interviews
                </CardTitle>
                <CardDescription className="text-xs">
                  Latest uploaded recordings
                </CardDescription>
              </div>
              <Link
                href="/interviews"
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                View all
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent>
              {recentInterviews.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-center">
                  <Mic className="mb-3 h-7 w-7 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    No interviews yet.{" "}
                    <Link
                      href="/interviews/upload"
                      className="text-primary underline"
                    >
                      Upload your first one.
                    </Link>
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {recentInterviews.map((interview) => {
                    const project = interview.projects as unknown as {
                      name: string;
                      country: string | null;
                    } | null;
                    const statusInfo = STATUS_LABELS[interview.status] ?? {
                      label: interview.status,
                      variant: "secondary" as const,
                    };

                    return (
                      <Link
                        key={interview.id}
                        href={`/interviews/${interview.id}`}
                        className="group flex items-center justify-between py-3 transition-colors hover:bg-muted/30 -mx-1 px-1 rounded"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <StatusIcon
                            status={interview.status as InterviewStatus}
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium leading-snug">
                              {interview.title}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {project?.name}
                              {project?.country
                                ? ` · ${project.country}`
                                : ""}
                              {"  "}
                              <span className="opacity-50">
                                {new Date(
                                  interview.created_at
                                ).toLocaleDateString("en-GB", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </span>
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={statusInfo.variant}
                          className="ml-3 shrink-0 text-[10px] font-medium tracking-wide"
                        >
                          {statusInfo.label}
                        </Badge>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-5">
          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold tracking-tight">
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {[
                {
                  href: "/interviews/upload",
                  icon: Upload,
                  label: "Upload Interview",
                },
                {
                  href: "/chat",
                  icon: MessageSquare,
                  label: "Copilot",
                },
                {
                  href: "/network",
                  icon: Network,
                  label: "Network Explorer",
                },
                {
                  href: "/projects/new",
                  icon: FolderKanban,
                  label: "New Project",
                },
              ].map(({ href, icon: Icon, label }) => (
                <Button
                  key={href}
                  variant="outline"
                  className="justify-start gap-2 text-sm font-medium h-9"
                  asChild
                >
                  <Link href={href}>
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    {label}
                  </Link>
                </Button>
              ))}
            </CardContent>
          </Card>

          {/* Pipeline Status */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold tracking-tight">
                Pipeline Status
              </CardTitle>
              <CardDescription className="text-xs">
                Interview processing
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <StatusRow
                  icon={
                    <IconWrapper color="emerald" size="sm">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </IconWrapper>
                  }
                  label="Completed"
                  count={completedCount}
                />
                <StatusRow
                  icon={
                    <IconWrapper color="blue" size="sm">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    </IconWrapper>
                  }
                  label="Processing"
                  count={processingCount}
                />
                <StatusRow
                  icon={
                    <IconWrapper color="rose" size="sm">
                      <XCircle className="h-3.5 w-3.5" />
                    </IconWrapper>
                  }
                  label="Failed"
                  count={failedCount}
                />
                <Separator className="opacity-50" />
                <StatusRow
                  icon={
                    <IconWrapper color="slate" size="sm">
                      <Mic className="h-3.5 w-3.5" />
                    </IconWrapper>
                  }
                  label="Total"
                  count={interviewCount}
                  bold
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Analytics Row — Charts ─────────────────────────────── */}
      {(projectBreakdown.length > 0 || topTopics.length > 0) && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* Interviews by Project — horizontal bar */}
          {projectBreakdown.length > 0 && (
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-3.5 w-3.5 text-primary/70" />
                      <CardTitle className="text-sm font-semibold tracking-tight">
                        Interviews by Project
                      </CardTitle>
                    </div>
                    <CardDescription className="mt-0.5 text-xs">
                      Completed interviews per project
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pb-5">
                <InterviewsByProjectChart data={projectBreakdown} />
              </CardContent>
            </Card>
          )}

          {/* Topic Distribution — donut */}
          {topTopics.length > 0 && (
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <Hash className="h-3.5 w-3.5 text-primary/70" />
                  <CardTitle className="text-sm font-semibold tracking-tight">
                    Topic Distribution
                  </CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Top {topTopics.length} themes across all interviews
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-5">
                <TopicDistributionChart data={topTopics} />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function StatsCard({
  title,
  value,
  icon: Icon,
  iconColor = "primary",
  description,
  href,
}: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  iconColor?:
    | "blue"
    | "indigo"
    | "emerald"
    | "amber"
    | "rose"
    | "purple"
    | "slate"
    | "primary";
  description: string;
  href?: string;
}) {
  const content = (
    <Card
      className={
        href
          ? "group transition-all duration-150 hover:border-primary/30 hover:bg-card/80"
          : ""
      }
    >
      <CardHeader className="flex flex-row items-start justify-between pb-2 pt-5">
        <CardTitle className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
          {title}
        </CardTitle>
        <IconWrapper color={iconColor} size="sm">
          <Icon className="h-3.5 w-3.5" />
        </IconWrapper>
      </CardHeader>
      <CardContent className="pb-5">
        <div className="text-[28px] font-semibold tabular-nums leading-none tracking-tight">
          {value.toLocaleString()}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground/70">
          {description}
        </p>
      </CardContent>
    </Card>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

function StatusRow({
  icon,
  label,
  count,
  bold,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <span
          className={`text-sm ${bold ? "font-semibold" : "text-muted-foreground"}`}
        >
          {label}
        </span>
      </div>
      <span
        className={`text-sm tabular-nums ${
          bold ? "font-semibold" : "text-muted-foreground"
        }`}
      >
        {count}
      </span>
    </div>
  );
}

function StatusIcon({ status }: { status: InterviewStatus }) {
  switch (status) {
    case "COMPLETED":
      return (
        <IconWrapper color="emerald" size="sm">
          <CheckCircle2 className="h-3.5 w-3.5" />
        </IconWrapper>
      );
    case "FAILED":
      return (
        <IconWrapper color="rose" size="sm">
          <XCircle className="h-3.5 w-3.5" />
        </IconWrapper>
      );
    default:
      return (
        <IconWrapper color="amber" size="sm">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        </IconWrapper>
      );
  }
}
