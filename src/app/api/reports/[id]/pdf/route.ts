import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { ReportPDF } from "@/lib/pdf/report-pdf";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: report } = await admin
    .from("reports")
    .select("*, projects(name, country)")
    .eq("id", id)
    .single();

  if (!report || report.status !== "completed" || !report.content) {
    return NextResponse.json({ error: "Report not found or not ready" }, { status: 404 });
  }

  // Verify user is a member of the project
  const { data: membership } = await admin
    .from("project_members")
    .select("role")
    .eq("project_id", report.project_id)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const project = report.projects as unknown as {
    name: string;
    country: string | null;
  } | null;

  // Fetch source interview titles
  const { data: sourceInterviews } = await admin
    .from("interviews")
    .select("title")
    .in("id", report.interview_ids);

  const pdfElement = createElement(ReportPDF, {
    title: report.title,
    projectName: project?.name ?? "Unknown",
    country: project?.country ?? undefined,
    template: report.template,
    content: report.content,
    createdAt: report.created_at,
    sourceInterviews: sourceInterviews?.map((i) => i.title) ?? [],
  });

  const buffer = await renderToBuffer(pdfElement);
  const uint8 = new Uint8Array(buffer);

  const safeTitle = report.title.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-");

  return new NextResponse(uint8, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeTitle}.pdf"`,
    },
  });
}
