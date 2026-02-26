import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateReport } from "@/lib/ai/report-generation";
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
      parameters: custom_focus ? { custom_focus } : {},
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

  // Fetch interview data for the report
  const { data: interviews } = await admin
    .from("interviews")
    .select("id, title, summary, topics, sentiment, projects(country)")
    .in("id", interview_ids)
    .eq("status", "COMPLETED");

  if (!interviews || interviews.length === 0) {
    await admin
      .from("reports")
      .update({ status: "failed", error_message: "No completed interviews found" })
      .eq("id", report.id);
    return NextResponse.json(
      { error: "No completed interviews found for the selected IDs" },
      { status: 400 }
    );
  }

  // Fetch entities mentioned in these interviews
  const { data: mentions } = await admin
    .from("entity_mentions")
    .select("entity_id, entities(name, type)")
    .in("interview_id", interview_ids);

  const entityCounts: Record<string, { name: string; type: string; count: number }> = {};
  for (const m of mentions ?? []) {
    const entity = m.entities as unknown as { name: string; type: string } | null;
    if (entity) {
      const key = `${entity.name}::${entity.type}`;
      if (!entityCounts[key]) {
        entityCounts[key] = { name: entity.name, type: entity.type, count: 0 };
      }
      entityCounts[key].count++;
    }
  }
  const entities = Object.values(entityCounts)
    .sort((a, b) => b.count - a.count)
    .map((e) => ({ name: e.name, type: e.type, mentionCount: e.count }));

  // Fetch relationships from these interviews
  const { data: rels } = await admin
    .from("entity_relationships")
    .select("source_entity_id, target_entity_id, relation_type, evidence_text, entities!entity_relationships_source_entity_id_fkey(name)")
    .in("interview_id", interview_ids);

  // Build entity ID→name map from mentions
  const entityNameMap: Record<string, string> = {};
  for (const m of mentions ?? []) {
    const entity = m.entities as unknown as { name: string } | null;
    if (entity) entityNameMap[m.entity_id] = entity.name;
  }

  const relationships = (rels ?? []).map((r) => {
    const sourceEntity = r.entities as unknown as { name: string } | null;
    return {
      source: sourceEntity?.name ?? entityNameMap[r.source_entity_id] ?? "Unknown",
      target: entityNameMap[r.target_entity_id] ?? "Unknown",
      relation_type: r.relation_type,
      evidence_text: r.evidence_text,
    };
  });

  // Start generation (streams in background, saves on finish)
  const interviewsForReport = interviews.map((i) => {
    const project = i.projects as unknown as { country: string | null } | null;
    return {
      id: i.id,
      title: i.title,
      summary: i.summary,
      topics: i.topics,
      country: project?.country ?? null,
      sentiment: i.sentiment as { overall?: string; score?: number } | null,
    };
  });

  const result = await generateReport({
    reportId: report.id,
    template,
    title: title.trim(),
    customFocus: custom_focus,
    interviews: interviewsForReport,
    entities,
    relationships,
  });

  return result.toTextStreamResponse();
}
