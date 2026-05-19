import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEntityType } from "@/types/database";

export interface EntitySearchResult {
  id: string;
  name: string;
  type: string;
  description: string | null;
}

/**
 * GET /api/entities/search?q=&type=
 *
 * Tenant-scoped entity search for the Network Explorer (no projectId needed).
 * Returns up to 10 canonical entities whose name matches the query.
 * Scoped to projects the current user is a member of.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const typeParam = request.nextUrl.searchParams.get("type")?.trim() ?? "";

  if (q.length < 2) {
    return NextResponse.json({ entities: [] as EntitySearchResult[] });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Resolve the projects this user is a member of
  const { data: memberships } = await admin
    .from("project_members")
    .select("project_id")
    .eq("user_id", user.id);

  const projectIds = (memberships ?? []).map((m) => m.project_id);

  if (projectIds.length === 0) {
    return NextResponse.json({ entities: [] as EntitySearchResult[] });
  }

  const pattern = `%${q}%`;

  let query = admin
    .from("entities")
    .select("id, name, type, description")
    .in("project_id", projectIds)
    .is("canonical_entity_id", null)
    .ilike("name", pattern)
    .order("name")
    .limit(10);

  if (typeParam && isEntityType(typeParam)) {
    query = query.eq("type", typeParam);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[entities/search]", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }

  const entities: EntitySearchResult[] = (data ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    description: e.description,
  }));

  return NextResponse.json({ entities });
}
