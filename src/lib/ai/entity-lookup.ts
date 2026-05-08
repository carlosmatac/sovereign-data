import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEntityName } from "@/lib/entities/normalize";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface EntityMatch {
  id: string;
  name: string;
  type: string;
  description: string | null;
  project_id: string | null;
}

export interface RelationshipEdge {
  relation_type: string;
  confidence: number;
  evidence_text: string | null;
  interview_id: string;
  direction: "outgoing" | "incoming";
  other_entity_name: string;
  other_entity_type: string;
}

/**
 * Mention/association role surfaced by the entity_intel RPC.
 *
 * Roles from branch 1 (entity_mentions):
 * - `mention`: chunk-level textual mention with content (today's behaviour)
 *
 * Roles from branch 2 (source_entities — Phase 2.4):
 * - `interviewee`: entity is the upload-anchor interviewee of this source
 * - `interviewee_org`: entity is the upload-anchor org of the interviewee
 * - `author`: entity is the author/creator of this source (LLM-extracted)
 * - `primary_subject`: entity is the primary subject of this source
 * - `subject_organization`: entity is the primary org subject of this source
 * - `interviewer`, `translator`, `participant`: structured participant roles
 * - `account`, `source_owner`: CRM/ownership roles (future use)
 * - `mentioned_at_source_level`, `related_entity`: broad association roles
 *
 * Roles from branch 3 (entity_relationships):
 * - `related_via_relationship`: active (non-rejected) relationship edge
 *
 * See migration 00030_entity_intel_rpc_v2.sql and
 * docs/features/on-going/entity-intel-rpc-source-entities.md.
 */
export type MentionRole =
  | "mention"
  | "interviewee"
  | "interviewee_org"
  | "interviewer"
  | "translator"
  | "participant"
  | "author"
  | "primary_subject"
  | "subject_organization"
  | "account"
  | "source_owner"
  | "mentioned_at_source_level"
  | "related_entity"
  | "related_via_relationship";

/**
 * Kind groups how the association row was sourced:
 * - `mention`:       chunk-level entity_mentions row (branch 1)
 * - `anchor`:        deterministic source_entities row (upload_anchor /
 *                    metadata_import / manual_tag / human_review origin)
 * - `source_entity`: inferred source_entities row (extraction / ai_inference /
 *                    alias_propagation / prior_context origin)
 * - `relationship`:  entity_relationships edge (branch 3)
 */
export type MentionKind = "mention" | "anchor" | "source_entity" | "relationship";

export interface MentionRecord {
  interview_id: string;
  interview_title: string;
  sentiment: string | null;
  chunk_content: string | null;
  interview_time_ms: number | null;
  role: MentionRole;
  kind: MentionKind;
}

/**
 * Precedence used when an entity has multiple rows for the same source
 * (e.g. interviewee anchor + textual mention + relationship). Lower index =
 * higher precedence in the deduped output.
 *
 * Ordering logic:
 *   1. Explicit interviewee anchors (most informative — the entity IS the subject)
 *   2. Primary-subject-level source_entities (entity is the focus of the source)
 *   3. Authorship (entity created/wrote the source)
 *   4. Chunk-level textual mention (entity was mentioned in context)
 *   5. Relationship edge (entity appeared with someone else in this source)
 *   6. Other structured roles (participant, translator, …)
 */
const MENTION_ROLE_PRECEDENCE: MentionRole[] = [
  "interviewee",
  "interviewee_org",
  "primary_subject",
  "subject_organization",
  "author",
  "mention",
  "related_via_relationship",
  "participant",
  "interviewer",
  "translator",
  "account",
  "source_owner",
  "mentioned_at_source_level",
  "related_entity",
];

function rolePrecedence(role: MentionRole): number {
  const idx = MENTION_ROLE_PRECEDENCE.indexOf(role);
  return idx === -1 ? MENTION_ROLE_PRECEDENCE.length : idx;
}

/**
 * Find the best-matching entity by name, using normalized + trigram similarity.
 * Checks project scope first, falls back to global.
 */
