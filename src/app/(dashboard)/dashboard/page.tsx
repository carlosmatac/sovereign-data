import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BookOpen,
  FolderKanban,
  Users,
  CheckCircle2,
  CircleDot,
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
  TonalActionButton,
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
      .limit(12),
    // Active relationship count — matches what the Network Explorer
    // surfaces. Editorially rejected rows survive in the DB but are not
    // counted as active here. See docs/features/on-going/editable-relationship-governance.md
    admin
      .from("entity_relationships")
      .select("id", { count: "exact", head: true })
      .neq("review_status", "rejected"),
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

  // Snapshot line — derived, not invented data. Reads as an operational
  // ticker rather than a marketing tagline. Server-rendered → consistent
  // value across the whole HTTP response.
  const snapshotDate = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const snapshotScope = `${projectCount.toLocaleString()} ${
    projectCount === 1 ? "project" : "projects"
  } · ${interviewCount.toLocaleString()} ${
    interviewCount === 1 ? "source" : "sources"
  }`;

  return (
    <div className="px-5 py-6 lg:px-8 lg:py-7">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="mb-5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1
            className="text-[28px] font-semibold text-white"
            style={{ letterSpacing: "-0.020em", lineHeight: 1.05 }}
          >
            Dashboard
          </h1>
          <p
            className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-white/45"
            style={{ letterSpacing: "-0.005em" }}
          >
            <span>Snapshot · {snapshotDate}</span>
            <span aria-hidden className="text-white/22">
              ·
            </span>
            <span className="tabular-nums">{snapshotScope}</span>
          </p>
        </div>

        <TonalActionButton
          href="/interviews/upload"
          icon={<Upload className="h-[12px] w-[12px]" strokeWidth={1.8} />}
        >
          Add Source
        </TonalActionButton>
      </div>

      {/* ── KPI Row — lifted tone ─────────────────────────────── */}
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
          label="Intelligence"
          value={interviewCount}
          sub={`${completedCount} completed · ${processingCount} processing`}
          icon={<BookOpen className="h-[12px] w-[12px]" strokeWidth={1.6} />}
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
        {/* Recent Intelligence — spans 8 cols on wide */}
        <div className="lg:col-span-8">
          <SectionSurface
            tone="lifted"
            className="flex h-full flex-col"
            header={{
              title: "Recent Intelligence",
              subtitle: "Latest uploaded sources",
              right: (
                <Link
                  href="/interviews"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-white/55 transition-colors duration-150 hover:text-white"
                >
                  View all intelligence
                  <ArrowUpRight className="h-[11px] w-[11px]" />
                </Link>
              ),
            }}
            bodyClassName="flex min-h-0 flex-1 flex-col p-2"
          >
            {recentInterviews.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
                <BookOpen
                  className="mb-3 h-8 w-8 text-white/22"
                  strokeWidth={1.5}
                />
                <p className="text-[13px] text-white/55">
                  No sources yet.{" "}
                  <Link
                    href="/interviews/upload"
                    className="text-white/85 underline decoration-white/30 underline-offset-2 transition-colors duration-150 hover:text-white"
                  >
                    Add your first source.
                  </Link>
                </p>
              </div>
            ) : (
              <div className="sv-scroll-soft flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
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
                    <InterviewListRow
                      key={interview.id}
                      id={interview.id}
                      title={interview.title}
                      project={project?.name ?? null}
                      country={project?.country ?? null}
                      createdAt={interview.created_at}
                      status={interview.status as InterviewStatus}
                      statusLabel={statusInfo.label}
                    />
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
            tone="lifted"
            header={{
              title: "Pipeline Status",
              subtitle: "Source processing",
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
                  <CircleDot
                    className="h-[12px] w-[12px]"
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
                  icon={
                    <BookOpen
                      className="h-[12px] w-[12px]"
                      strokeWidth={1.8}
                    />
                  }
                  bold
                />
              </div>
            </div>
          </SectionSurface>

          {/* Quick Actions */}
          <SectionSurface
            tone="lifted"
            header={{ title: "Quick Actions" }}
            bodyClassName="grid grid-cols-2 gap-2 p-3"
          >
            {[
              {
                href: "/interviews/upload",
                icon: Upload,
                label: "Add Source",
                accent: "#5FA6A8", // dusty teal
              },
              {
                href: "/chat",
                icon: MessageSquare,
                label: "Copilot",
                accent: "#A78BFA", // soft violet
              },
              {
                href: "/network",
                icon: Network,
                label: "Network Explorer",
                accent: "#818CF8", // faded indigo
              },
              {
                href: "/projects/new",
                icon: FolderKanban,
                label: "New Project",
                accent: "#D4B77C", // restrained amber / sand
              },
            ].map(({ href, icon: Icon, label, accent }) => (
              <Link
                key={href}
                href={href}
                className="sv-hover-card group relative flex items-center gap-2.5 overflow-hidden rounded-[5px] border border-[rgba(147,147,147,0.15)] py-2.5 pl-[13px] pr-2.5 text-[11.5px] font-medium text-white/80 hover:text-white"
                style={{
                  backgroundColor: `color-mix(in srgb, ${accent} 4%, transparent)`,
                }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-1.5 left-0 w-[2px] rounded-full opacity-70 transition-opacity duration-150 group-hover:opacity-100"
                  style={{ backgroundColor: accent }}
                />
                <span
                  className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[4px]"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${accent} 11%, transparent)`,
                  }}
                >
                  <Icon
                    className="h-[13px] w-[13px]"
                    strokeWidth={1.7}
                    style={{ color: accent }}
                  />
                </span>
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
              tone="lifted"
              header={{
                title: "Intelligence by Project",
                subtitle: "Completed sources per project",
                right: (
                  <TrendingUp
                    className="h-[13px] w-[13px] text-white/45"
                    strokeWidth={1.6}
                  />
                ),
              }}
              bodyClassName="p-3"
            >
              <div
                className="rounded-[4px] p-2"
                style={{
                  background: "#070D1A",
                  border: "1px solid rgba(147,147,147,0.10)",
                }}
              >
                <InterviewsByProjectChart data={projectBreakdown} />
              </div>
            </SectionSurface>
          )}

          {topTopics.length > 0 && (
            <SectionSurface
              tone="lifted"
              header={{
                title: "Topic Distribution",
                subtitle: `Top ${topTopics.length} themes across all sources`,
                right: (
                  <Hash
                    className="h-[13px] w-[13px] text-white/45"
                    strokeWidth={1.6}
                  />
                ),
              }}
              bodyClassName="p-3"
            >
              <div
                className="rounded-[4px] p-2"
                style={{
                  background: "#070D1A",
                  border: "1px solid rgba(147,147,147,0.10)",
                }}
              >
                <TopicDistributionChart data={topTopics} />
              </div>
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
        tone="lifted"
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

/**
 * Recent Interviews row — composed in the spirit of the panel-system
 * `ListRow` primitive (leading IconWell, primary title, tiered metadata,
 * trailing status pill) but rendered inline so the row can be a Next.js
 * `<Link>` (the primitive's `onClick` doesn't do client-side navigation).
 *
 * Visual contract mirrors `src/components/panels/ListRow.tsx`:
 *   - 52px min height, `px-3` padding, 6px radius.
 *   - 1px hairline border at `rgba(147,147,147,0.10)` so consecutive rows
 *     read as a structured list, not a stack of free-floating items.
 *   - Hover lights border to 0.26 + lifts background to white/[0.025],
 *     same recipe as `ListRow`.
 *   - Title 12.5px / 600 / white-92, caption 10.5px / white-50 with a
 *     subdued separator dot at white/22, status pill on the right.
 */
function InterviewListRow({
  id,
  title,
  project,
  country,
  createdAt,
  status,
  statusLabel,
}: {
  id: string;
  title: string;
  project: string | null;
  country: string | null;
  createdAt: string;
  status: InterviewStatus;
  statusLabel: string;
}) {
  const formattedDate = new Date(createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <Link
      href={`/interviews/${id}`}
      className="group flex items-center gap-3 rounded-[6px] border px-3 py-2.5 transition-colors duration-150 hover:border-[rgba(147,147,147,0.26)] hover:bg-white/[0.025]"
      style={{
        minHeight: 52,
        borderColor: "rgba(147,147,147,0.10)",
      }}
    >
      <StatusWell status={status} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-semibold leading-tight text-white/92">
          {title}
        </p>
        <p className="mt-[4px] flex flex-wrap items-center gap-x-1.5 truncate text-[10.5px] leading-snug text-white/50">
          {project && <span className="truncate">{project}</span>}
          {project && country && (
            <span aria-hidden className="text-white/22">
              ·
            </span>
          )}
          {country && <span className="truncate">{country}</span>}
          {(project || country) && (
            <span aria-hidden className="text-white/22">
              ·
            </span>
          )}
          <span className="tabular-nums text-white/38">{formattedDate}</span>
        </p>
      </div>
      <div className="shrink-0">
        <InterviewStatusPill label={statusLabel} status={status} />
      </div>
    </Link>
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
            <CircleDot className="h-[13px] w-[13px]" strokeWidth={1.8} />
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
