// ============================================
// Hybrid Entity Grounding for Chunk-Level Mentions
// ============================================
//
// Grounds entity mentions to specific transcript chunks using a
// four-tier strategy (exact → alias → anchor_context → fuzzy).
//
// This replaces the old approach of creating interview-level mentions
// with null chunk_id/context. Grounded mentions carry chunk evidence
// that chat and reports can surface directly.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { normalizeEntityName } from "./normalize";

// ── Public types ────────────────────────────────────────────────────

export type MatchMethod = "exact" | "alias" | "anchor_context" | "fuzzy";
export type MatchConfidence = "high" | "medium" | "low";

// ── Persistence policy ──────────────────────────────────────────────
//
// Which grounding methods are considered **explicit textual evidence**
// sufficient to persist an `entity_mention` and, by extension, any
// relationship that depends on that entity.
//
// Product intent (precision > recall in this phase):
//   - `exact`          → canonical entity name is literally in the chunk.   PERSIST
//   - `alias`          → a known alias from `entity_aliases` is literally
//                        in the chunk.                                      PERSIST
//   - `anchor_context` → upload anchor inferred from honorific / surname /
//                        org-token overlap. Useful for *internal* chunk
//                        resolution, but not a guarantee that the entity
//                        is explicitly mentioned.                           DO NOT PERSIST
//   - `fuzzy`          → capitalized-name trigram similarity. Too noisy
//                        to act as ground truth for persistence.            DO NOT PERSIST
//
// `anchor_context` and `fuzzy` are still computed and returned by the
// grounding pass because they improve downstream resolution and chunk
// coverage, but the persistence gate in `src/lib/ai/persistence-gate.ts`
// must filter them out before writing to `entity_mentions`.
export const PERSISTABLE_MATCH_METHODS: ReadonlySet<MatchMethod> = new Set<MatchMethod>([
  "exact",
  "alias",
]);

export function isPersistableMatchMethod(method: MatchMethod): boolean {
  return PERSISTABLE_MATCH_METHODS.has(method);
}

export interface GroundedMention {
  entityId: string;
  chunkId: string;
  context: string;
  matchMethod: MatchMethod;
  matchConfidence: MatchConfidence;
  sentiment: string | null;
}

export interface EntityForGrounding {
  name: string;
  entityId: string;
  sentiment: string | null;
}

export interface ChunkForGrounding {
  id: string;
  chunkIndex: number;
  content: string;
  speaker: string | null;
}

export interface GroundingAnchors {
  intervieweeName: string | null;
  intervieweeOrg: string | null;
}

// ── Configuration ───────────────────────────────────────────────────

const MAX_CONTEXT_LENGTH = 500;
const FUZZY_GROUNDING_THRESHOLD = 0.75;
const FUZZY_HIGH_CONFIDENCE_THRESHOLD = 0.85;

const STOP_WORDS = new Set([
  "the", "of", "and", "for", "in", "to", "at", "by", "on", "with", "from",
  "a", "an", "is", "are", "was", "were", "be", "been", "has", "have", "had",
  "that", "this", "it", "its", "not", "but", "or", "as", "if", "we", "our",
]);

const HONORIFIC_RE =
  /\b(?:mr|mrs|ms|dr|prof|minister|governor|chairman|ambassador|ceo|president|director|secretary|commissioner|excellency)\.?\b/gi;

// ── Main entry point ────────────────────────────────────────────────

/**
 * Ground extracted entities to specific transcript chunks.
 *
 * Returns a map from entityId → array of grounded mentions.
 * Entities that cannot be grounded to any chunk are absent from the map;
 * the caller should create a fallback interview-level mention for those.
 */
export async function groundEntityMentions(params: {
  entities: EntityForGrounding[];
  chunks: ChunkForGrounding[];
  anchors: GroundingAnchors;
  entityIdMap: Map<string, string>;
  supabaseClient: SupabaseClient<Database>;
}): Promise<Map<string, GroundedMention[]>> {
  const { entities, chunks, anchors, entityIdMap, supabaseClient } = params;

  if (entities.length === 0 || chunks.length === 0) return new Map();

  const aliasesByEntity = await fetchAliasesForEntities(
    supabaseClient,
    entities.map((e) => e.entityId)
  );

  const personEntityId = resolveAnchorEntityId(
    anchors.intervieweeName,
    entityIdMap
  );
  const orgEntityId = resolveAnchorEntityId(
    anchors.intervieweeOrg,
    entityIdMap
  );

  const results = new Map<string, GroundedMention[]>();

  for (const entity of entities) {
    const aliases = aliasesByEntity.get(entity.entityId) ?? [];
    const isPersonAnchor = Boolean(personEntityId) && entity.entityId === personEntityId;
    const isOrgAnchor = Boolean(orgEntityId) && entity.entityId === orgEntityId;

    const grounded = groundSingleEntity({
      entity,
      aliases,
      chunks,
      isPersonAnchor,
      isOrgAnchor,
      anchors,
    });

    if (grounded.length > 0) {
      results.set(entity.entityId, grounded);
    }
  }

  return results;
}

