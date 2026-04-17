// ============================================
// Entity / Relationship Persistence Gate
// ============================================
//
// Pure function that decides **what** gets written to `entity_mentions`
// and `entity_relationships` once grounding has run.
//
// Product rule enforced here:
//   1. An entity is persisted only if at least one of its grounded
//      mentions used a *persistable* match method (see
//      `PERSISTABLE_MATCH_METHODS` in `src/lib/entities/ground-mentions.ts`).
//      There is NO silent `chunk_id = null` fallback for ungrounded
//      entities.
//   2. A relationship is persisted only if BOTH source and target
//      entities survived rule (1).
//
// Anchor entities (interviewee, interviewee org) are treated exactly
// like any other entity for persistence: they must earn local textual
// evidence. They remain usable for internal resolution via
// `entityIdMap` / chunk metadata.

import {
  isPersistableMatchMethod,
  type EntityForGrounding,
  type GroundedMention,
  type MatchMethod,
} from "@/lib/entities/ground-mentions";
import { normalizeEntityName } from "@/lib/entities/normalize";

export interface ExtractedRelationship {
  source_name: string;
  target_name: string;
  relation_type:
    | "business_partner"
    | "competitor"
    | "regulator"
    | "critic"
    | "ally"
    | "subsidiary"
    | "investor"
    | "advisor"
    | "supplier"
    | "acquirer";
  confidence: number;
  evidence_text: string | null;
}

export interface MentionRow {
  entity_id: string;
  interview_id: string;
  chunk_id: string;
  context: string;
  sentiment: string | null;
}

export interface RelationshipRow {
  source_entity_id: string;
  target_entity_id: string;
  relation_type: ExtractedRelationship["relation_type"];
  confidence: number;
  evidence_text: string | null;
  interview_id: string;
}

export interface PersistenceGateInput {
  interviewId: string;
  entitiesForGrounding: EntityForGrounding[];
  /** Output of `groundEntityMentions()`: entityId → grounded mentions. */
  groundedMap: Map<string, GroundedMention[]>;
  relationships: ExtractedRelationship[];
  /**
   * Name → entityId lookup used to resolve relationship endpoints.
   * Typically contains every resolved entity's `resolvedName`/`rawName`
   * and their normalized forms, plus upload-anchor name → anchor entity id.
   */
  entityIdMap: Map<string, string>;
}

export interface PersistenceGateStats {
  /** Total entities seen by the grounding pass. */
  totalEntities: number;
  /** Entities that have at least one persistable grounded mention. */
  persistedEntities: number;
  /** Entities that had zero grounded mentions at all. */
  ungrounded: number;
  /**
   * Entities that were grounded only via non-persistable methods
   * (`anchor_context` / `fuzzy`) — grounding signal exists but it is
   * not strong enough to write to the persisted graph.
   */
  droppedByPolicy: number;
  /** Relationship rows kept after the gate. */
  relationshipsKept: number;
  /** Relationship rows dropped because at least one endpoint did not survive. */
  relationshipsDropped: number;
}

export interface PersistenceGateOutput {
  mentionRows: MentionRow[];
  relationshipRows: RelationshipRow[];
  persistedEntityIds: Set<string>;
  stats: PersistenceGateStats;
}

/**
 * Apply the persistence gate to the grounded output of a pipeline run.
 *
 * Pure: does not touch Supabase. Both `pipeline.ts` and
 * `document-pipeline.ts` call this before their batched upserts.
 */
export function applyPersistenceGate(
  input: PersistenceGateInput
): PersistenceGateOutput {
  const {
    interviewId,
    entitiesForGrounding,
    groundedMap,
    relationships,
    entityIdMap,
  } = input;

  const persistedEntityIds = new Set<string>();
  const mentionRows: MentionRow[] = [];

  let ungrounded = 0;
  let droppedByPolicy = 0;

  for (const entity of entitiesForGrounding) {
    const mentions = groundedMap.get(entity.entityId);

    if (!mentions || mentions.length === 0) {
      ungrounded += 1;
      continue;
    }

    const persistableMentions = mentions.filter((m) =>
      isPersistableMatchMethod(m.matchMethod as MatchMethod)
    );

    if (persistableMentions.length === 0) {
      droppedByPolicy += 1;
      continue;
    }

    persistedEntityIds.add(entity.entityId);
    for (const gm of persistableMentions) {
      mentionRows.push({
        entity_id: gm.entityId,
        interview_id: interviewId,
        chunk_id: gm.chunkId,
        context: gm.context,
        sentiment: gm.sentiment,
      });
    }
  }

  const relationshipRows: RelationshipRow[] = [];
  let relationshipsDropped = 0;

  for (const rel of relationships) {
    const sourceId = resolveNameToEntityId(rel.source_name, entityIdMap);
    const targetId = resolveNameToEntityId(rel.target_name, entityIdMap);

    if (
      !sourceId ||
      !targetId ||
      !persistedEntityIds.has(sourceId) ||
      !persistedEntityIds.has(targetId)
    ) {
      relationshipsDropped += 1;
      continue;
    }

    relationshipRows.push({
      source_entity_id: sourceId,
      target_entity_id: targetId,
      relation_type: rel.relation_type,
      confidence: rel.confidence,
      evidence_text: rel.evidence_text ?? null,
      interview_id: interviewId,
    });
  }

  const stats: PersistenceGateStats = {
    totalEntities: entitiesForGrounding.length,
    persistedEntities: persistedEntityIds.size,
    ungrounded,
    droppedByPolicy,
    relationshipsKept: relationshipRows.length,
    relationshipsDropped,
  };

  return {
    mentionRows,
    relationshipRows,
    persistedEntityIds,
    stats,
  };
}

function resolveNameToEntityId(
  name: string,
  entityIdMap: Map<string, string>
): string | null {
  if (!name) return null;
  return (
    entityIdMap.get(name) ??
    entityIdMap.get(normalizeEntityName(name)) ??
    null
  );
}
