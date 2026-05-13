import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProjectRole } from "@/lib/auth/project-role";

/**
 * PATCH /api/projects/[projectId]/linked-entities/[entityId]
 * Body: { note: string | null }
 *
 * Updates the note on an existing project_entities link.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; entityId: string }> }
) {
  const { projectId, entityId } = await params;

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
  const note = body?.note === null ? null : typeof body?.note === "string" ? body.note.trim() || null : undefined;

  if (note === undefined) {
    return NextResponse.json({ error: "note is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("project_entities")
    .update({ note })
    .eq("project_id", projectId)
    .eq("entity_id", entityId)
    .select("id, entity_id, note, created_at")
    .single();

  if (error) {
    console.error("[linked-entities] update error:", error);
    return NextResponse.json({ error: "Failed to update link" }, { status: 500 });
  }

  return NextResponse.json({ link: data });
}

/**
 * DELETE /api/projects/[projectId]/linked-entities/[entityId]
 *
 * Removes a project_entities link (editor+ role required).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; entityId: string }> }
) {
  const { projectId, entityId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getUserProjectRole(projectId);
  if (!role || (role !== "owner" && role !== "editor")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("project_entities")
    .delete()
    .eq("project_id", projectId)
    .eq("entity_id", entityId);

  if (error) {
    console.error("[linked-entities] delete error:", error);
    return NextResponse.json({ error: "Failed to delete link" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
