import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProjectRole } from "@/lib/auth/project-role";

/**
 * GET /api/projects/[projectId]/entities/search?q=
 * Debounced entity lookup for transcript review (project + global entities).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (q.length < 2) {
    return NextResponse.json({ entities: [] as const });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = await getUserProjectRole(projectId);
  if (!role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const pattern = `%${q}%`;

  const { data: projectScoped, error: e1 } = await admin
    .from("entities")
    .select("id, name, type")
    .eq("project_id", projectId)
    .is("canonical_entity_id", null)
    .ilike("name", pattern)
    .order("name")
    .limit(15);

  if (e1) {
    console.error("entity search project:", e1);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }

  const { data: globalScoped, error: e2 } = await admin
    .from("entities")
    .select("id, name, type")
    .is("project_id", null)
    .is("canonical_entity_id", null)
    .ilike("name", pattern)
    .order("name")
    .limit(15);

  if (e2) {
    console.error("entity search global:", e2);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }

  const seen = new Set<string>();
  const merged: Array<{ id: string; name: string; type: string }> = [];
  for (const row of [...(projectScoped ?? []), ...(globalScoped ?? [])]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
    if (merged.length >= 20) break;
  }

  return NextResponse.json({ entities: merged });
}
