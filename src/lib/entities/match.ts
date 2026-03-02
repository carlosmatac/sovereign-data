import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, EntityType } from "@/types/database";
import { normalizeEntityName } from "@/lib/entities/normalize";

type MatchOrCreateEntityParams = {
  projectId: string;
  nameRaw: string;
  type: EntityType;
  supabaseClient: SupabaseClient<Database>;
};

type MatchOrCreateEntityResult = {
  entityId: string;
  needsReview: boolean;
};

type EntityRow = Database["public"]["Tables"]["entities"]["Row"];
type EntityInsert = Database["public"]["Tables"]["entities"]["Insert"];
type EntityAliasInsert = Database["public"]["Tables"]["entity_aliases"]["Insert"];

type EntityRowLoose = Pick<
  EntityRow,
  "id" | "canonical_entity_id" | "project_id" | "type" | "normalized_name"
>;

type AliasMatchRowLoose = {
  entity_id: string;
  entities: EntityRowLoose | EntityRowLoose[] | null;
};

type FuzzyEntityRowLoose = EntityRowLoose & {
  similarity?: number | null;
};

type FuzzyAliasRowLoose = {
  entity_id: string;
  alias_normalized: string;
  similarity?: number | null;
  entities: EntityRowLoose | EntityRowLoose[] | null;
};

type Candidate = {
  entityId: string;
  similarity: number;
};

const AUTO_MERGE_THRESHOLD = 0.9;
const REVIEW_THRESHOLD = 0.8;
const EPSILON = 1e-9;

/**
 * Matches an extracted entity name to an existing canonical entity (project-first, then global),
 * or creates a new project-scoped canonical entity when no safe match exists.
 */
export async function matchOrCreateEntity(
  params: MatchOrCreateEntityParams
): Promise<MatchOrCreateEntityResult> {
  const { projectId, nameRaw, type, supabaseClient } = params;

  const normalized = normalizeEntityName(nameRaw);
  if (!normalized) {
    throw new Error("matchOrCreateEntity: normalized name is empty.");
  }

  // 1) Project-scoped exact entity match (canonical only)
  const projectExactEntity = await findExactEntity({
    supabaseClient,
    normalized,
    type,
    projectId,
  });
  if (projectExactEntity) {
    const canonicalId = await resolveCanonicalEntityId(supabaseClient, projectExactEntity.id);
    await ensureAlias({
      supabaseClient,
      entityId: canonicalId,
      projectId,
      aliasRaw: nameRaw,
      aliasNormalized: normalized,
    });
    return { entityId: canonicalId, needsReview: false };
  }

  // 2) Project-scoped exact alias match
  const projectExactAliasEntityId = await findExactAliasEntityId({
    supabaseClient,
    normalized,
    type,
    projectId,
  });
  if (projectExactAliasEntityId) {
    const canonicalId = await resolveCanonicalEntityId(supabaseClient, projectExactAliasEntityId);
    await ensureAlias({
      supabaseClient,
      entityId: canonicalId,
      projectId,
      aliasRaw: nameRaw,
      aliasNormalized: normalized,
    });
    return { entityId: canonicalId, needsReview: false };
  }

  // 3) Global exact entity match (canonical only)
  const globalExactEntity = await findExactEntity({
    supabaseClient,
    normalized,
    type,
    projectId: null,
  });
  if (globalExactEntity) {
    const canonicalId = await resolveCanonicalEntityId(supabaseClient, globalExactEntity.id);
    await ensureAlias({
      supabaseClient,
      entityId: canonicalId,
      projectId,
      aliasRaw: nameRaw,
      aliasNormalized: normalized,
    });
    return { entityId: canonicalId, needsReview: false };
  }

  // 4) Global exact alias match
  const globalExactAliasEntityId = await findExactAliasEntityId({
    supabaseClient,
    normalized,
    type,
    projectId: null,
  });
  if (globalExactAliasEntityId) {
    const canonicalId = await resolveCanonicalEntityId(supabaseClient, globalExactAliasEntityId);
    await ensureAlias({
      supabaseClient,
      entityId: canonicalId,
      projectId,
      aliasRaw: nameRaw,
      aliasNormalized: normalized,
    });
    return { entityId: canonicalId, needsReview: false };
  }

  // Fuzzy search: project-scoped first, then global
  const projectFuzzy = await findBestFuzzyCandidate({
    supabaseClient,
    normalized,
    type,
    projectId,
  });

  let bestCandidate = projectFuzzy;
  if (!bestCandidate) {
    bestCandidate = await findBestFuzzyCandidate({
      supabaseClient,
      normalized,
      type,
      projectId: null,
    });
  }

  if (bestCandidate && bestCandidate.similarity + EPSILON >= AUTO_MERGE_THRESHOLD) {
    const canonicalId = await resolveCanonicalEntityId(supabaseClient, bestCandidate.entityId);
    await ensureAlias({
      supabaseClient,
      entityId: canonicalId,
      projectId,
      aliasRaw: nameRaw,
      aliasNormalized: normalized,
    });
    return { entityId: canonicalId, needsReview: false };
  }

  // Between review threshold and auto-merge threshold: create new project entity, mark review.
  if (
    bestCandidate &&
    bestCandidate.similarity + EPSILON >= REVIEW_THRESHOLD &&
    bestCandidate.similarity + EPSILON < AUTO_MERGE_THRESHOLD
  ) {
    const newEntityId = await createProjectCanonicalEntity({
      supabaseClient,
      projectId,
      nameRaw,
      normalized,
      type,
    });
    await ensureAlias({
      supabaseClient,
      entityId: newEntityId,
      projectId,
      aliasRaw: nameRaw,
      aliasNormalized: normalized,
    });
    return { entityId: newEntityId, needsReview: true };
  }

  // No safe fuzzy match: create new project entity.
  const newEntityId = await createProjectCanonicalEntity({
    supabaseClient,
    projectId,
    nameRaw,
    normalized,
    type,
  });
  await ensureAlias({
    supabaseClient,
    entityId: newEntityId,
    projectId,
    aliasRaw: nameRaw,
    aliasNormalized: normalized,
  });
  return { entityId: newEntityId, needsReview: false };
}

