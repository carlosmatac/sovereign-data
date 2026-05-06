/**
 * Database-backed intel summaries for Copilot.
 * Vector RAG often misses meta-questions ("what do we know about project X?")
 * because project titles rarely appear verbatim in transcript chunks.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const MAX_SUMMARY_LEN = 1_400;
const MAX_WORKSPACE_CHARS = 14_000;
const MAX_INTERVIEWS_IN_WORKSPACE_BRIEF = 24;

function clip(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/**
 * Project row + completed interview titles/summaries/topics for chat grounding.
 */
export async function buildProjectIntelBrief(
  admin: SupabaseClient<Database>,
  projectId: string
): Promise<string | null> {
  const { data: project, error: pErr } = await admin
    .from("projects")
    .select("name, description, country, region")
    .eq("id", projectId)
    .maybeSingle();

  if (pErr || !project) return null;

  const { data: interviews } = await admin
    .from("interviews")
    .select("id, title, summary, topics, status, last_intel_source")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  const completed = (interviews ?? []).filter((i) => i.status === "COMPLETED");

  const lines: string[] = [
    `PROJECT (database record): "${project.name}"`,
    `Project ID: ${projectId}`,
  ];
  if (project.description) lines.push(`Description: ${project.description}`);
  if (project.country) lines.push(`Country: ${project.country}`);
  if (project.region) lines.push(`Region: ${project.region}`);
  lines.push("");
  lines.push(
    `COMPLETED INTERVIEWS IN THIS PROJECT (${completed.length}):`,
    'Use these summaries when the user asks what we know about "this project" or the project by name.',
    "Verify fine-grained claims against RETRIEVED CONTEXT (transcript excerpts) and tools when possible.",
    ""
  );

  for (const inv of completed) {
    lines.push(`— "${inv.title}" (interview_id: ${inv.id})`);
    if (inv.last_intel_source === "human_review") {
      lines.push("  (Knowledge from human-reviewed transcript pass)");
    }
    if (inv.summary) {
      lines.push(`  Executive summary: ${clip(inv.summary, MAX_SUMMARY_LEN)}`);
    } else {
      lines.push("  Executive summary: (not available)");
    }
    if (inv.topics?.length) {
      lines.push(`  Topics: ${inv.topics.join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

/**
 * All projects the user can access, with completed interview summaries (capped).
 * Used when chat has no ?project= so "Nigeria 2026" style questions still get DB context.
 */
export async function buildWorkspaceIntelBriefForUser(
  admin: SupabaseClient<Database>,
  userId: string
): Promise<string | null> {
  const { data: members, error: mErr } = await admin
    .from("project_members")
    .select("project_id")
    .eq("user_id", userId);

  if (mErr || !members?.length) return null;

  const projectIds = [...new Set(members.map((m) => m.project_id))];

  const { data: projects } = await admin
    .from("projects")
    .select("id, name, description, country")
    .in("id", projectIds);

  if (!projects?.length) return null;

  const { data: interviews } = await admin
    .from("interviews")
    .select("id, project_id, title, summary, topics, status, last_intel_source")
    .in("project_id", projectIds)
    .eq("status", "COMPLETED")
    .order("created_at", { ascending: false });

  const byProject = new Map<string, typeof interviews>();
  for (const inv of interviews ?? []) {
    const list = byProject.get(inv.project_id) ?? [];
    list.push(inv);
    byProject.set(inv.project_id, list);
  }

  const lines: string[] = [
    "WORKSPACE PROJECTS (database — you are not scoped to a single project URL):",
    "When the user names a project (e.g. Nigeria 2026), match it to a PROJECT name below and use that project's interviews.",
    "Summaries are authoritative high-level knowledge; pair with transcript RAG + tools for quotes and relationships.",
    "",
  ];

  let approxChars = lines.join("\n").length;
  let interviewCount = 0;

  const sorted = [...projects].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );

  for (const p of sorted) {
    if (approxChars >= MAX_WORKSPACE_CHARS || interviewCount >= MAX_INTERVIEWS_IN_WORKSPACE_BRIEF) {
      lines.push("… (further projects/interviews omitted to stay within size limits)");
      break;
    }

    const invs = byProject.get(p.id) ?? [];
    const block = [
      `▸ PROJECT: "${p.name}" (id ${p.id})`,
      p.country ? `  Country: ${p.country}` : null,
      p.description ? `  ${clip(p.description, 400)}` : null,
      `  Completed interviews: ${invs.length}`,
    ]
      .filter(Boolean)
      .join("\n");

    approxChars += block.length + 2;
    lines.push(block);

    for (const inv of invs) {
      if (interviewCount >= MAX_INTERVIEWS_IN_WORKSPACE_BRIEF || approxChars >= MAX_WORKSPACE_CHARS) break;
      const piece = `    • "${inv.title}" — ${inv.summary ? clip(inv.summary, 900) : "(no summary yet)"}`;
      approxChars += piece.length + 1;
      lines.push(piece);
      interviewCount++;
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}
