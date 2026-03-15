// ============================================
// Stage 2: Entity Resolution + Enrichment
// ============================================
// Takes raw extracted entities (with raw_name + canonical_name from GPT)
// and resolves them against interview anchors, existing entities, and
// aliases. Produces resolved entities with confidence/method tracking
// and ensures descriptions are populated.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, EntityType } from "@/types/database";
import { normalizeEntityName } from "./normalize";
import { matchOrCreateEntity } from "./match";

// ── Public types ────────────────────────────────────────────────────

export type ResolutionMethod =
  | "exact"
  | "alias"
  | "anchor_inferred"
  | "fuzzy"
  | "unresolved";

export interface RawExtractedEntity {
  raw_name: string;
  canonical_name: string;
  type: EntityType;
  description: string;
  sentiment: string | null;
}

export interface ResolvedEntity {
  entityId: string;
  resolvedName: string;
  rawName: string;
  type: EntityType;
  description: string;
  sentiment: string | null;
  resolutionMethod: ResolutionMethod;
  resolutionConfidence: "high" | "medium" | "low";
  needsReview: boolean;
}

export interface ResolutionAnchors {
  intervieweeName: string | null;
  intervieweeOrg: string | null;
}

// ── Configuration ───────────────────────────────────────────────────

const ANCHOR_SIMILARITY_THRESHOLD = 0.55;
const PRIMARY_PERSON_FULL_THRESHOLD = 0.35;
const PRIMARY_PERSON_TOKEN_THRESHOLD = 0.45;
const PRIMARY_PERSON_SURNAME_THRESHOLD = 0.4;

const HONORIFICS = new Set([
  "mr", "mrs", "ms", "miss", "dr", "prof", "professor",
  "sir", "madam", "dame", "lord", "lady",
  "minister", "director", "chairman", "chairwoman",
  "president", "ceo", "cfo", "coo", "cto",
  "general", "colonel", "captain", "major",
  "hon", "honorable", "honourable",
  "excellency", "ambassador", "senator", "governor",
  "sheikh", "imam", "mullah",
]);

// ── Main entry point ────────────────────────────────────────────────

/**
 * Resolve raw extracted entities against known entities, aliases,
 * and interview anchors. Deduplicates by resolved entityId.
 *
 * Returns resolved entities with confidence/method tracking and
 * enriched descriptions.
 */
export async function resolveExtractedEntities(params: {
  rawEntities: RawExtractedEntity[];
  anchors: ResolutionAnchors;
  projectId: string;
  supabaseClient: SupabaseClient<Database>;
}): Promise<ResolvedEntity[]> {
  const { rawEntities, anchors, projectId, supabaseClient } = params;

  const resolved: ResolvedEntity[] = [];
  const seenEntityIds = new Map<string, ResolvedEntity>();

  for (const raw of rawEntities) {
    const result = await resolveSingleEntity({
      raw,
      anchors,
      projectId,
      supabaseClient,
    });

    // Deduplicate: keep the first (usually best) resolution per entityId.
    // Accumulate descriptions from duplicates if the first was empty.
    const existing = seenEntityIds.get(result.entityId);
    if (existing) {
      if (!existing.description && result.description) {
        existing.description = result.description;
      }
      continue;
    }

    seenEntityIds.set(result.entityId, result);
    resolved.push(result);
  }

  // Enrich entity descriptions in DB for all resolved entities
  await enrichEntityDescriptions(supabaseClient, resolved);

  return resolved;
}

// ── Single entity resolution ────────────────────────────────────────

async function resolveSingleEntity(params: {
  raw: RawExtractedEntity;
  anchors: ResolutionAnchors;
  projectId: string;
  supabaseClient: SupabaseClient<Database>;
}): Promise<ResolvedEntity> {
  const { raw, anchors, projectId, supabaseClient } = params;

  // Determine the best name to resolve against:
  // 1. Check if this mention matches an interview anchor
  // 2. Use canonical_name from GPT if available
  // 3. Fall back to raw_name
  const anchorMatch = matchAgainstAnchors(raw, anchors);

  const nameForResolution = anchorMatch
    ? anchorMatch.anchorName
    : raw.canonical_name || raw.raw_name;

  const { entityId, needsReview } = await matchOrCreateEntity({
    projectId,
    nameRaw: nameForResolution,
    type: raw.type,
    supabaseClient,
  });

  // Also register the raw_name as an alias if it differs
  if (
    raw.raw_name &&
    normalizeEntityName(raw.raw_name) !== normalizeEntityName(nameForResolution)
  ) {
    await ensureAliasQuiet(supabaseClient, entityId, projectId, raw.raw_name);
  }

  // Register canonical_name as alias if it differs from both
  if (
    raw.canonical_name &&
    raw.canonical_name !== nameForResolution &&
    normalizeEntityName(raw.canonical_name) !==
      normalizeEntityName(nameForResolution)
  ) {
    await ensureAliasQuiet(
      supabaseClient,
      entityId,
      projectId,
      raw.canonical_name
    );
  }

  const resolutionMethod: ResolutionMethod = anchorMatch
    ? anchorMatch.method
    : needsReview
      ? "fuzzy"
      : "exact";

  const resolutionConfidence = deriveResolutionConfidence(
    resolutionMethod,
    needsReview
  );

  return {
    entityId,
    resolvedName: nameForResolution,
    rawName: raw.raw_name,
    type: raw.type,
    description: raw.description || "",
    sentiment: raw.sentiment,
    resolutionMethod,
    resolutionConfidence,
    needsReview,
  };
}

