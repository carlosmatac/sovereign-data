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

  // Resolve the projects this user is a member of.  All subsequent reads
  // are scoped to these IDs so the dashboard never leaks data from projects
  // the user has not joined.  The admin client is needed here because
  // auth.uid() is NULL in the PostgREST context — same pattern used across
  // all project-membership checks in this codebase.
  const { data: memberships } = await admin
    .from("project_members")
    .select("project_id")
    .eq("user_id", user.id);
  const projectIds = (memberships ?? []).map((m) => m.project_id);

  // With no project memberships every count is genuinely zero — skip DB
  // round-trips and fall straight through to the "no data" empty states.
  const [
    projectsResult,
    interviewsResult,
    entitiesResult,
    recentInterviewsResult,
    relationshipsResult,
    allInterviewsResult,
  ] = projectIds.length === 0
    ? [
        { data: [], count: 0 },
        { data: [], count: 0 },
        { count: 0 },
        { data: [] },
        { count: 0 },
        { data: [] },
      ]
    : await Promise.all([
        // Projects — scoped to user's memberships
        admin
          .from("projects")
          .select("id, name, country", { count: "exact" })
          .in("id", projectIds),
        // Sources — scoped to user's projects
        admin
          .from("interviews")
          .select("id, status", { count: "exact" })
          .in("project_id", projectIds),
        // Entities — tenant-scoped via RLS (entities are a shared knowledge
        // graph within a tenant; no project_id column exists on this table).
        supabase.from("entities").select("id", { count: "exact", head: true }),
        // Recent sources — scoped to user's projects
        admin
          .from("interviews")
          .select("id, title, status, created_at, projects(name, country)")
          .in("project_id", projectIds)
          .order("created_at", { ascending: false })
          .limit(12),
        // Active relationship count — tenant-scoped via RLS (entity_relationships
        // has no project_id column; scoping via interview_id join would require
        // a separate round-trip and is deferred to a future query optimisation).
        supabase
          .from("entity_relationships")
          .select("id", { count: "exact", head: true })
          .neq("review_status", "rejected"),
        // All completed sources — scoped to user's projects (drives charts)
        admin
          .from("interviews")
          .select("id, status, topics, project_id, projects(name)")
          .in("project_id", projectIds)
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
          sub="Active knowledge projects"
          icon={
            <FolderKanban className="h-[12px] w-[12px]" strokeWidth={1.6} />
          }
          accent="#5B9CF6"
        />
        <StatLink
          href="/interviews"
          label="Knowledge"
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

      {/* ── Primary grid: 8/4 column split ─────────────────────── *
       *
       * Layout note — the dashboard is now a true 2-column workspace
       * rather than a "row of boxes followed by another row of boxes".
       * Each column owns its own vertical stack and decides its own
       * natural height (`items-start`):
       *
       *   left col (col-span-8):
       *     · Recent Knowledge
       *     · Charts row (Knowledge-by-Project + Topic Distribution
       *       side-by-side via an inner 2-col grid)
       *   right rail (col-span-4):
       *     · Pipeline Status
       *     · Quick Actions
       *
       * Why: previously Recent Interviews sat alone in col-span-8 and
       * the charts sat in a second full-width grid below, so when the
       * interview list was short the right rail still pushed the
       * primary row to ~400px tall while the left column stayed at
       * ~120px — creating a giant dead rectangle below Recent
       * Interviews. Pulling the charts up into the left column fills
       * that vertical space with real content; the right rail's height
       * is now matched by Recent + charts on the left, so the first
       * viewport feels intentional even with one interview.
       *
       * Behaviour preserved: charts still only render when there is
       * data (`projectBreakdown` / `topTopics`). On `<lg` breakpoints
       * everything stacks into a single column unchanged.
       */}
      <div className="grid items-start gap-4 lg:grid-cols-12">
        {/* Left column — Recent Knowledge + charts */}
        <div className="flex flex-col gap-4 lg:col-span-8">
          <SectionSurface
            tone="lifted"
            header={{
              title: "Recent Knowledge",
              subtitle: "Latest uploaded sources",
              right: (
                <Link
                  href="/interviews"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-white/55 transition-colors duration-150 hover:text-white"
                >
                  View all knowledge
                  <ArrowUpRight className="h-[11px] w-[11px]" />
                </Link>
              ),
            }}
            bodyClassName="p-2"
          >
            {recentInterviews.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
                <BookOpen
                  className="mb-3 h-7 w-7 text-white/22"
                  strokeWidth={1.5}
                />
                <p className="text-[12.5px] text-white/55">
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
              <div className="flex flex-col gap-1">
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

          {/*
           * Charts row — pulled into the left column so they sit
           * adjacent to the right rail rather than below the entire
           * primary grid. On wide breakpoints the two charts stand
           * side-by-side via an inner 2-col grid; on narrow they
           * stack. Only renders when there is data on either side.
           */}
          {hasCharts && (
            <div className="grid gap-4 xl:grid-cols-2">
              {projectBreakdown.length > 0 && (
                <SectionSurface
                  tone="lifted"
                  header={{
                    title: "Knowledge by Project",
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
                      background: "#07080C",
                      border: "1px solid rgba(147,147,147,0.08)",
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
                      background: "#07080C",
                      border: "1px solid rgba(147,147,147,0.08)",
                    }}
                  >
                    <TopicDistributionChart data={topTopics} />
                  </div>
                </SectionSurface>
              )}
            </div>
          )}
        </div>

        {/* Right rail — Pipeline Status + Quick Actions */}
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

          {/* Quick Actions — single-column action module
            *
            * Replaced the old 2×2 equal-weight tile grid (which made
            * every action feel equally important and template-y) with
            * a vertical list that establishes a clear hierarchy:
            *
            *   [ Add Source ]   ← primary, slightly lifted
            *   ─────────────────────
            *   • Copilot            ↗
            *   • Network Explorer   ↗
            *   • New Project        ↗
            *
            * Each row aligns to a consistent 14px icon well, leaves
            * the trailing chevron muted at rest and lifts on hover,
            * matching the shared `sv-hover-card` motion vocabulary.
            */}
          <SectionSurface
            tone="lifted"
            header={{ title: "Quick Actions" }}
            bodyClassName="flex flex-col gap-1 p-2"
          >
            <PrimaryQuickAction
              href="/interviews/upload"
              icon={Upload}
              label="Add Source"
              caption="Add a new source"
            />
            <div
              aria-hidden
              className="my-1 h-px"
              style={{ background: "rgba(147,147,147,0.10)" }}
            />
            {[
              {
                href: "/chat",
                icon: MessageSquare,
                label: "Copilot",
                caption: "Ask the knowledge layer",
                accent: "#A78BFA",
              },
              {
                href: "/network",
                icon: Network,
                label: "Network Explorer",
                caption: "Browse entities & relationships",
                accent: "#818CF8",
              },
              {
                href: "/projects/new",
                icon: FolderKanban,
                label: "New Project",
                caption: "Start a fresh workspace",
                accent: "#D4B77C",
              },
            ].map(({ href, icon: Icon, label, caption, accent }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center gap-2.5 rounded-[5px] px-2 py-2 transition-colors duration-150 hover:bg-white/[0.035]"
              >
                <span
                  className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[4px] transition-colors duration-150 group-hover:bg-[color-mix(in_srgb,var(--accent-color)_14%,transparent)]"
                  style={
                    {
                      backgroundColor: `color-mix(in srgb, ${accent} 9%, transparent)`,
                      ["--accent-color" as string]: accent,
                    } as React.CSSProperties
                  }
                >
                  <Icon
                    className="h-[12.5px] w-[12.5px]"
                    strokeWidth={1.7}
                    style={{ color: accent }}
                  />
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/80 transition-colors duration-150 group-hover:text-white">
                  {label}
                </span>
                <ArrowUpRight
                  className="h-[11px] w-[11px] shrink-0 text-white/25 transition-colors duration-150 group-hover:text-white/65"
                  strokeWidth={1.8}
                />
              </Link>
            ))}
          </SectionSurface>
        </div>
      </div>
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

/**
 * Primary action row inside the Quick Actions module.
 *
 * Sits at the top of the action list with a slightly lifted tonal
 * fill so it reads as the headline action ("Upload Interview"), while
 * the secondary actions below are ghost rows. Borrows the tonal
 * action button vocabulary (subtle white tint + hairline border) but
 * with a generous two-line stack (label + caption) to read as a
 * module entry rather than a chip.
 */
function PrimaryQuickAction({
  href,
  icon: Icon,
  label,
  caption,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  caption: string;
}) {
  return (
    <Link
      href={href}
      className="sv-hover-card group flex items-center gap-3 rounded-[5px] border px-2.5 py-2.5"
      style={{
        backgroundColor: "rgba(255,255,255,0.03)",
        borderColor: "rgba(147,147,147,0.14)",
      }}
    >
      <span
        className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-150 group-hover:bg-white/[0.07]"
        style={{
          backgroundColor: "rgba(255,255,255,0.04)",
          borderColor: "rgba(147,147,147,0.18)",
        }}
      >
        <Icon className="h-[13px] w-[13px]" strokeWidth={1.7} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[12.5px] font-semibold text-white/92">
          {label}
        </span>
        <span
          className="mt-[3px] truncate text-[10.5px] text-white/45"
          style={{ letterSpacing: "-0.005em" }}
        >
          {caption}
        </span>
      </div>
      <ArrowUpRight
        className="h-[12px] w-[12px] shrink-0 text-white/35 transition-colors duration-150 group-hover:text-white/75"
        strokeWidth={1.8}
      />
    </Link>
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
