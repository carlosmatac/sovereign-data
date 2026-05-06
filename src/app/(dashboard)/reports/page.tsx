import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/auth/project-role";
import { Button } from "@/components/ui/button";
import { Plus, FileText, Calendar, Loader2, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { REPORT_TEMPLATES } from "@/lib/constants";
import {
  SectionSurface,
  IconWell,
  StatusPill,
} from "@/components/panels";

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    tone: React.ComponentProps<typeof StatusPill>["tone"];
    icon: typeof FileText;
  }
> = {
  generating: { label: "Generating", tone: "draft", icon: Loader2 },
  completed: { label: "Completed", tone: "ready", icon: FileText },
  failed: { label: "Failed", tone: "confidential", icon: AlertTriangle },
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
    <div className="px-5 py-6 lg:px-8 lg:py-7">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p
            className="mb-1.5 text-[11px] font-semibold uppercase"
            style={{
              letterSpacing: "0.14em",
              color: "rgba(255,255,255,0.42)",
            }}
          >
            Aksum · Reports
          </p>
          <h1
            className="font-normal text-white"
            style={{
              fontFamily:
                "'Playfair Display', 'Playfair Display Fallback', Georgia, serif",
              fontSize: "34px",
              letterSpacing: "-0.022em",
              lineHeight: 1.06,
            }}
          >
            Reports
          </h1>
          <p className="mt-2 max-w-xl text-[13px] leading-[1.6] text-white/62">
            AI-generated knowledge reports from your source data.
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
        <SectionSurface>
          <p className="py-10 text-center text-[13px] text-white/60">
            Failed to load reports. Please try again.
          </p>
        </SectionSurface>
      ) : !reports || reports.length === 0 ? (
        <SectionSurface bodyClassName="flex flex-col items-center py-16 text-center">
          <IconWell accent="#7DD3FC" size={48}>
            <FileText
              className="h-[18px] w-[18px]"
              style={{ color: "#7DD3FC" }}
              strokeWidth={1.5}
            />
          </IconWell>
          <h3 className="mt-3 text-[14px] font-semibold text-white/92">
            No reports yet
          </h3>
          <p className="mt-1.5 text-[12.5px] text-white/60">
            Generate your first knowledge report from source data.
          </p>
          {canCreate && (
            <Button className="mt-4" asChild>
              <Link href="/reports/new">
                <Plus className="mr-2 h-4 w-4" />
                Generate Report
              </Link>
            </Button>
          )}
        </SectionSurface>
      ) : (
        <SectionSurface
          header={{
            title: "All reports",
            subtitle: `${reports.length} document${reports.length === 1 ? "" : "s"}`,
          }}
          bodyClassName="p-2"
        >
          <div className="flex flex-col">
            {reports.map((report) => {
              const statusInfo =
                STATUS_CONFIG[report.status] ?? STATUS_CONFIG.completed;
              const templateConfig =
                REPORT_TEMPLATES[
                  report.template as keyof typeof REPORT_TEMPLATES
                ];
              const projectName = (
                report.projects as unknown as { name: string } | null
              )?.name;

              return (
                <Link
                  key={report.id}
                  href={`/reports/${report.id}`}
                  className="group flex items-center gap-3 rounded-[5px] px-2.5 py-2.5 transition-colors duration-150 hover:bg-white/[0.025]"
                >
                  <IconWell accent="#7DD3FC" size={32}>
                    <FileText
                      className="h-[14px] w-[14px]"
                      style={{ color: "#7DD3FC" }}
                      strokeWidth={1.8}
                    />
                  </IconWell>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold leading-tight text-white/92">
                      {report.title}
                    </p>
                    <p className="mt-[4px] flex items-center gap-1.5 truncate text-[11.5px] text-white/50">
                      {projectName && <span>{projectName}</span>}
                      {projectName && templateConfig && (
                        <span className="text-white/30">·</span>
                      )}
                      {templateConfig && <span>{templateConfig.label}</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    <span className="flex items-center gap-1 text-[11.5px] text-white/55">
                      <Calendar
                        className="h-[11px] w-[11px]"
                        strokeWidth={1.5}
                      />
                      {new Date(report.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <StatusPill
                      tone={statusInfo.tone}
                      text={statusInfo.label}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        </SectionSurface>
      )}
    </div>
  );
}
