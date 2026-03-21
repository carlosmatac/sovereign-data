import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, EntityType } from "@/types/database";

const ORG_TYPES: EntityType[] = ["COMPANY", "ORGANIZATION", "GOVERNMENT"];

/**
 * Ensures an entity ID is safe to store on interviews as an upload anchor:
 * canonical row (not merged), correct type, and project-scoped to this project or global.
 */
export async function validateInterviewAnchorEntityId(
  admin: SupabaseClient<Database>,
  params: {
    entityId: string;
    projectId: string;
    role: "person" | "organization";
  }
): Promise<{ ok: true; name: string } | { ok: false }> {
  const { data, error } = await admin
    .from("entities")
    .select("id, name, type, project_id, canonical_entity_id")
    .eq("id", params.entityId)
    .maybeSingle();

  if (error || !data) return { ok: false };
  if (data.canonical_entity_id != null) return { ok: false };

  if (params.role === "person") {
    if (data.type !== "PERSON") return { ok: false };
  } else if (!ORG_TYPES.includes(data.type as EntityType)) {
    return { ok: false };
  }

  if (data.project_id != null && data.project_id !== params.projectId) {
    return { ok: false };
  }

  return { ok: true, name: data.name };
}
