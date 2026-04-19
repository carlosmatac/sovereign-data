import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/auth/project-role";
import { Plus, Mic, Clock, FolderKanban } from "lucide-react";
import Link from "next/link";
import { STATUS_LABELS } from "@/lib/constants";
import { DeleteInterviewButton } from "@/components/interviews/delete-interview-button";
import {
  SectionSurface,
  IconWell,
  SectionChip,
  StatusPill,
  TonalActionButton,
} from "@/components/panels";
import type { InterviewStatus } from "@/types/database";
import { interviewSourceMeta } from "@/lib/interview-source";

export default async function InterviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project: projectFilter } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("interviews")
    .select("*, projects(name)")
    .order("created_at", { ascending: false });

  if (projectFilter) {
    query = query.eq("project_id", projectFilter);
  }

  const { data: interviews, error } = await query;

  // Fetch user's editable project IDs for role-based UI
  const user = await getAuthUser();
  const admin = createAdminClient();
  const { data: editableMemberships } = user
    ? await admin
        .from("project_members")
        .select("project_id")
        .eq("user_id", user.id)
        .in("role", ["owner", "editor"])
    : { data: [] };

  const editableProjectIds = new Set(
    (editableMemberships ?? []).map((m) => m.project_id)
  );
  const canUpload = editableProjectIds.size > 0;

  const formatDuration = (seconds: number | null) => {
    if (!seconds || seconds <= 0) return "—";
    const total = Math.round(seconds);
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hrs > 0)
      return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  const statusPillTone = (
    status: InterviewStatus
  ): React.ComponentProps<typeof StatusPill>["tone"] => {
    switch (status) {
      case "COMPLETED":
        return "live";
      case "FAILED":
        return "confidential";
      default:
        return "draft";
    }
  };

  return (
    <div className="px-5 py-6 lg:px-8 lg:py-7">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-[28px] font-semibold text-white"
            style={{ letterSpacing: "-0.020em", lineHeight: 1.05 }}
          >
            All Interviews
          </h1>
          <p className="mt-1.5 max-w-xl text-[13px] leading-[1.6] text-white/62">
            Cross-project interview index. For day-to-day workflow, start in
            Projects and manage interviews in project context.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TonalActionButton
            href="/projects"
            icon={
              <FolderKanban
                className="h-[12px] w-[12px]"
                strokeWidth={1.8}
              />
            }
          >
            View Projects
          </TonalActionButton>
          {canUpload && (
            <TonalActionButton
              href="/interviews/upload"
              icon={<Plus className="h-[12px] w-[12px]" strokeWidth={2} />}
            >
              Upload Interview
            </TonalActionButton>
          )}
        </div>
      </div>

      {/* Interview List */}
      {error ? (
        <SectionSurface>
          <p className="py-10 text-center text-[13px] text-white/60">
            Failed to load interviews. Please try again.
          </p>
        </SectionSurface>
      ) : !interviews || interviews.length === 0 ? (
        <SectionSurface bodyClassName="flex flex-col items-center py-16 text-center">
          <IconWell accent="#818CF8" size={44}>
            <Mic
              className="h-[18px] w-[18px]"
              style={{ color: "#818CF8" }}
              strokeWidth={1.5}
            />
          </IconWell>
          <h3 className="mt-3 text-[14px] font-semibold text-white/92">
            No interviews yet
          </h3>
          <p className="mt-1.5 text-[12.5px] text-white/60">
            Upload your first audio interview to start extracting intelligence.
          </p>
          {canUpload && (
            <div className="mt-4">
              <TonalActionButton
                href="/interviews/upload"
                icon={<Plus className="h-[12px] w-[12px]" strokeWidth={2} />}
              >
                Upload Interview
              </TonalActionButton>
            </div>
          )}
        </SectionSurface>
      ) : (
        <SectionSurface
          header={{
            title: "Interviews",
            subtitle: `${interviews.length} recording${interviews.length === 1 ? "" : "s"}`,
          }}
          bodyClassName="p-2"
        >
          <div className="flex flex-col">
            {interviews.map((interview) => {
              const statusInfo = STATUS_LABELS[interview.status] ?? {
                label: interview.status,
                variant: "secondary" as const,
              };
              const project = (
                interview as Record<string, unknown>
              ).projects as { name?: string } | null;
              /*
               * Source-type metadata drives BOTH the leading IconWell
               * icon (Mic / FileText / Video) and the colour-coded source
               * pill in the right metadata cluster. Showing the pill on
               * every row — not only when audio_duration is missing —
               * means users can identify the source kind at a glance even
               * before they notice the duration column. The pill follows
               * the standard SectionChip tonal recipe, matching every
               * other accent pill in the system.
               */
              const source = interviewSourceMeta(interview.source_type);
              const SourceIcon = source.Icon;
              const hasDuration =
                interview.source_type !== "document" &&
                interview.audio_duration != null &&
                interview.audio_duration > 0;

              return (
                <div
                  key={interview.id}
                  className="group flex items-center gap-3 rounded-[5px] px-2.5 py-2.5 transition-colors duration-150 hover:bg-white/[0.025]"
                >
                  <Link
                    href={`/interviews/${interview.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <IconWell accent={source.color} size={32}>
                      <SourceIcon
                        className="h-[14px] w-[14px]"
                        style={{ color: source.color }}
                        strokeWidth={1.8}
                      />
                    </IconWell>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold leading-tight text-white/92">
                        {interview.title}
                      </p>
                      <p className="mt-[4px] truncate text-[11.5px] text-white/50">
                        {project?.name ?? "Unknown project"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <SectionChip tone="accent" color={source.color} dot>
                        {source.label}
                      </SectionChip>
                      {hasDuration && (
                        <span className="flex items-center gap-1 text-[11.5px] tabular-nums text-white/55">
                          <Clock
                            className="h-[11px] w-[11px]"
                            strokeWidth={1.5}
                          />
                          {formatDuration(interview.audio_duration)}
                        </span>
                      )}
                      <StatusPill
                        tone={statusPillTone(
                          interview.status as InterviewStatus
                        )}
                        text={statusInfo.label}
                      />
                    </div>
                  </Link>
                  {editableProjectIds.has(interview.project_id) && (
                    <DeleteInterviewButton
                      interviewId={interview.id}
                      interviewTitle={interview.title}
                      variant="icon"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </SectionSurface>
      )}
    </div>
  );
}
