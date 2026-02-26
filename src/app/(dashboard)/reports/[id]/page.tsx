import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/auth/project-role";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Calendar,
  FileText,
  Loader2,
  AlertTriangle,
  Download,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { REPORT_TEMPLATES } from "@/lib/constants";
import { ShareReportButton } from "@/components/reports/share-report-button";
import { getUserProjectRole } from "@/lib/auth/project-role";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReportDetailPage({ params }: Props) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) notFound();

  const admin = createAdminClient();

  const { data: report } = await admin
    .from("reports")
    .select("*, projects(name, country), profiles(full_name)")
    .eq("id", id)
    .single();

  if (!report) notFound();

  const role = await getUserProjectRole(report.project_id);
  const canShare = role === "owner" || role === "editor";

  const project = report.projects as unknown as {
    name: string;
    country: string | null;
  } | null;
  const author = report.profiles as unknown as {
    full_name: string | null;
  } | null;

  const templateConfig =
    REPORT_TEMPLATES[report.template as keyof typeof REPORT_TEMPLATES];

  // Fetch source interview titles
  const { data: sourceInterviews } = await admin
    .from("interviews")
    .select("id, title")
    .in("id", report.interview_ids);

  const statusConfig: Record<string, { label: string; color: string }> = {
    generating: { label: "Generating...", color: "bg-yellow-100 text-yellow-800" },
    completed: { label: "Completed", color: "bg-green-100 text-green-800" },
    failed: { label: "Failed", color: "bg-red-100 text-red-800" },
  };
  const status = statusConfig[report.status] ?? statusConfig.generating;

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link
          href="/reports"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Reports
        </Link>
      </div>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {report.title}
            </h1>
            <Badge className={status.color}>{status.label}</Badge>
          </div>
          <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
            {project && <span>{project.name}</span>}
            <span>{templateConfig?.label ?? report.template}</span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {new Date(report.created_at).toLocaleDateString()}
            </span>
            {author?.full_name && <span>by {author.full_name}</span>}
          </div>
        </div>
        {report.status === "completed" && (
          <div className="flex gap-2">
            {canShare && (
              <ShareReportButton
                reportId={report.id}
                currentToken={report.share_token}
                hasPassword={!!report.share_password}
              />
            )}
            <Button variant="outline" asChild>
              <Link href={`/api/reports/${report.id}/pdf`}>
                <Download className="mr-2 h-4 w-4" />
                Export PDF
              </Link>
            </Button>
          </div>
        )}
      </div>

      {/* Source Interviews */}
      {sourceInterviews && sourceInterviews.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Source interviews ({sourceInterviews.length}):
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sourceInterviews.map((interview) => (
              <Link key={interview.id} href={`/interviews/${interview.id}`}>
                <Badge variant="secondary" className="text-xs hover:bg-muted">
                  {interview.title}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}

      <Separator className="mb-6" />

      {/* Report Content */}
      {report.status === "generating" && (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-muted-foreground" />
            <h3 className="font-semibold">Generating Report</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              GPT-4o is analyzing {report.interview_ids.length} interview
              {report.interview_ids.length > 1 ? "s" : ""} and writing your
              report. This may take 30–60 seconds.
            </p>
          </CardContent>
        </Card>
      )}

      {report.status === "failed" && (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <AlertTriangle className="mb-4 h-8 w-8 text-destructive" />
            <h3 className="font-semibold">Generation Failed</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {report.error_message ?? "An unknown error occurred."}
            </p>
            <Button className="mt-4" variant="outline" asChild>
              <Link href="/reports/new">Try Again</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {report.status === "completed" && report.content && (
        <article className="prose prose-sm dark:prose-invert mx-auto max-w-none rounded-lg border bg-background p-8">
          <ReactMarkdown>{report.content}</ReactMarkdown>
        </article>
      )}
    </div>
  );
}
