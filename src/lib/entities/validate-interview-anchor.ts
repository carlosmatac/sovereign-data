import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isOrgLikeEntityType,
  ACTIVE_RELATION_TYPE_VALUES,
  type Database,
  type EntityType,
  type RelationType,
  type SourceEntityLinkType,
} from "@/types/database";

// ── Relationship type validation ─────────────────────────────────────────────

const ACTIVE_RELATION_TYPE_SET: ReadonlySet<string> = new Set(
  ACTIVE_RELATION_TYPE_VALUES
);

/**
 * Parse and validate an array of relationship type strings from untrusted
 * input (form payload, JSON body). Strips any values not in the active
 * taxonomy and deduplicates. Returns an empty array for invalid input.
 */
export function parseRelationshipTypes(raw: unknown): RelationType[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: RelationType[] = [];
  for (const v of raw) {
    if (typeof v === "string" && ACTIVE_RELATION_TYPE_SET.has(v) && !seen.has(v)) {
      seen.add(v);
      out.push(v as RelationType);
    }
  }
  return out;
}
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

// ── Participant anchor helpers ────────────────────────────────────────────────

/**
 * Allowed `link_type` values that a user can assign to additional participants
 * in the upload form. Other link types are pipeline-generated.
 */
export const PARTICIPANT_LINK_TYPES = new Set<SourceEntityLinkType>([
  "participant",
  "interviewer",
  "author",
  "primary_subject",
]);

/**
 * Entity types available in the participant form row.
 * Covers the most common person and org-like types; other types are
 * pipeline-assigned and not expected from manual form input.
 */
export const PARTICIPANT_ENTITY_TYPES = new Set<EntityType>([
  "PERSON",
  "COMPANY",
  "ORGANIZATION",
  "GOVERNMENT",
  "PUBLIC_INSTITUTION",
]);

/**
 * Resolve one participant row (from the upload form's "Additional known
 * entities" section) into a deterministic entity ID.
 *
 * Works identically to `ensureUploadAnchorEntity` but accepts any EntityType
 * rather than the limited "person" | "organization" role.
 */
export async function ensureParticipantAnchorEntity(
  admin: SupabaseClient<Database>,
  params: {
    entityId: string | null;
    name: string | null;
    entityType: EntityType;
    projectId: string;
    tenantId: string;
  }
): Promise<EnsureUploadAnchorResult> {
  const trimmedName = params.name?.trim() || null;

  if (params.entityId) {
    const { data, error } = await admin
      .from("entities")
      .select("id, name, type, project_id, canonical_entity_id")
      .eq("id", params.entityId)
      .maybeSingle();

    if (error || !data) return { ok: false, reason: "invalid_entity_id" };
    if (data.canonical_entity_id != null) return { ok: false, reason: "invalid_entity_id" };
    if (data.project_id != null && data.project_id !== params.projectId) {
      return { ok: false, reason: "invalid_entity_id" };
    }
    return { ok: true, entityId: params.entityId, name: data.name };
  }

  if (!trimmedName) {
    return { ok: true, entityId: null, name: null };
  }

  const { entityId } = await matchOrCreateEntity({
    projectId: params.projectId,
    tenantId: params.tenantId,
    nameRaw: trimmedName,
    type: params.entityType,
    supabaseClient: admin,
    mode: "create_or_match",
  });

  const { data } = await admin
    .from("entities")
    .select("name")
    .eq("id", entityId)
    .maybeSingle<{ name: string }>();

  return { ok: true, entityId, name: data?.name ?? trimmedName };
}

// ── Shared participant resolution (used by all upload API routes) ─────────────

/** Raw participant row as received from the upload form. */
export type RawParticipant = {
  name?: string | null;
  entity_id?: string | null;
  entity_type?: string | null;
  link_type?: string | null;
  title?: string | null;
  // Optional anchor-derived relationship fields (person → affiliated org)
  relationship_types?: unknown;          // validated via parseRelationshipTypes
  affiliated_org_name?: string | null;
  affiliated_org_entity_id?: string | null;
};

/** Resolved participant row ready for `writeParticipantSourceEntities`. */
export type ResolvedParticipant = {
  entityId: string;
  linkType: SourceEntityLinkType;
  context: string | null;
  // Anchor-derived relationship data (only present for PERSON rows with an
  // affiliated org; used by writeAnchorDerivedRelationships)
  relationshipTypes: RelationType[];
  affiliatedOrgEntityId: string | null;
};

/**
 * Parse, validate, and resolve an array of raw participant rows from the
 * upload form into `ResolvedParticipant[]`.
 *
 * - Skips rows that have neither a name nor an entity_id (empty rows).
 * - Skips rows with an invalid / disallowed link_type or entity_type.
 * - Logs and skips rows where entity resolution fails.
 *
 * Called from all three upload API routes after source creation.
 */
export async function parseAndResolveParticipants(
  admin: SupabaseClient<Database>,
  rawParticipants: unknown,
  projectId: string,
  tenantId: string
): Promise<ResolvedParticipant[]> {
  if (!Array.isArray(rawParticipants) || rawParticipants.length === 0) {
    return [];
  }

  const resolved: ResolvedParticipant[] = [];

  for (const raw of rawParticipants as RawParticipant[]) {
    const name = raw.name?.trim() || null;
    const entityId = raw.entity_id?.trim() || null;
    if (!name && !entityId) continue; // empty row

    const linkType = raw.link_type as SourceEntityLinkType | undefined;
    if (!linkType || !PARTICIPANT_LINK_TYPES.has(linkType)) continue;

    const entityType = raw.entity_type as EntityType | undefined;
    if (!entityType || !PARTICIPANT_ENTITY_TYPES.has(entityType)) continue;

    const result = await ensureParticipantAnchorEntity(admin, {
      entityId,
      name,
      entityType,
      projectId,
      tenantId,
    });

    if (!result.ok || !result.entityId) {
      console.warn("[participants] entity resolution failed, skipping:", { name, entityId });
      continue;
    }

    // Resolve affiliated org (only meaningful for PERSON rows)
    let affiliatedOrgEntityId: string | null = null;
    const relationshipTypes = parseRelationshipTypes(raw.relationship_types);
    if (entityType === "PERSON" && relationshipTypes.length > 0) {
      const rawOrgId = raw.affiliated_org_entity_id?.trim() || null;
      const rawOrgName = raw.affiliated_org_name?.trim() || null;
      if (rawOrgId || rawOrgName) {
        const orgResult = await ensureUploadAnchorEntity(admin, {
          entityId: rawOrgId && /^[0-9a-f-]{36}$/i.test(rawOrgId) ? rawOrgId : null,
          name: rawOrgName,
          projectId,
          tenantId,
          role: "organization",
        });
        if (orgResult.ok) {
          affiliatedOrgEntityId = orgResult.entityId ?? null;
        }
      }
    }

    resolved.push({
      entityId: result.entityId,
      linkType,
      context: raw.title?.trim() || null,
      relationshipTypes: affiliatedOrgEntityId ? relationshipTypes : [],
      affiliatedOrgEntityId,
    });
  }

  return resolved;
}
