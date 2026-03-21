import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProjectRole } from "@/lib/auth/project-role";
import type { EntityType } from "@/types/database";

const ENTITY_TYPES: EntityType[] = [
  "PERSON",
  "COMPANY",
  "GOVERNMENT",
  "ORGANIZATION",
  "LOCATION",
  "EVENT",
];

/**
 * GET /api/projects/[projectId]/entities/search?q=&type=&types=
 * Debounced entity lookup (project + global entities).
 * Optional `type` (e.g. PERSON) restricts to a single entity type.
 * Optional `types` (comma-separated, e.g. COMPANY,ORGANIZATION) restricts to several types.
 * If both are set, `types` wins.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const typeParam = request.nextUrl.searchParams.get("type")?.trim() ?? "";
  const typesParam = request.nextUrl.searchParams.get("types")?.trim() ?? "";

  const typesList = typesParam
    .split(",")
    .map((t) => t.trim())
    .filter((t): t is EntityType => ENTITY_TYPES.includes(t as EntityType));

  const typeFilter = ENTITY_TYPES.includes(typeParam as EntityType)
    ? (typeParam as EntityType)
    : null;

  const typeFilters: EntityType[] | null =
    typesList.length > 0 ? typesList : typeFilter !== null ? [typeFilter] : null;

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

  let projectQuery = admin
    .from("entities")
    .select("id, name, type")
    .eq("project_id", projectId)
    .is("canonical_entity_id", null)
    .ilike("name", pattern)
    .order("name")
    .limit(15);

  if (typeFilters !== null) {
    projectQuery = projectQuery.in("type", typeFilters);
  }

  const { data: projectScoped, error: e1 } = await projectQuery;

  if (e1) {
    console.error("entity search project:", e1);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }

  let globalQuery = admin
    .from("entities")
    .select("id, name, type")
    .is("project_id", null)
    .is("canonical_entity_id", null)
    .ilike("name", pattern)
    .order("name")
    .limit(15);

  if (typeFilters !== null) {
    globalQuery = globalQuery.in("type", typeFilters);
  }

  const { data: globalScoped, error: e2 } = await globalQuery;

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
