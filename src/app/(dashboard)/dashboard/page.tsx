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
  Search,
  TrendingUp,
  Clock,
  CheckCircle2,
  Loader2,
  XCircle,
  Upload,
  ArrowRight,
  Globe,
  MessageSquare,
  Network,
  Link2,
  Hash,
} from "lucide-react";
import Link from "next/link";
import { STATUS_LABELS } from "@/lib/constants";
import type { InterviewStatus } from "@/types/database";

export default async function DashboardPage() {
  const supabase = await createClient();
  const admin = createAdminClient();

  // Verify auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // ── Fetch aggregate data ────────────────────────────────────────
  // All queries in parallel
  const [
    projectsResult,
    interviewsResult,
    chunksResult,
    entitiesResult,
    recentInterviewsResult,
    relationshipsResult,
    allInterviewsResult,
  ] = await Promise.all([
    admin.from("projects").select("id, name, country", { count: "exact" }),
    admin.from("interviews").select("id, status", { count: "exact" }),
    admin
      .from("interview_chunks")
      .select("id", { count: "exact", head: true }),
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
  const chunkCount = chunksResult.count ?? 0;
  const entityCount = entitiesResult.count ?? 0;
  const recentInterviews = recentInterviewsResult.data ?? [];
  const relationshipCount = relationshipsResult.count ?? 0;
  const completedInterviews = allInterviewsResult.data ?? [];

  // Compute status breakdown
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
  const maxProjectCount = Math.max(1, ...projectBreakdown.map((p) => p.total));

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
    .slice(0, 12);
  const maxTopicCount = Math.max(1, ...topTopics.map(([, c]) => c));

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Overview of your intelligence platform activity.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Projects"
          value={projectCount}
          icon={FolderKanban}
          description="Active intelligence projects"
          href="/projects"
        />
        <StatsCard
          title="Interviews"
          value={interviewCount}
          icon={Mic}
          description={`${completedCount} completed, ${processingCount} processing`}
          href="/interviews"
        />
        <StatsCard
          title="Knowledge Chunks"
          value={chunkCount}
          icon={Search}
          description="Searchable transcript segments"
          href="/search"
        />
        <StatsCard
          title="Entities"
          value={entityCount}
          icon={Users}
          description={`${relationshipCount} relationships mapped`}
          href="/network"
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Interviews */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">Recent Interviews</CardTitle>
                <CardDescription>
                  Latest uploaded interview recordings
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/interviews/upload">
                  <Upload className="mr-2 h-3.5 w-3.5" />
                  Upload
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {recentInterviews.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <Mic className="mb-2 h-8 w-8 text-muted-foreground/50" />
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
                <div className="space-y-3">
                  {recentInterviews.map((interview) => {
                    const project = interview.projects as unknown as {
                      name: string;
                      country: string | null;
                    } | null;
                    const statusInfo = STATUS_LABELS[interview.status] ?? {
                      label: interview.status,
                      color: "bg-gray-100 text-gray-800",
                    };

                    return (
                      <Link
                        key={interview.id}
                        href={`/interviews/${interview.id}`}
                        className="block"
                      >
                        <div className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50">
                          <div className="flex items-center gap-3">
                            <StatusIcon status={interview.status as InterviewStatus} />
                            <div>
                              <p className="text-sm font-medium">
                                {interview.title}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {project?.name}
                                {project?.country
                                  ? ` — ${project.country}`
                                  : ""}
                                {" · "}
                                {new Date(
                                  interview.created_at
                                ).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <Badge className={`text-[10px] ${statusInfo.color}`}>
                            {statusInfo.label}
                          </Badge>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions + Status */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button variant="outline" className="justify-start" asChild>
                <Link href="/interviews/upload">
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Interview
                </Link>
              </Button>
              <Button variant="outline" className="justify-start" asChild>
                <Link href="/chat">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Intelligence Chat
                </Link>
              </Button>
              <Button variant="outline" className="justify-start" asChild>
                <Link href="/search">
                  <Search className="mr-2 h-4 w-4" />
                  Search Knowledge Base
                </Link>
              </Button>
              <Button variant="outline" className="justify-start" asChild>
                <Link href="/network">
                  <Network className="mr-2 h-4 w-4" />
                  Network Explorer
                </Link>
              </Button>
              <Button variant="outline" className="justify-start" asChild>
                <Link href="/projects/new">
                  <FolderKanban className="mr-2 h-4 w-4" />
                  New Project
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Pipeline Status */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pipeline Status</CardTitle>
              <CardDescription>Interview processing overview</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <StatusRow
                  icon={
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  }
                  label="Completed"
                  count={completedCount}
                />
                <StatusRow
                  icon={
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  }
                  label="Processing"
                  count={processingCount}
                />
                <StatusRow
                  icon={<XCircle className="h-4 w-4 text-red-500" />}
                  label="Failed"
                  count={failedCount}
                />
                <Separator />
                <StatusRow
                  icon={<Mic className="h-4 w-4 text-muted-foreground" />}
                  label="Total"
                  count={interviewCount}
                  bold
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Analytics Row */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Interviews by Project */}
        {projectBreakdown.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">
                  Interviews by Project
                </CardTitle>
              </div>
              <CardDescription>
                Completed interviews per project
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {projectBreakdown.map((project) => (
                  <div key={project.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium truncate max-w-[200px]">
                        {project.name}
                      </span>
                      <div className="flex items-center gap-2">
                        {project.country && (
                          <span className="text-xs text-muted-foreground">
                            {project.country}
                          </span>
                        )}
                        <span className="text-xs font-medium tabular-nums">
                          {project.total}
                        </span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary transition-all"
                        style={{
                          width: `${(project.total / maxProjectCount) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top Topics */}
        {topTopics.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">Topic Distribution</CardTitle>
              </div>
              <CardDescription>
                Most frequent topics across all interviews
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2.5">
                {topTopics.map(([topic, count]) => (
                  <div key={topic} className="flex items-center gap-3">
                    <span className="w-28 truncate text-sm">{topic}</span>
                    <div className="flex-1">
                      <div className="h-2 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-emerald-500 transition-all"
                          style={{
                            width: `${(count / maxTopicCount) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                    <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function StatsCard({
  title,
  value,
  icon: Icon,
  description,
  href,
}: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  href?: string;
}) {
  const content = (
    <Card className={href ? "transition-colors hover:border-primary/50" : ""}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value.toLocaleString()}</div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
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
        <span className={`text-sm ${bold ? "font-medium" : ""}`}>{label}</span>
      </div>
      <span className={`text-sm tabular-nums ${bold ? "font-bold" : "text-muted-foreground"}`}>
        {count}
      </span>
    </div>
  );
}

function StatusIcon({ status }: { status: InterviewStatus }) {
  switch (status) {
    case "COMPLETED":
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />;
    case "FAILED":
      return <XCircle className="h-4 w-4 shrink-0 text-red-500" />;
    default:
      return (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
      );
  }
}