// ── Backfill utility ────────────────────────────────────────────────

/**
 * Backfill chunk grounding for existing ungrounded entity_mentions.
 * Processes a single interview: finds mentions with null chunk_id,
 * runs hybrid grounding, creates new grounded rows, and removes
 * the old ungrounded rows that were successfully replaced.
 */
export async function backfillInterviewMentions(
  supabaseClient: SupabaseClient<Database>,
  interviewId: string
): Promise<{ grounded: number; skipped: number }> {
  const { data: interview } = await supabaseClient
    .from("interviews")
    .select("interviewee_name, interviewee_org, project_id, tenant_id")
    .eq("id", interviewId)
    .single();

  if (!interview?.project_id) {
    return { grounded: 0, skipped: 0 };
  }
  const tenantId = interview.tenant_id as string;

  const { data: ungroundedMentions } = await supabaseClient
    .from("entity_mentions")
    .select("id, entity_id, sentiment")
    .eq("interview_id", interviewId)
    .is("chunk_id", null);

  if (!ungroundedMentions || ungroundedMentions.length === 0) {
    return { grounded: 0, skipped: 0 };
  }

  const { data: chunks } = await supabaseClient
    .from("interview_chunks")
    .select("id, chunk_index, content, speaker")
    .eq("interview_id", interviewId)
    .order("chunk_index");

  if (!chunks || chunks.length === 0) {
    return { grounded: 0, skipped: ungroundedMentions.length };
  }

  const entityIds = ungroundedMentions.map((m) => m.entity_id);

  const { data: entities } = await supabaseClient
    .from("entities")
    .select("id, name, normalized_name")
    .in("id", entityIds);

  if (!entities || entities.length === 0) {
    return { grounded: 0, skipped: ungroundedMentions.length };
  }

  const entityNameMap = new Map<string, string>();
  for (const e of entities) {
    entityNameMap.set(e.name, e.id);
    entityNameMap.set(e.normalized_name, e.id);
  }

  const entitiesForGrounding: EntityForGrounding[] = ungroundedMentions.map((m) => {
    const entity = entities.find((e) => e.id === m.entity_id);
    return {
      name: entity?.name ?? "",
      entityId: m.entity_id,
      sentiment: m.sentiment,
    };
  });

  const chunksForGrounding: ChunkForGrounding[] = chunks.map((c) => ({
    id: c.id,
    chunkIndex: c.chunk_index,
    content: c.content,
    speaker: c.speaker,
  }));

  const groundedMap = await groundEntityMentions({
    entities: entitiesForGrounding,
    chunks: chunksForGrounding,
    anchors: {
      intervieweeName: interview.interviewee_name,
      intervieweeOrg: interview.interviewee_org,
    },
    entityIdMap: entityNameMap,
    supabaseClient,
  });

  let groundedCount = 0;
  let skippedCount = 0;

  for (const mention of ungroundedMentions) {
    const newMentions = groundedMap.get(mention.entity_id);
    if (!newMentions || newMentions.length === 0) {
      skippedCount++;
      continue;
    }

    for (const gm of newMentions) {
      const { error } = await supabaseClient.from("entity_mentions").upsert(
        {
          tenant_id: tenantId,
          entity_id: gm.entityId,
          interview_id: interviewId,
          chunk_id: gm.chunkId,
          context: gm.context,
          sentiment: gm.sentiment,
        },
        { onConflict: "entity_id,interview_id,chunk_id" }
      );
      if (error) {
        console.error("Backfill: failed to insert grounded mention:", error);
      }
    }

    // Remove the old ungrounded row now that grounded replacements exist
    const { error: delError } = await supabaseClient
      .from("entity_mentions")
      .delete()
      .eq("id", mention.id);
    if (delError) {
      console.error("Backfill: failed to remove old ungrounded mention:", delError);
    }

    groundedCount++;
  }

  return { grounded: groundedCount, skipped: skippedCount };
}

// ── Core grounding logic ────────────────────────────────────────────

