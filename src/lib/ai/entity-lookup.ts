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

export interface MentionRecord {
  interview_id: string;
  interview_title: string;
  sentiment: string | null;
  chunk_content: string | null;
  interview_time_ms: number | null;
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
  const { data: outgoing } = await admin
    .from("entity_relationships")
    .select("relation_type, confidence, evidence_text, interview_id, target_entity_id, entities!entity_relationships_target_entity_id_fkey(name, type)")
    .eq("source_entity_id", entityId)
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

  // Incoming (entity is target)
  const { data: incoming } = await admin
    .from("entity_relationships")
    .select("relation_type, confidence, evidence_text, interview_id, source_entity_id, entities!entity_relationships_source_entity_id_fkey(name, type)")
    .eq("target_entity_id", entityId)
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
 * Get all mentions of an entity across interviews, with chunk content for context.
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
  const { data: mentions } = await admin
    .from("entity_mentions")
    .select(
      "interview_id, sentiment, chunk_id, interviews!entity_mentions_interview_id_fkey(title, project_id, conducted_at, created_at)"
    )
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(60);
  if (!mentions || mentions.length === 0) return [];

  const results: MentionRecord[] = [];
  const chunkIds = mentions
    .filter((m) => m.chunk_id)
    .map((m) => m.chunk_id as string);

  // Batch-fetch chunk content for context
  const chunkMap = new Map<string, string>();
  if (chunkIds.length > 0) {
    const { data: chunks } = await admin
      .from("interview_chunks")
      .select("id, content")
      .in("id", chunkIds);
    for (const c of chunks ?? []) {
      chunkMap.set(c.id, c.content);
    }
  }

  const targetMs =
    options?.targetDateIso &&
    options.prioritizeTemporalProximity &&
    /^\d{4}-\d{2}-\d{2}$/.test(options.targetDateIso)
      ? Date.parse(`${options.targetDateIso}T12:00:00.000Z`)
      : null;

  for (const m of mentions) {
    const interview = unwrapInterviewWithDates(m.interviews);
    if (projectId && interview?.project_id && interview.project_id !== projectId) {
      continue;
    }
    const timeRaw = interview?.conducted_at ?? interview?.created_at ?? null;
    const interviewTimeMs = timeRaw ? Date.parse(timeRaw) : null;
    results.push({
      interview_id: m.interview_id,
      interview_title: interview?.title ?? "Unknown Interview",
      sentiment: m.sentiment,
      chunk_content: m.chunk_id ? (chunkMap.get(m.chunk_id) ?? null) : null,
      interview_time_ms: interviewTimeMs !== null && !Number.isNaN(interviewTimeMs)
        ? interviewTimeMs
        : null,
    });
  }

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

function unwrapInterviewWithDates(
  value: unknown
): {
  title: string;
  project_id?: string | null;
  conducted_at?: string | null;
  created_at?: string | null;
} | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value as {
    title: string;
    project_id?: string | null;
    conducted_at?: string | null;
    created_at?: string | null;
  };
}
