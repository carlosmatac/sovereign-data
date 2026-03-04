"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STATUS_LABELS } from "@/lib/constants";
import type { InterviewStatus } from "@/types/database";
import { Clock, Mic, Upload } from "lucide-react";
import { IconWrapper } from "@/components/ui/icon-wrapper";

const PAGE_SIZE = 30;

type ProjectInterviewListItem = {
  id: string;
  title: string;
  status: InterviewStatus;
  audio_duration: number | null;
  created_at: string;
};

interface ProjectInterviewsSectionProps {
  interviews: ProjectInterviewListItem[];
  projectId: string;
  canEdit: boolean;
}

export function ProjectInterviewsSection({
  interviews,
  projectId,
  canEdit,
}: ProjectInterviewsSectionProps) {
  const [statusFilter, setStatusFilter] = useState<InterviewStatus | "all">("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filteredInterviews = useMemo(
    () =>
      statusFilter === "all"
        ? interviews
        : interviews.filter((interview) => interview.status === statusFilter),
    [interviews, statusFilter]
  );

  const visibleInterviews = filteredInterviews.slice(0, visibleCount);
  const hasMore = filteredInterviews.length > visibleCount;

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "—";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatCreatedAt = (value: string) =>
    new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const handleFilterChange = (value: string) => {
    setStatusFilter(value as InterviewStatus | "all");
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <Card>
      <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
        <CardTitle>Interviews</CardTitle>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            aria-label="Filter interviews by status"
            value={statusFilter}
            onChange={(event) => handleFilterChange(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="UPLOADING">Uploading</option>
            <option value="PROCESSING">Processing</option>
            <option value="TRANSCRIBING">Transcribing</option>
            <option value="EXTRACTING">Extracting</option>
            <option value="EMBEDDING">Embedding</option>
            <option value="COMPLETED">Completed</option>
            <option value="FAILED">Failed</option>
          </select>
          {canEdit && (
            <Button size="sm" asChild>
              <Link href={`/interviews/upload?project=${projectId}`}>
                <Upload className="mr-2 h-4 w-4" />
                Upload Interview
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {filteredInterviews.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No interviews yet for this project.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleInterviews.map((interview) => {
              const statusInfo = STATUS_LABELS[interview.status] ?? {
                label: interview.status,
                variant: "secondary" as const,
              };

              return (
                <Card
                  key={interview.id}
                  className="transition-colors hover:border-primary/50 hover:shadow-sm"
                >
                  <CardContent className="flex items-center gap-4 py-4">
                    <Link
                      href={`/interviews/${interview.id}`}
                      className="flex min-w-0 flex-1 items-center gap-4"
                    >
                      <IconWrapper color="indigo" size="md">
                        <Mic className="h-5 w-5" />
                      </IconWrapper>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{interview.title}</p>
                        <p className="text-sm text-muted-foreground">
                          Created {formatCreatedAt(interview.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDuration(interview.audio_duration)}
                        </span>
                        <Badge variant={statusInfo.variant}>
                          {statusInfo.label}
                        </Badge>
                      </div>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}

            {hasMore && (
              <div className="pt-2">
                <Button
                  variant="outline"
                  onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                >
                  Load more
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