function groundSingleEntity(params: {
  entity: EntityForGrounding;
  aliases: string[];
  chunks: ChunkForGrounding[];
  isPersonAnchor: boolean;
  isOrgAnchor: boolean;
  anchors: GroundingAnchors;
}): GroundedMention[] {
  const { entity, aliases, chunks, isPersonAnchor, isOrgAnchor, anchors } = params;
  const seen = new Set<string>();
  const results: GroundedMention[] = [];

  for (const chunk of chunks) {
    const match =
      tryExactMatch(entity.name, chunk) ??
      tryAliasMatch(aliases, chunk) ??
      tryAnchorContextMatch(chunk, isPersonAnchor, isOrgAnchor, anchors) ??
      tryFuzzyMatch(entity.name, aliases, chunk);

    if (match && !seen.has(chunk.id)) {
      seen.add(chunk.id);
      results.push({
        entityId: entity.entityId,
        chunkId: chunk.id,
        context: match.context,
        matchMethod: match.matchMethod,
        matchConfidence: match.matchConfidence,
        sentiment: entity.sentiment,
      });
    }
  }

  return results;
}

// ── Strategy 1: Exact Match ─────────────────────────────────────────

interface StrategyResult {
  context: string;
  matchMethod: MatchMethod;
  matchConfidence: MatchConfidence;
}

function tryExactMatch(
  entityName: string,
  chunk: ChunkForGrounding
): StrategyResult | null {
  if (!entityName || entityName.length < 2) return null;
  if (!containsWordBounded(chunk.content, entityName)) return null;

  return {
    context: buildContextExcerpt(chunk.content, entityName),
    matchMethod: "exact",
    matchConfidence: "high",
  };
}

// ── Strategy 2: Alias Match ────────────────────────────────────────

function tryAliasMatch(
  aliases: string[],
  chunk: ChunkForGrounding
): StrategyResult | null {
  for (const alias of aliases) {
    if (!alias || alias.length < 2) continue;
    if (containsWordBounded(chunk.content, alias)) {
      return {
        context: buildContextExcerpt(chunk.content, alias),
        matchMethod: "alias",
        matchConfidence: "high",
      };
    }
  }
  return null;
}

// ── Strategy 3: Anchor Context Match ────────────────────────────────

function tryAnchorContextMatch(
  chunk: ChunkForGrounding,
  isPersonAnchor: boolean,
  isOrgAnchor: boolean,
  anchors: GroundingAnchors
): StrategyResult | null {
  if (isPersonAnchor && anchors.intervieweeName) {
    const result = matchPersonAnchorInChunk(chunk.content, anchors.intervieweeName);
    if (result) return result;
  }

  if (isOrgAnchor && anchors.intervieweeOrg) {
    const result = matchOrgAnchorInChunk(chunk.content, anchors.intervieweeOrg);
    if (result) return result;
  }

  return null;
}

/**
 * Detect primary interviewee via contextual clues when exact name is absent.
 *
 * Signals:
 * - Individual name tokens present as standalone words (>= 4 chars)
 * - Honorific/title followed by a word with high similarity to a name token
 */