async function findExactEntity(args: {
  supabaseClient: SupabaseClient<Database>;
  normalized: string;
  type: EntityType;
  projectId: string | null;
}): Promise<EntityRowLoose | null> {
  const { supabaseClient, normalized, type, projectId } = args;

  let query = supabaseClient
    .from("entities")
    .select("id, canonical_entity_id, project_id, type, normalized_name")
    .eq("normalized_name", normalized)
    .eq("type", type)
    .is("canonical_entity_id", null)
    .limit(1);

  query = projectId === null ? query.is("project_id", null) : query.eq("project_id", projectId);

  const { data, error } = await query.maybeSingle<EntityRowLoose>();
  if (error) throw error;

  return data ?? null;
}

async function findExactAliasEntityId(args: {
  supabaseClient: SupabaseClient<Database>;
  normalized: string;
  type: EntityType;
  projectId: string | null;
}): Promise<string | null> {
  const { supabaseClient, normalized, type, projectId } = args;

  let query = supabaseClient
    .from("entity_aliases")
    .select(
      "entity_id, entities!entity_aliases_entity_id_fkey(id, canonical_entity_id, project_id, type, normalized_name)"
    )
    .eq("alias_normalized", normalized)
    .limit(1);

  query = projectId === null ? query.is("project_id", null) : query.eq("project_id", projectId);

  const { data, error } = await query.maybeSingle<AliasMatchRowLoose>();
  if (error) throw error;
  if (!data) return null;

  const joined = unwrapSingleEntity(data.entities);
  if (!joined || joined.type !== type) return null;
  return data.entity_id;
}