// ── Anchor matching ─────────────────────────────────────────────────

interface AnchorMatchResult {
  anchorName: string;
  method: ResolutionMethod;
}

function stripHonorifics(normalized: string): string {
  const tokens = normalized.split(/\s+/);
  const filtered = tokens.filter((t) => !HONORIFICS.has(t));
  return filtered.length > 0 ? filtered.join(" ") : normalized;
}

function extractSurname(normalized: string): string | null {
  const tokens = normalized.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return null;
  return tokens[tokens.length - 1];
}

/**
 * Check if a raw entity mention likely refers to an interview anchor
 * (primary interviewee or institution). The primary person anchor uses
 * much more aggressive matching because we KNOW this person is in the
 * interview — false positives are nearly impossible.
 */
function matchAgainstAnchors(
  raw: RawExtractedEntity,
  anchors: ResolutionAnchors
): AnchorMatchResult | null {
  const personAnchor = anchors.intervieweeName;
  const orgAnchor = anchors.intervieweeOrg;

  // Primary person anchor — aggressive matching
  if (personAnchor && isPersonType(raw.type)) {
    const match = tryPrimaryPersonAnchorMatch(raw, personAnchor);
    if (match) return match;
  }

  // Org anchor — standard matching
  if (orgAnchor && isOrgType(raw.type)) {
    const match = tryAnchorMatch(raw, orgAnchor);
    if (match) return match;
  }

  return null;
}

/**
 * Aggressive matching for the primary interviewee. Uses honorific
 * stripping, lower thresholds, and surname-focused comparison.
 * Rationale: we KNOW this person was interviewed. Any PERSON entity
 * that fuzzy-matches the anchor name almost certainly IS the interviewee.
 */
function tryPrimaryPersonAnchorMatch(
  raw: RawExtractedEntity,
  anchorName: string
): AnchorMatchResult | null {
  const anchorNorm = normalizeEntityName(anchorName);
  const rawNorm = normalizeEntityName(raw.raw_name);
  const canonicalNorm = normalizeEntityName(raw.canonical_name);

  // Exact match on either raw or canonical
  if (rawNorm === anchorNorm || canonicalNorm === anchorNorm) {
    console.log(`[anchor-resolve] EXACT match: "${raw.raw_name}" → "${anchorName}"`);
    return { anchorName, method: "exact" };
  }

  // Strip honorifics and try again (handles "Mr. Raji" → "Raji")
  const rawStripped = stripHonorifics(rawNorm);
  const canonicalStripped = stripHonorifics(canonicalNorm);
  const anchorStripped = stripHonorifics(anchorNorm);

  if (rawStripped === anchorStripped || canonicalStripped === anchorStripped) {
    console.log(`[anchor-resolve] EXACT (after honorific strip): "${raw.raw_name}" → "${anchorName}"`);
    return { anchorName, method: "exact" };
  }

  // Surname-focused match: compare just the last tokens
  const anchorSurname = extractSurname(anchorStripped);
  const rawSurname = extractSurname(rawStripped);
  const canonicalSurname = extractSurname(canonicalStripped);

  if (anchorSurname) {
    for (const candidateSurname of [rawSurname, canonicalSurname]) {
      if (!candidateSurname) continue;
      if (candidateSurname === anchorSurname) {
        console.log(`[anchor-resolve] SURNAME exact: "${raw.raw_name}" surname "${candidateSurname}" = anchor surname "${anchorSurname}" → "${anchorName}"`);
        return { anchorName, method: "anchor_inferred" };
      }
      const surnameSim = trigramSimilarity(candidateSurname, anchorSurname);
      if (surnameSim >= PRIMARY_PERSON_SURNAME_THRESHOLD) {
        console.log(`[anchor-resolve] SURNAME fuzzy: "${raw.raw_name}" surname "${candidateSurname}" ~ anchor surname "${anchorSurname}" (sim=${surnameSim.toFixed(3)}) → "${anchorName}"`);
        return { anchorName, method: "anchor_inferred" };
      }
    }
  }

  // Full-name fuzzy with lower threshold (after honorific stripping)
  for (const candidate of [rawStripped, canonicalStripped]) {
    if (!candidate) continue;
    const fullSim = trigramSimilarity(candidate, anchorStripped);
    if (fullSim >= PRIMARY_PERSON_FULL_THRESHOLD) {
      console.log(`[anchor-resolve] FULL fuzzy: "${raw.raw_name}" ~ "${anchorName}" (sim=${fullSim.toFixed(3)}) → matched`);
      return { anchorName, method: "anchor_inferred" };
    }
  }

  // Token-level with lower threshold
  const anchorTokens = anchorStripped.split(/\s+/).filter((t) => t.length >= 3);
  for (const candidate of [rawStripped, canonicalStripped]) {
    if (!candidate) continue;
    const candidateTokens = candidate.split(/\s+/).filter((t) => t.length >= 2);
    for (const at of anchorTokens) {
      for (const ct of candidateTokens) {
        const tokenSim = trigramSimilarity(at, ct);
        if (tokenSim >= PRIMARY_PERSON_TOKEN_THRESHOLD) {
          console.log(`[anchor-resolve] TOKEN fuzzy: "${raw.raw_name}" token "${ct}" ~ anchor token "${at}" (sim=${tokenSim.toFixed(3)}) → "${anchorName}"`);
          return { anchorName, method: "anchor_inferred" };
        }
      }
    }
  }

  console.log(`[anchor-resolve] NO MATCH for PERSON "${raw.raw_name}" (canonical="${raw.canonical_name}") against anchor "${anchorName}"`);
  return null;
}

