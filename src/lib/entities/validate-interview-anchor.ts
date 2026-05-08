import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isOrgLikeEntityType,
  type Database,
  type EntityType,
} from "@/types/database";
import { matchOrCreateEntity } from "@/lib/entities/match";

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
  } else if (!isOrgLikeEntityType(data.type)) {
    return { ok: false };
  }

  if (data.project_id != null && data.project_id !== params.projectId) {
    return { ok: false };
  }

  return { ok: true, name: data.name };
}

/**
 * Default entity types for free-text upload anchors that the user typed
 * without picking from autocomplete. PERSON is the only sensible default
 * for the person field; ORGANIZATION is the most generic org-like type
 * (the Add Source form does not let the uploader pick a sub-type, so any
 * promotion to COMPANY/GOVERNMENT/etc. happens later via governance).
 */
const ANCHOR_DEFAULT_TYPE: Record<"person" | "organization", EntityType> = {
  person: "PERSON",
  organization: "ORGANIZATION",
};

export type EnsureUploadAnchorResult =
  | { ok: true; entityId: string | null; name: string | null }
  | { ok: false; reason: "invalid_entity_id" };

/**
 * Resolve an upload-form anchor (Primary person / Organization) into an
 * entity ID + canonical name. Two paths:
 *
 *   1. The client picked an existing entity in the autocomplete and sent
 *      `entityId`. We validate it (canonical, correct type, project or
 *      global). On valid → use it. On invalid → return ok:false so the
 *      route can answer 400.
 *
 *   2. The client only typed free text (`name`). We treat the text as an
 *      explicit assertion by the uploader and call `matchOrCreateEntity`
 *      in `create_or_match` mode (deterministic — no `match_only`
 *      precision floor). This both **reuses** an existing entity when
 *      the normalized name matches, and **creates** a new project-scoped
 *      entity otherwise. The returned canonical name is the entity row
 *      `name` after the match, which may differ from the user's text
 *      (e.g. capitalization on an existing entity).
 *
 * If neither `entityId` nor `name` is provided, we return
 * `{ ok: true, entityId: null, name: null }`.
 *
 * Background (PR 2.3): the resolver runs LLM-extracted anchor mentions
 * in `match_only` mode to prevent stale/ambiguous re-creation. That
 * behaviour is correct for *inferred* anchors but used to silently drop
 * user-typed anchors too — this helper closes that regression by making
 * the explicit anchor channel deterministic at the route layer, before
 * the pipeline runs.
 */
export async function ensureUploadAnchorEntity(
  admin: SupabaseClient<Database>,
  params: {
    entityId: string | null;
    name: string | null;
    projectId: string;
    tenantId: string;
    role: "person" | "organization";
  }
): Promise<EnsureUploadAnchorResult> {
  const trimmedName = params.name?.trim() || null;

  if (params.entityId) {
    const v = await validateInterviewAnchorEntityId(admin, {
      entityId: params.entityId,
      projectId: params.projectId,
      role: params.role,
    });
    if (!v.ok) return { ok: false, reason: "invalid_entity_id" };
    return { ok: true, entityId: params.entityId, name: v.name };
  }

  if (!trimmedName) {
    return { ok: true, entityId: null, name: null };
  }

  const type = ANCHOR_DEFAULT_TYPE[params.role];

  const { entityId } = await matchOrCreateEntity({
    projectId: params.projectId,
    tenantId: params.tenantId,
    nameRaw: trimmedName,
    type,
    supabaseClient: admin,
    mode: "create_or_match",
  });

  // Re-read the canonical name from the resolved entity row so the
  // source row stores the authoritative form (e.g. "Francisco Pinzon"
  // even if the user typed "francisco pinzon").
  const { data, error } = await admin
    .from("entities")
    .select("name")
    .eq("id", entityId)
    .maybeSingle<{ name: string }>();

  if (error || !data) {
    // Fall back to the user-typed form — the entity exists, we just
    // couldn't read it back. The mismatch is cosmetic.
    return { ok: true, entityId, name: trimmedName };
  }

  return { ok: true, entityId, name: data.name };
}