function matchPersonAnchorInChunk(
  chunkContent: string,
  intervieweeName: string
): StrategyResult | null {
  const nameTokens = intervieweeName
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !STOP_WORDS.has(t.toLowerCase()));

  if (nameTokens.length === 0) return null;

  // Check if any distinctive name token appears as a standalone word
  for (const token of nameTokens) {
    if (containsWordBounded(chunkContent, token)) {
      return {
        context: buildContextExcerpt(chunkContent, token),
        matchMethod: "anchor_context",
        matchConfidence: "medium",
      };
    }
  }

  // Check for honorific + fuzzy match on a name token
  const honorificMatches = chunkContent.matchAll(HONORIFIC_RE);
  for (const hMatch of honorificMatches) {
    if (hMatch.index == null) continue;
    const afterHonorific = chunkContent.slice(
      hMatch.index + hMatch[0].length,
      hMatch.index + hMatch[0].length + 30
    );
    const nextWord = afterHonorific.match(/^\s*(\p{L}[\p{L}'-]+)/u)?.[1];
    if (!nextWord || nextWord.length < 3) continue;

    for (const token of nameTokens) {
      const sim = trigramSimilarity(
        token.toLowerCase(),
        nextWord.toLowerCase()
      );
      if (sim >= 0.55) {
        const matchedText = hMatch[0] + " " + nextWord;
        return {
          context: buildContextExcerpt(chunkContent, matchedText),
          matchMethod: "anchor_context",
          matchConfidence: "medium",
        };
      }
    }
  }

  return null;
}

/**
 * Detect primary institution via significant token overlap.
 * Requires >= 2 distinctive org tokens present in the chunk.
 */
function matchOrgAnchorInChunk(
  chunkContent: string,
  intervieweeOrg: string
): StrategyResult | null {
  const orgTokens = getSignificantTokens(intervieweeOrg);
  if (orgTokens.length < 2) return null;

  let matchCount = 0;
  let firstMatchedToken = "";

  for (const token of orgTokens) {
    if (containsWordBounded(chunkContent, token)) {
      matchCount++;
      if (!firstMatchedToken) firstMatchedToken = token;
    }
  }

  if (matchCount >= 2) {
    return {
      context: buildContextExcerpt(chunkContent, firstMatchedToken),
      matchMethod: "anchor_context",
      matchConfidence: "medium",
    };
  }

  return null;
}

// ── Strategy 4: Conservative Fuzzy Match ────────────────────────────

function tryFuzzyMatch(
  entityName: string,
  aliases: string[],
  chunk: ChunkForGrounding
): StrategyResult | null {
  const candidates = [entityName, ...aliases].filter(
    (c) => c && c.length >= 4
  );
  if (candidates.length === 0) return null;

  // Extract capitalized word sequences (potential entity names) from the chunk
  const namePatterns =
    chunk.content.match(
      /\b[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){0,3}/gu
    ) ?? [];

  for (const candidate of candidates) {
    const candidateNorm = normalizeEntityName(candidate);
    if (!candidateNorm || candidateNorm.length < 4) continue;

    for (const pattern of namePatterns) {
      const patternNorm = normalizeEntityName(pattern);
      if (!patternNorm || patternNorm.length < 3) continue;

      const sim = trigramSimilarity(candidateNorm, patternNorm);
      if (sim >= FUZZY_HIGH_CONFIDENCE_THRESHOLD) {
        return {
          context: buildContextExcerpt(chunk.content, pattern),
          matchMethod: "fuzzy",
          matchConfidence: "medium",
        };
      }
      // Between threshold and high-confidence: skip (too uncertain)
      // Only medium+ confidence mentions are persisted.
      if (sim >= FUZZY_GROUNDING_THRESHOLD) {
        // Accept only if the candidate and pattern share a distinctive token
        if (sharesDistinctiveToken(candidate, pattern)) {
          return {
            context: buildContextExcerpt(chunk.content, pattern),
            matchMethod: "fuzzy",
            matchConfidence: "medium",
          };
        }
      }
    }
  }

  return null;
}

// ── Utility helpers ─────────────────────────────────────────────────

function containsWordBounded(text: string, needle: string): boolean {
  if (!needle || needle.length < 2) return false;
  const escaped = escapeRegExp(needle);
  const regex = new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`,
    "iu"
  );
  return regex.test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildContextExcerpt(
  chunkContent: string,
  matchedText: string
): string {
  if (chunkContent.length <= MAX_CONTEXT_LENGTH) {
    return chunkContent;
  }

  const matchIndex = chunkContent
    .toLowerCase()
    .indexOf(matchedText.toLowerCase());
  if (matchIndex === -1) {
    return chunkContent.slice(0, MAX_CONTEXT_LENGTH) + "…";
  }

  const halfWindow = Math.floor((MAX_CONTEXT_LENGTH - matchedText.length) / 2);
  const start = Math.max(0, matchIndex - halfWindow);
  const end = Math.min(
    chunkContent.length,
    matchIndex + matchedText.length + halfWindow
  );

  let excerpt = chunkContent.slice(start, end);
  if (start > 0) excerpt = "…" + excerpt;
  if (end < chunkContent.length) excerpt = excerpt + "…";
  return excerpt;
}

function getSignificantTokens(text: string): string[] {
  return text
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !STOP_WORDS.has(t.toLowerCase()));
}

function sharesDistinctiveToken(a: string, b: string): boolean {
  const tokensA = getSignificantTokens(a).map((t) => t.toLowerCase());
  const tokensB = new Set(
    getSignificantTokens(b).map((t) => t.toLowerCase())
  );
  return tokensA.some((t) => tokensB.has(t));
}

function resolveAnchorEntityId(
  anchorName: string | null | undefined,
  entityIdMap: Map<string, string>
): string | null {
  if (!anchorName) return null;
  return (
    entityIdMap.get(anchorName) ??
    entityIdMap.get(normalizeEntityName(anchorName)) ??
    null
  );
}

async function fetchAliasesForEntities(
  supabase: SupabaseClient<Database>,
  entityIds: string[]
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (entityIds.length === 0) return result;

  const { data, error } = await supabase
    .from("entity_aliases")
    .select("entity_id, alias")
    .in("entity_id", entityIds);

  if (error) {
    console.error("Failed to fetch aliases for grounding:", error);
    return result;
  }

  for (const row of data ?? []) {
    const list = result.get(row.entity_id) ?? [];
    list.push(row.alias);
    result.set(row.entity_id, list);
  }

  return result;
}

// Trigram similarity (Dice coefficient on character trigrams)
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