function tryAnchorMatch(
  raw: RawExtractedEntity,
  anchorName: string
): AnchorMatchResult | null {
  const anchorNorm = normalizeEntityName(anchorName);
  const rawNorm = normalizeEntityName(raw.raw_name);
  const canonicalNorm = normalizeEntityName(raw.canonical_name);

  if (rawNorm === anchorNorm || canonicalNorm === anchorNorm) {
    return { anchorName, method: "exact" };
  }

  if (
    fuzzyAnchorMatch(rawNorm, anchorNorm) ||
    fuzzyAnchorMatch(canonicalNorm, anchorNorm)
  ) {
    return { anchorName, method: "anchor_inferred" };
  }

  return null;
}

function fuzzyAnchorMatch(
  candidateNorm: string,
  anchorNorm: string
): boolean {
  if (!candidateNorm || !anchorNorm) return false;

  const fullSim = trigramSimilarity(candidateNorm, anchorNorm);
  if (fullSim >= ANCHOR_SIMILARITY_THRESHOLD) return true;

  const anchorTokens = anchorNorm
    .split(/\s+/)
    .filter((t) => t.length >= 4);
  const candidateTokens = new Set(
    candidateNorm.split(/\s+/).filter((t) => t.length >= 3)
  );

  for (const at of anchorTokens) {
    for (const ct of candidateTokens) {
      const tokenSim = trigramSimilarity(at, ct);
      if (tokenSim >= 0.6) return true;
    }
  }

  return false;
}

// ── Description enrichment ──────────────────────────────────────────

/**
 * Populate entities.description in the DB when the extraction provides
 * a description but the stored entity has none (or a shorter one).
 */
async function enrichEntityDescriptions(
  supabase: SupabaseClient<Database>,
  resolved: ResolvedEntity[]
): Promise<void> {
  const entitiesToEnrich = resolved.filter((r) => r.description);
  if (entitiesToEnrich.length === 0) return;

  const entityIds = entitiesToEnrich.map((e) => e.entityId);

  const { data: existing } = await supabase
    .from("entities")
    .select("id, description")
    .in("id", entityIds);

  const existingMap = new Map<string, string | null>();
  for (const row of existing ?? []) {
    existingMap.set(row.id, row.description);
  }

  for (const entity of entitiesToEnrich) {
    const currentDesc = existingMap.get(entity.entityId);

    // Update if current description is empty or shorter than what we have
    if (
      !currentDesc ||
      (entity.description.length > currentDesc.length && currentDesc.length < 100)
    ) {
      const { error } = await supabase
        .from("entities")
        .update({ description: entity.description })
        .eq("id", entity.entityId);

      if (error) {
        console.error(
          `Failed to enrich description for entity ${entity.entityId}:`,
          error
        );
      }
    }
  }
}

// ── Utility helpers ─────────────────────────────────────────────────

function isPersonType(type: EntityType): boolean {
  return type === "PERSON";
}

function isOrgType(type: EntityType): boolean {
  return (
    type === "COMPANY" ||
    type === "GOVERNMENT" ||
    type === "ORGANIZATION"
  );
}

function deriveResolutionConfidence(
  method: ResolutionMethod,
  needsReview: boolean
): "high" | "medium" | "low" {
  if (needsReview) return "low";
  switch (method) {
    case "exact":
    case "alias":
      return "high";
    case "anchor_inferred":
      return "medium";
    case "fuzzy":
      return "medium";
    case "unresolved":
      return "low";
  }
}

async function ensureAliasQuiet(
  supabase: SupabaseClient<Database>,
  entityId: string,
  projectId: string,
  aliasRaw: string
): Promise<void> {
  const aliasNormalized = normalizeEntityName(aliasRaw);
  if (!aliasNormalized) return;

  const { error } = await supabase.from("entity_aliases").insert({
    entity_id: entityId,
    alias: aliasRaw.trim(),
    alias_normalized: aliasNormalized,
    source: "extraction",
    confidence: 0.8,
    project_id: projectId,
  });

  // Ignore unique constraint violations
  if (error && error.code !== "23505") {
    console.error("Failed to insert extraction alias:", error);
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
  const padded = `  ${value.trim()}  `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i += 1) {
    out.add(padded.slice(i, i + 3));
  }
  return out;
}