async function findBestFuzzyCandidate(args: {
  supabaseClient: SupabaseClient<Database>;
  normalized: string;
  type: EntityType;
  projectId: string | null;
}): Promise<Candidate | null> {
  const { supabaseClient, normalized, type, projectId } = args;

  const candidateScoreByEntity = new Map<string, number>();

  // Fuzzy over canonical entities
  let entityQuery = supabaseClient
    .from("entities")
    .select("id, canonical_entity_id, project_id, type, normalized_name")
    .eq("type", type)
    .is("canonical_entity_id", null)
    .limit(200);

  entityQuery =
    projectId === null ? entityQuery.is("project_id", null) : entityQuery.eq("project_id", projectId);

  const { data: fuzzyEntities, error: fuzzyEntitiesError } =
    await entityQuery.returns<FuzzyEntityRowLoose[]>();
  if (fuzzyEntitiesError) throw fuzzyEntitiesError;

  for (const row of fuzzyEntities ?? []) {
    const score = trigramSimilarity(normalized, row.normalized_name);
    if (score <= 0) continue;
    setBestScore(candidateScoreByEntity, row.id, score);
  }

  // Fuzzy over aliases
  let aliasQuery = supabaseClient
    .from("entity_aliases")
    .select(
      "entity_id, alias_normalized, entities!entity_aliases_entity_id_fkey(id, canonical_entity_id, project_id, type, normalized_name)"
    )
    .limit(200);

  aliasQuery = projectId === null ? aliasQuery.is("project_id", null) : aliasQuery.eq("project_id", projectId);

  const { data: fuzzyAliases, error: fuzzyAliasesError } =
    await aliasQuery.returns<FuzzyAliasRowLoose[]>();
  if (fuzzyAliasesError) throw fuzzyAliasesError;

  for (const row of fuzzyAliases ?? []) {
    const joined = unwrapSingleEntity(row.entities);
    if (!joined || joined.type !== type) continue;
    const score = trigramSimilarity(normalized, row.alias_normalized);
    if (score <= 0) continue;
    setBestScore(candidateScoreByEntity, row.entity_id, score);
  }

  if (candidateScoreByEntity.size === 0) return null;

  let best: Candidate | null = null;
  for (const [entityId, similarity] of candidateScoreByEntity.entries()) {
    if (!best || similarity > best.similarity) {
      best = { entityId, similarity };
    }
  }

  return best;
}

async function createProjectCanonicalEntity(args: {
  supabaseClient: SupabaseClient<Database>;
  projectId: string;
  nameRaw: string;
  normalized: string;
  type: EntityType;
}): Promise<string> {
  const { supabaseClient, projectId, nameRaw, normalized, type } = args;

  const insertPayload: EntityInsert = {
    name: nameRaw.trim(),
    normalized_name: normalized,
    type,
    project_id: projectId,
    canonical_entity_id: null,
    metadata: {},
  };

  const { data, error } = await supabaseClient
    .from("entities")
    .insert(insertPayload)
    .select("id")
    .single<{ id: string }>();

  if (error) throw error;
  return data.id;
}

async function resolveCanonicalEntityId(
  supabaseClient: SupabaseClient<Database>,
  entityId: string
): Promise<string> {
  const MAX_DEPTH = 10;
  let currentId = entityId;
  const visited = new Set<string>();

  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    if (visited.has(currentId)) {
      break;
    }
    visited.add(currentId);

    const { data, error } = await supabaseClient
      .from("entities")
      .select("id, canonical_entity_id")
      .eq("id", currentId)
      .maybeSingle<{ id: string; canonical_entity_id: string | null }>();

    if (error) throw error;
    if (!data || !data.canonical_entity_id) {
      return currentId;
    }
    currentId = data.canonical_entity_id;
  }

  return currentId;
}

async function ensureAlias(args: {
  supabaseClient: SupabaseClient<Database>;
  entityId: string;
  projectId: string;
  aliasRaw: string;
  aliasNormalized: string;
}): Promise<void> {
  const { supabaseClient, entityId, projectId, aliasRaw, aliasNormalized } = args;

  const payload: EntityAliasInsert = {
    entity_id: entityId,
    alias: aliasRaw.trim(),
    alias_normalized: aliasNormalized,
    source: "system",
    confidence: 1,
    project_id: projectId,
  };

  const { error } = await supabaseClient.from("entity_aliases").insert(payload);
  if (!error) return;

  // Ignore unique violations; alias already exists for this scope.
  if (error.code === "23505") return;
  throw error;
}

function unwrapSingleEntity(
  value: EntityRowLoose | EntityRowLoose[] | null
): EntityRowLoose | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function setBestScore(map: Map<string, number>, entityId: string, score: number): void {
  const existing = map.get(entityId);
  if (existing == null || score > existing) {
    map.set(entityId, score);
  }
}

function trigramSimilarity(a: string, b: string): number {
  const left = buildTrigramSet(a);
  const right = buildTrigramSet(b);

  if (left.size === 0 || right.size === 0) return 0;

  let intersection = 0;
  for (const gram of left) {
    if (right.has(gram)) intersection += 1;
  }

  return (2 * intersection) / (left.size + right.size);
}

function buildTrigramSet(value: string): Set<string> {
  const normalized = `  ${value.trim()}  `;
  const out = new Set<string>();

  for (let i = 0; i < normalized.length - 2; i += 1) {
    out.add(normalized.slice(i, i + 3));
  }

  return out;
}
