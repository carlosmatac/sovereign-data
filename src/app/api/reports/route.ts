import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateReport } from "@/lib/ai/report-generation";
import { buildReportIntelligenceLayer } from "@/lib/reports/intelligence-layer";
import type { ReportTemplate } from "@/types/database";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    project_id,
    title,
    template,
    interview_ids,
    custom_focus,
  }: {
    project_id: string;
    title: string;
    template: ReportTemplate;
    interview_ids: string[];
    custom_focus?: string;
  } = body;

  if (!project_id || !title?.trim() || !template || !interview_ids?.length) {
    return NextResponse.json(
      { error: "Missing required fields: project_id, title, template, interview_ids" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Verify user is editor/owner of this project
  const { data: membership } = await admin
    .from("project_members")
    .select("role")
    .eq("project_id", project_id)
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role === "viewer") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  // Create the report row with 'generating' status
  const { data: report, error: createError } = await admin
    .from("reports")
    .insert({
      project_id,
      title: title.trim(),
      template,
      interview_ids,
      parameters: {
        ...(custom_focus ? { custom_focus } : {}),
        reporting_foundation_version: 2,
      },
      created_by: user.id,
      status: "generating",
    })
    .select()
    .single();

  if (createError || !report) {
    console.error("Create report error:", createError);
    return NextResponse.json(
      { error: createError?.message ?? "Failed to create report" },
      { status: 500 }
    );
  }

  let intelligenceLayer;
  try {
    intelligenceLayer = await buildReportIntelligenceLayer({
      projectId: project_id,
      interviewIds: interview_ids,
      template,
      customFocus: custom_focus,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to build report knowledge layer";
    await admin
      .from("reports")
      .update({ status: "failed", error_message: message })
      .eq("id", report.id);

    return NextResponse.json({ error: message }, { status: 400 });
  }

  const result = await generateReport({
    reportId: report.id,
    template,
    title: title.trim(),
    intelligenceLayer,
  });

  return result.toTextStreamResponse();
}
