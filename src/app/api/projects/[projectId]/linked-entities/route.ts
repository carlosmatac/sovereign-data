import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProjectRole } from "@/lib/auth/project-role";

/**
 * GET /api/projects/[projectId]/linked-entities
 *
 * Returns all project_entities rows for this project, with entity details joined.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getUserProjectRole(projectId);
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("project_entities")
    .select(
      "id, entity_id, note, created_at, created_by, entities(id, name, type, description)"
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[linked-entities] fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }

  return NextResponse.json({ links: data ?? [] });
}

/**
 * POST /api/projects/[projectId]/linked-entities
 * Body: { entity_id: string; note?: string }
 *
 * Creates a new project_entities row. Idempotent — if the link already exists
 * it returns the existing row (409 with the existing row).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getUserProjectRole(projectId);
  if (!role || (role !== "owner" && role !== "editor")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const entityId = typeof body?.entity_id === "string" ? body.entity_id.trim() : null;
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;

  if (!entityId) {
    return NextResponse.json({ error: "entity_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch tenant_id from the project (needed for the compound FK constraint).
  const { data: project } = await admin
    .from("projects")
    .select("tenant_id")
    .eq("id", projectId)
    .single();

  if (!project?.tenant_id) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Verify the entity exists.
  const { data: entity } = await admin
    .from("entities")
    .select("id")
    .eq("id", entityId)
    .single();

  if (!entity) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  const { data, error } = await admin
    .from("project_entities")
    .insert({
      project_id: projectId,
      entity_id: entityId,
      tenant_id: project.tenant_id,
      note,
      created_by: user.id,
    })
    .select("id, entity_id, note, created_at, created_by")
    .single();

  if (error) {
    // Unique constraint — link already exists.
    if (error.code === "23505") {
      const { data: existing } = await admin
        .from("project_entities")
        .select("id, entity_id, note, created_at")
        .eq("project_id", projectId)
        .eq("entity_id", entityId)
        .single();
      return NextResponse.json({ link: existing, existing: true }, { status: 200 });
    }
    console.error("[linked-entities] insert error:", error);
    return NextResponse.json({ error: "Failed to create link" }, { status: 500 });
  }

  return NextResponse.json({ link: data }, { status: 201 });
}
