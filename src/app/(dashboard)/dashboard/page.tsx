import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import {
  Mic,
  FolderKanban,
  Users,
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
import type { InterviewStatus } from "@/types/database";
import { InterviewsByProjectChart } from "@/components/dashboard/interviews-by-project-chart";
import { TopicDistributionChart } from "@/components/dashboard/topic-distribution-chart";
import {
  MetricCard,
  SectionSurface,
  IconWell,
  StatusPill,
} from "@/components/panels";

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

  const hasCharts = projectBreakdown.length > 0 || topTopics.length > 0;

  return (
    <div className="px-5 py-6 lg:px-8 lg:py-7">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p
            className="mb-1.5 text-[11px] font-semibold uppercase"
            style={{
              letterSpacing: "0.14em",
              color: "rgba(255,255,255,0.42)",
            }}
          >
            Intelligence Platform
          </p>
          <h1
            className="text-[28px] font-semibold text-white"
            style={{ letterSpacing: "-0.020em", lineHeight: 1.05 }}
          >
            Dashboard
          </h1>
        </div>
        <Button asChild className="gap-2">
          <Link href="/interviews/upload">
            <Upload className="h-4 w-4" />
            Upload Interview
          </Link>
        </Button>
      </div>

      {/* ── KPI Row — 3 metrics ────────────────────────────────── */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatLink
          href="/projects"
          label="Projects"
          value={projectCount}
          sub="Active intelligence projects"
          icon={
            <FolderKanban className="h-[12px] w-[12px]" strokeWidth={1.6} />
          }
          accent="#5B9CF6"
        />
        <StatLink
          href="/interviews"
          label="Interviews"
          value={interviewCount}
          sub={`${completedCount} completed · ${processingCount} processing`}
          icon={<Mic className="h-[12px] w-[12px]" strokeWidth={1.6} />}
          accent="#818CF8"
        />
        <StatLink
          href="/network"
          label="Entities"
          value={entityCount}
          sub={`${relationshipCount} relationships mapped`}
          icon={<Users className="h-[12px] w-[12px]" strokeWidth={1.6} />}
          accent="#FBBF24"
        />
      </div>

      {/* ── Primary grid: Recent + side rail ─────────────────── */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* Recent Interviews — spans 8 cols on wide */}
        <div className="lg:col-span-8">
          <SectionSurface
            header={{
              title: "Recent Interviews",
              subtitle: "Latest uploaded recordings",
              right: (
                <Link
                  href="/interviews"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-white/55 transition-colors duration-150 hover:text-white"
                >
                  View all
                  <ArrowUpRight className="h-[11px] w-[11px]" />
                </Link>
              ),
            }}
            bodyClassName="px-2 py-1.5"
          >
            {recentInterviews.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center">
                <Mic
                  className="mb-3 h-8 w-8 text-white/22"
                  strokeWidth={1.5}
                />
                <p className="text-[13px] text-white/55">
                  No interviews yet.{" "}
                  <Link
                    href="/interviews/upload"
                    className="text-white/85 underline decoration-white/30 underline-offset-2 transition-colors duration-150 hover:text-white"
                  >
                    Upload your first one.
                  </Link>
                </p>
              </div>
            ) : (
              <div className="flex flex-col">
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
                      className="group flex items-center gap-3 rounded-[5px] px-2.5 py-2.5 transition-colors duration-150 hover:bg-white/[0.025]"
                    >
                      <StatusWell
                        status={interview.status as InterviewStatus}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium leading-tight text-white/92">
                          {interview.title}
                        </p>
                        <p className="mt-[4px] truncate text-[11px] text-white/50">
                          {project?.name}
                          {project?.country ? ` · ${project.country}` : ""}
                          <span className="text-white/32">
                            {"  ·  "}
                            {new Date(interview.created_at).toLocaleDateString(
                              "en-GB",
                              {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              }
                            )}
                          </span>
                        </p>
                      </div>
                      <InterviewStatusPill
                        label={statusInfo.label}
                        status={interview.status as InterviewStatus}
                      />
                    </Link>
                  );
                })}
              </div>
            )}
          </SectionSurface>
        </div>

        {/* Right rail — spans 4 cols on wide */}
        <div className="flex flex-col gap-4 lg:col-span-4">
          {/* Pipeline Status (top of rail — most informational) */}
          <SectionSurface
            header={{
              title: "Pipeline Status",
              subtitle: "Interview processing",
            }}
            bodyClassName="px-4 py-3.5"
          >
            <div className="flex flex-col gap-3">
              <StatusRow
                label="Completed"
                count={completedCount}
                accent="#4ADE80"
                icon={<CheckCircle2 className="h-[12px] w-[12px]" strokeWidth={1.8} />}
              />
              <StatusRow
                label="Processing"
                count={processingCount}
                accent="#5B9CF6"
                icon={
                  <Loader2
                    className="h-[12px] w-[12px] animate-spin"
                    strokeWidth={1.8}
                  />
                }
              />
              <StatusRow
                label="Failed"
                count={failedCount}
                accent="#F87171"
                icon={<XCircle className="h-[12px] w-[12px]" strokeWidth={1.8} />}
              />
              <div
                className="mt-0.5 pt-3"
                style={{ borderTop: "1px solid rgba(147,147,147,0.10)" }}
              >
                <StatusRow
                  label="Total"
                  count={interviewCount}
                  accent="#94A3B8"
                  icon={<Mic className="h-[12px] w-[12px]" strokeWidth={1.8} />}
                  bold
                />
              </div>
            </div>
          </SectionSurface>

          {/* Quick Actions */}
          <SectionSurface
            header={{ title: "Quick Actions" }}
            bodyClassName="grid grid-cols-2 gap-2 p-3"
          >
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
              <Link
                key={href}
                href={href}
                className="sv-hover-card flex items-center gap-2 rounded-[5px] border border-[rgba(147,147,147,0.15)] px-2.5 py-2.5 text-[11.5px] font-medium text-white/80 hover:text-white"
              >
                <Icon
                  className="h-[14px] w-[14px] shrink-0 text-white/55"
                  strokeWidth={1.6}
                />
                <span className="truncate">{label}</span>
              </Link>
            ))}
          </SectionSurface>
        </div>
      </div>

      {/* ── Analytics Row — Charts ─────────────────────────────── */}
      {hasCharts && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {projectBreakdown.length > 0 && (
            <SectionSurface
              header={{
                title: "Interviews by Project",
                subtitle: "Completed interviews per project",
                right: (
                  <TrendingUp
                    className="h-[13px] w-[13px] text-white/45"
                    strokeWidth={1.6}
                  />
                ),
              }}
            >
              <InterviewsByProjectChart data={projectBreakdown} />
            </SectionSurface>
          )}

          {topTopics.length > 0 && (
            <SectionSurface
              header={{
                title: "Topic Distribution",
                subtitle: `Top ${topTopics.length} themes across all interviews`,
                right: (
                  <Hash
                    className="h-[13px] w-[13px] text-white/45"
                    strokeWidth={1.6}
                  />
                ),
              }}
            >
              <TopicDistributionChart data={topTopics} />
            </SectionSurface>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function StatLink({
  href,
  label,
  value,
  sub,
  icon,
  accent,
}: {
  href: string;
  label: string;
  value: number;
  sub: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <Link href={href} className="block">
      <MetricCard
        label={label}
        value={value.toLocaleString()}
        sub={sub}
        icon={icon}
        accent={accent}
      />
    </Link>
  );
}

function StatusRow({
  label,
  count,
  icon,
  accent,
  bold,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  accent: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <IconWell accent={accent} size={22} shape="square">
          <span style={{ color: accent }}>{icon}</span>
        </IconWell>
        <span
          className={`text-[12.5px] ${
            bold ? "font-semibold text-white" : "text-white/70"
          }`}
        >
          {label}
        </span>
      </div>
      <span
        className={`text-[13px] tabular-nums ${
          bold ? "font-semibold text-white" : "text-white/62"
        }`}
      >
        {count}
      </span>
    </div>
  );
}

function StatusWell({ status }: { status: InterviewStatus }) {
  const { color, icon } = (() => {
    switch (status) {
      case "COMPLETED":
        return {
          color: "#4ADE80",
          icon: <CheckCircle2 className="h-[13px] w-[13px]" strokeWidth={1.8} />,
        };
      case "FAILED":
        return {
          color: "#F87171",
          icon: <XCircle className="h-[13px] w-[13px]" strokeWidth={1.8} />,
        };
      default:
        return {
          color: "#FBBF24",
          icon: (
            <Loader2
              className="h-[13px] w-[13px] animate-spin"
              strokeWidth={1.8}
            />
          ),
        };
    }
  })();

  return (
    <IconWell accent={color} size={28}>
      <span style={{ color }}>{icon}</span>
    </IconWell>
  );
}

function InterviewStatusPill({
  label,
  status,
}: {
  label: string;
  status: InterviewStatus;
}) {
  const tone: React.ComponentProps<typeof StatusPill>["tone"] = (() => {
    switch (status) {
      case "COMPLETED":
        return "live";
      case "FAILED":
        return "confidential";
      default:
        return "draft";
    }
  })();
  return <StatusPill tone={tone} text={label} />;
}
