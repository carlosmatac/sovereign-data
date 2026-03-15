import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/auth/project-role";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Mic, Clock, FolderKanban } from "lucide-react";
import Link from "next/link";
import { STATUS_LABELS } from "@/lib/constants";
import { IconWrapper } from "@/components/ui/icon-wrapper";
import { DeleteInterviewButton } from "@/components/interviews/delete-interview-button";

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

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">All Interviews</h1>
          <p className="mt-1 text-muted-foreground">
            Cross-project interview index. For day-to-day workflow, start in Projects
            and manage interviews in project context.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/projects">
              <FolderKanban className="mr-2 h-4 w-4" />
              View Projects
            </Link>
          </Button>
          {canUpload && (
            <Button asChild>
              <Link href="/interviews/upload">
                <Plus className="mr-2 h-4 w-4" />
                Upload Interview
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Interview List */}
      {error ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Failed to load interviews. Please try again.
          </CardContent>
        </Card>
      ) : !interviews || interviews.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <IconWrapper color="indigo" size="lg" className="mb-4">
              <Mic className="h-7 w-7" />
            </IconWrapper>
            <h3 className="font-semibold">No interviews yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload your first audio interview to start extracting intelligence.
            </p>
            {canUpload && (
              <Button className="mt-4" asChild>
                <Link href="/interviews/upload">
                  <Plus className="mr-2 h-4 w-4" />
                  Upload Interview
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {interviews.map((interview) => {
            const statusInfo = STATUS_LABELS[interview.status] ?? {
              label: interview.status,
              variant: "secondary" as const,
            };

            return (
              <Card key={interview.id} className="transition-colors hover:border-primary/50 hover:shadow-sm">
                <CardContent className="flex items-center gap-4 py-4">
                  <Link
                    href={`/interviews/${interview.id}`}
                    className="flex min-w-0 flex-1 items-center gap-4"
                  >
                    <IconWrapper color="indigo" size="md">
                      <Mic className="h-5 w-5" />
                    </IconWrapper>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {interview.title}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {(interview as Record<string, unknown>).projects
                          ? String(
                              ((interview as Record<string, unknown>).projects as Record<string, unknown>)?.name ?? ""
                            )
                          : "Unknown project"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {interview.audio_duration && (
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDuration(interview.audio_duration)}
                        </span>
                      )}
                      <Badge variant={statusInfo.variant}>
                        {statusInfo.label}
                      </Badge>
                    </div>
                  </Link>
                  {editableProjectIds.has(interview.project_id) && (
                    <DeleteInterviewButton
                      interviewId={interview.id}
                      interviewTitle={interview.title}
                      variant="icon"
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
