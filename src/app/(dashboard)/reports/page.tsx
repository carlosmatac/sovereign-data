import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/auth/project-role";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Calendar, Loader2, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { REPORT_TEMPLATES } from "@/lib/constants";

const STATUS_CONFIG: Record<string, { label: string; variant: "warning" | "success" | "destructive-soft"; icon: typeof FileText }> = {
  generating: { label: "Generating", variant: "warning", icon: Loader2 },
  completed: { label: "Completed", variant: "success", icon: FileText },
  failed: { label: "Failed", variant: "destructive-soft", icon: AlertTriangle },
};

export default async function ReportsPage() {
  const user = await getAuthUser();
  const admin = createAdminClient();

  // Fetch user's editable projects to determine if they can create reports
  const { data: editableMemberships } = user
    ? await admin
        .from("project_members")
        .select("project_id")
        .eq("user_id", user.id)
        .in("role", ["owner", "editor"])
    : { data: [] };

  const canCreate = (editableMemberships ?? []).length > 0;

  // Fetch all reports the user has access to (via project membership)
  const supabase = await createClient();
  const { data: reports, error } = await supabase
    .from("reports")
    .select("*, projects(name)")
    .order("created_at", { ascending: false });

  return (
    <div className="p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="mt-1 text-muted-foreground">
            AI-generated business intelligence reports from your interview data.
          </p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href="/reports/new">
              <Plus className="mr-2 h-4 w-4" />
              Generate Report
            </Link>
          </Button>
        )}
      </div>

      {error ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Failed to load reports. Please try again.
          </CardContent>
        </Card>
      ) : !reports || reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <FileText className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="font-semibold">No reports yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Generate your first intelligence report from interview data.
            </p>
            {canCreate && (
              <Button className="mt-4" asChild>
                <Link href="/reports/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Generate Report
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const statusInfo = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.completed;
            const templateConfig =
              REPORT_TEMPLATES[
                report.template as keyof typeof REPORT_TEMPLATES
              ];
            const projectName = (
              report.projects as unknown as { name: string } | null
            )?.name;

            return (
              <Link key={report.id} href={`/reports/${report.id}`}>
                <Card className="transition-colors hover:border-primary/50 hover:shadow-sm">
                  <CardContent className="flex items-center gap-4 py-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{report.title}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {projectName && <span>{projectName}</span>}
                        {projectName && templateConfig && <span>·</span>}
                        {templateConfig && (
                          <span>{templateConfig.label}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(report.created_at).toLocaleDateString()}
                      </span>
                      <Badge variant={statusInfo.variant}>
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