export async function findEntity(
  admin: AdminClient,
  name: string,
  projectId?: string | null
): Promise<EntityMatch | null> {
  const normalized = normalizeEntityName(name);
  if (!normalized) return null;

  // Exact match on normalized_name (project-scoped first, then global)
  if (projectId) {
    const { data } = await admin
      .from("entities")
      .select("id, name, type, description, project_id")
      .eq("normalized_name", normalized)
      .eq("project_id", projectId)
      .is("canonical_entity_id", null)
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  // Global exact match
  const { data: globalExact } = await admin
    .from("entities")
    .select("id, name, type, description, project_id")
    .eq("normalized_name", normalized)
    .is("canonical_entity_id", null)
    .limit(1)
    .maybeSingle();
  if (globalExact) return globalExact;

  // Alias exact match (project-scoped first)
  if (projectId) {
    const { data: aliasMatch } = await admin
      .from("entity_aliases")
      .select("entity_id, entities!entity_aliases_entity_id_fkey(id, name, type, description, project_id)")
      .eq("alias_normalized", normalized)
      .eq("project_id", projectId)
      .limit(1)
      .maybeSingle();
    const entity = unwrapEntity(aliasMatch?.entities);
    if (entity) return entity;
  }

  // Global alias exact match
  const { data: globalAlias } = await admin
    .from("entity_aliases")
    .select("entity_id, entities!entity_aliases_entity_id_fkey(id, name, type, description, project_id)")
    .eq("alias_normalized", normalized)
    .limit(1)
    .maybeSingle();
  const globalEntity = unwrapEntity(globalAlias?.entities);
  if (globalEntity) return globalEntity;

  // Fuzzy: fetch up to 100 entities from same project and score client-side via trigram
  const candidates = await fuzzySearch(admin, normalized, projectId);
  if (candidates) return candidates;

  return null;
}

/**
 * Get all relationship edges where entity is source or target.
 */
export async function getRelationships(
  admin: AdminClient,
  entityId: string,
  projectId?: string | null,
  options?: { sortByInterviewRecency?: boolean }
): Promise<RelationshipEdge[]> {
  const edges: RelationshipEdge[] = [];

  // Outgoing (entity is source)
  // Editorial rule: editorially `rejected` relationships are kept in the
  // DB for the interview-detail review UI and reprocess suppression, but
  // must NOT surface in the chat agent's relationship lookups (active
  // operational view). See docs/features/on-going/editable-relationship-governance.md
  const { data: outgoing } = await admin
    .from("entity_relationships")
    .select("relation_type, confidence, evidence_text, interview_id, target_entity_id, entities!entity_relationships_target_entity_id_fkey(name, type)")
    .eq("source_entity_id", entityId)
    .neq("review_status", "rejected")
    .order("confidence", { ascending: false })
    .limit(30);
  for (const row of outgoing ?? []) {
    const target = unwrapBasicEntity(row.entities);
    edges.push({
      relation_type: row.relation_type,
      confidence: row.confidence,
      evidence_text: row.evidence_text,
      interview_id: row.interview_id,
      direction: "outgoing",
      other_entity_name: target?.name ?? "Unknown",
      other_entity_type: target?.type ?? "Unknown",
    });
  }

  // Incoming (entity is target) — same editorial filter as outgoing.
  const { data: incoming } = await admin
    .from("entity_relationships")
    .select("relation_type, confidence, evidence_text, interview_id, source_entity_id, entities!entity_relationships_source_entity_id_fkey(name, type)")
    .eq("target_entity_id", entityId)
    .neq("review_status", "rejected")
    .order("confidence", { ascending: false })
    .limit(30);

  for (const row of incoming ?? []) {
    const source = unwrapBasicEntity(row.entities);
    edges.push({
      relation_type: row.relation_type,
      confidence: row.confidence,
      evidence_text: row.evidence_text,
      interview_id: row.interview_id,
      direction: "incoming",
      other_entity_name: source?.name ?? "Unknown",
      other_entity_type: source?.type ?? "Unknown",
    });
  }

  // Optional: filter by project if projectId provided
  let filtered = edges;
  if (projectId && edges.length > 0) {
    const interviewIds = [...new Set(edges.map((e) => e.interview_id))];
    const { data: interviews } = await admin
      .from("interviews")
      .select("id")
      .in("id", interviewIds)
      .eq("project_id", projectId);
    const validIds = new Set((interviews ?? []).map((i) => i.id));
    filtered = edges.filter((e) => validIds.has(e.interview_id));
  }

  if (options?.sortByInterviewRecency && filtered.length > 0) {
    const interviewIds = [...new Set(filtered.map((e) => e.interview_id))];
    const { data: meta } = await admin
      .from("interviews")
      .select("id, conducted_at, created_at")
      .in("id", interviewIds);
    const timeByInterview = new Map<string, number>();
    for (const row of meta ?? []) {
      const raw = row.conducted_at ?? row.created_at;
      const ms = raw ? Date.parse(raw) : 0;
      timeByInterview.set(row.id, Number.isNaN(ms) ? 0 : ms);
    }
    filtered = [...filtered].sort(
      (a, b) =>
        (timeByInterview.get(b.interview_id) ?? 0) -
        (timeByInterview.get(a.interview_id) ?? 0)
    );
  }

  return filtered;
}

/**
 * Get all interviews where an entity is associated as a textual mention,
 * upload-anchor interviewee/interviewee_org, or via a non-rejected
 * relationship. Backed by the `entity_intel` SECURITY DEFINER RPC
 * (migration 00026).
 *
 * Closes the audit §13 retrieval gap: an entity that is the interviewee
 * of an interview but has no surviving chunk-level mention is no longer
 * invisible to the chat tool.
 *
 * Dedup: when the same interview has multiple rows (e.g. interviewee
 * anchor + textual mention), only the highest-precedence row survives
 * (see {@link MENTION_ROLE_PRECEDENCE}).
 */
export async function getMentions(
  admin: AdminClient,
  entityId: string,
  projectId?: string | null,
  options?: {
    targetDateIso?: string | null;
    prioritizeTemporalProximity?: boolean;
  }
): Promise<MentionRecord[]> {
  const { data, error } = await admin.rpc("entity_intel", {
    p_entity_id: entityId,
    p_project_id: projectId ?? null,
  });
  if (error) {
    console.error("[entity-lookup] entity_intel RPC failed", error);
    return [];
  }
  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Map raw RPC rows → MentionRecord[]; dedup by source_id keeping the
  // highest-precedence role (interviewee > interviewee_org > mention >
  // related_via_relationship).
  const byInterview = new Map<string, MentionRecord>();
  for (const row of rows) {
    const role = row.role as MentionRole;
    const kind = row.kind as MentionKind;
    const timeRaw = row.conducted_at ?? row.created_at ?? null;
    const interviewTimeMs = timeRaw ? Date.parse(timeRaw) : null;
    const candidate: MentionRecord = {
      interview_id: row.source_id,
      interview_title: row.source_title ?? "Unknown Interview",
      sentiment: row.sentiment,
      chunk_content: row.evidence,
      interview_time_ms:
        interviewTimeMs !== null && !Number.isNaN(interviewTimeMs)
          ? interviewTimeMs
          : null,
      role,
      kind,
    };
    const existing = byInterview.get(row.source_id);
    if (!existing || rolePrecedence(role) < rolePrecedence(existing.role)) {
      byInterview.set(row.source_id, candidate);
    }
  }
  const results = Array.from(byInterview.values());

  const targetMs =
    options?.targetDateIso &&
    options.prioritizeTemporalProximity &&
    /^\d{4}-\d{2}-\d{2}$/.test(options.targetDateIso)
      ? Date.parse(`${options.targetDateIso}T12:00:00.000Z`)
      : null;

  if (targetMs !== null && !Number.isNaN(targetMs)) {
    results.sort((a, b) => {
      const da =
        a.interview_time_ms !== null
          ? Math.abs(a.interview_time_ms - targetMs)
          : Number.POSITIVE_INFINITY;
      const db =
        b.interview_time_ms !== null
          ? Math.abs(b.interview_time_ms - targetMs)
          : Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return (b.interview_time_ms ?? 0) - (a.interview_time_ms ?? 0);
    });
  } else {
    results.sort(
      (a, b) => (b.interview_time_ms ?? 0) - (a.interview_time_ms ?? 0)
    );
  }

  return results.slice(0, 30);
}

// ── Helpers ──────────────────────────────────────────────────────

async function fuzzySearch(
  admin: AdminClient,
  normalized: string,
  projectId?: string | null
): Promise<EntityMatch | null> {
  let query = admin
    .from("entities")
    .select("id, name, type, description, project_id, normalized_name")
    .is("canonical_entity_id", null)
    .limit(100);

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data: rows } = await query;
  if (!rows || rows.length === 0) return null;

  let best: { entity: EntityMatch; score: number } | null = null;
  for (const row of rows) {
    const score = diceCoeff(normalized, row.normalized_name);
    if (score >= 0.6 && (!best || score > best.score)) {
      best = {
        entity: { id: row.id, name: row.name, type: row.type, description: row.description, project_id: row.project_id },
        score,
      };
    }
  }
  return best?.entity ?? null;
}

function diceCoeff(a: string, b: string): number {
  const left = buildBigrams(a);
  const right = buildBigrams(b);
  if (left.size === 0 || right.size === 0) return 0;
  let inter = 0;
  for (const g of left) if (right.has(g)) inter++;
  return (2 * inter) / (left.size + right.size);
}

function buildBigrams(s: string): Set<string> {
  const padded = ` ${s} `;
  const set = new Set<string>();
  for (let i = 0; i < padded.length - 1; i++) set.add(padded.slice(i, i + 2));
  return set;
}

type BasicEntity = { name: string; type: string };

function unwrapEntity(value: unknown): EntityMatch | null {
  if (!value) return null;
  if (Array.isArray(value)) return (value[0] as EntityMatch) ?? null;
  return value as EntityMatch;
}

function unwrapBasicEntity(value: unknown): BasicEntity | null {
  if (!value) return null;
  if (Array.isArray(value)) return (value[0] as BasicEntity) ?? null;
  return value as BasicEntity;
}

