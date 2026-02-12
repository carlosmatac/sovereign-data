import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Mic, Clock } from "lucide-react";
import Link from "next/link";
import { STATUS_LABELS } from "@/lib/constants";

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

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "—";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Interviews</h1>
          <p className="mt-1 text-muted-foreground">
            Audio interviews being processed through the intelligence pipeline.
          </p>
        </div>
        <Button asChild>
          <Link href="/interviews/upload">
            <Plus className="mr-2 h-4 w-4" />
            Upload Interview
          </Link>
        </Button>
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
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Mic className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="font-semibold">No interviews yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload your first audio interview to start extracting intelligence.
            </p>
            <Button className="mt-4" asChild>
              <Link href="/interviews/upload">
                <Plus className="mr-2 h-4 w-4" />
                Upload Interview
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {interviews.map((interview) => {
            const statusInfo = STATUS_LABELS[interview.status] ?? {
              label: interview.status,
              color: "bg-gray-100 text-gray-800",
            };

            return (
              <Link
                key={interview.id}
                href={`/interviews/${interview.id}`}
              >
                <Card className="transition-colors hover:border-primary/50 hover:shadow-sm">
                  <CardContent className="flex items-center gap-4 py-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Mic className="h-5 w-5 text-muted-foreground" />
                    </div>
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
                      <Badge
                        variant="secondary"
                        className={statusInfo.color}
                      >
                        {statusInfo.label}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
