// ============================================
// source_entities — pipeline writer (Phase 2.3 / PR 2.3)
// ============================================
// Writes rows into `source_entities` for two provenance channels:
//   1. upload_anchor — set from `sources.interviewee_entity_id` and
//      `sources.interviewee_org_entity_id` after a source is processed.
//   2. extraction    — set from the LLM's `source_associations` field
//      (author / primary_subject / subject_organization), filtered by
//      confidence threshold (default 0.9) and mapped from canonical_name
//      → resolved entity_id via the pipeline's entityIdMap.
//
// Both writers are idempotent: they UPSERT against the quad UNIQUE
// (source_id, entity_id, link_type, origin) and ignore duplicates.
// On reprocess, `clear_source_derived_data` (migration 00029) deletes
// origin='extraction' rows BEFORE these writes run, so reprocess always
// reflects the latest extraction; origin='upload_anchor' rows are
// preserved across reprocesses.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  SourceEntityLinkType,
  SourceEntityOrigin,
} from "@/types/database";
import { normalizeEntityName } from "@/lib/entities/normalize";

type SourceEntityInsert =
  Database["public"]["Tables"]["source_entities"]["Insert"];

/**
 * Default confidence floor for `origin='extraction'` rows.
 * Confirmed in the Phase 2.3 spec — keeps source-level associations
 * conservative until governance flows mature.
 */
export const EXTRACTION_CONFIDENCE_FLOOR = 0.9;

// ── Anchor writer ──────────────────────────────────────────────────────

/**
 * Persist the upload-anchor source/entity links for a freshly processed
 * source. Idempotent — safe to call on every pipeline run, including
 * reviewed reprocess (these rows are preserved by clear_source_derived_data).
 *
 * Returns the number of distinct anchor rows we attempted (caller may log).
 */
export async function writeAnchorSourceEntities(args: {
  supabase: SupabaseClient<Database>;
  sourceId: string;
  tenantId: string;
  intervieweeEntityId: string | null | undefined;
  intervieweeOrgEntityId: string | null | undefined;
}): Promise<number> {
  const { supabase, sourceId, tenantId, intervieweeEntityId, intervieweeOrgEntityId } =
    args;

  const rows: SourceEntityInsert[] = [];

  // Both anchors are `is_primary: true`: the user explicitly entered
  // them in the Add Source form, so they are the structural subjects of
  // the source. The schema does not constrain "at most one primary per
  // source" — multiple primaries are allowed (`(person, org)` pair).
  if (intervieweeEntityId) {
    rows.push({
      source_id: sourceId,
      tenant_id: tenantId,
      entity_id: intervieweeEntityId,
      link_type: "interviewee",
      origin: "upload_anchor",
      is_primary: true,
      confidence: null,
    });
  }

  if (intervieweeOrgEntityId) {
    rows.push({
      source_id: sourceId,
      tenant_id: tenantId,
      entity_id: intervieweeOrgEntityId,
      link_type: "interviewee_org",
      origin: "upload_anchor",
      is_primary: true,
      confidence: null,
    });
  }

  if (rows.length === 0) return 0;

  const { error } = await supabase
    .from("source_entities")
    .upsert(rows, {
      onConflict: "source_id,entity_id,link_type,origin",
      ignoreDuplicates: true,
    });

  if (error) {
    console.error(
      `[source-entities] anchor write failed for source ${sourceId}:`,
      error
    );
    return 0;
  }

  return rows.length;
}

// ── Participant anchor writer ─────────────────────────────────────────────

/**
 * Persist `upload_anchor` rows for additional participants tagged at upload
 * time (the "Additional known entities" form section).
 *
 * Idempotent — upserts against (source_id, entity_id, link_type, origin).
 * Safe to call on reprocess: `clear_source_derived_data` preserves
 * `origin='upload_anchor'` rows, so participant tags survive reprocessing.
 */
export async function writeParticipantSourceEntities(args: {
  supabase: SupabaseClient<Database>;
  sourceId: string;
  tenantId: string;
  participants: Array<{
    entityId: string;
    linkType: SourceEntityLinkType;
    context: string | null;
  }>;
}): Promise<void> {
  const { supabase, sourceId, tenantId, participants } = args;
  if (participants.length === 0) return;

  const rows: SourceEntityInsert[] = participants.map((p) => ({
    source_id: sourceId,
    tenant_id: tenantId,
    entity_id: p.entityId,
    link_type: p.linkType,
    origin: "upload_anchor" as SourceEntityOrigin,
    is_primary: false,
    confidence: null,
    context: p.context ?? null,
  }));

  const { error } = await supabase
    .from("source_entities")
    .upsert(rows, {
      onConflict: "source_id,entity_id,link_type,origin",
      ignoreDuplicates: true,
    });

  if (error) {
    console.error(
      `[source-entities] participant write failed for source ${sourceId}:`,
      error
    );
  }
}

// ── Extraction writer ──────────────────────────────────────────────────

/** Shape emitted by extraction.ts after Zod inference. Kept narrow on purpose. */
export interface ExtractionSourceAssociation {
  name: string;
  link_type: "author" | "primary_subject" | "subject_organization";
  confidence: number;
  evidence_text: string | null;
}

/**
 * Map an extraction-source-association name (canonical_name from the LLM)
 * to a resolved entity ID using the same `entityIdMap` the pipeline already
 * builds for grounding. Returns null when the name didn't resolve.
 *
 * Tries the literal value first (preserves exact case where useful) and
 * then the normalized form (which is the dominant key the pipeline writes).
 */
function lookupEntityIdByName(
  entityIdMap: Map<string, string>,
  name: string
): string | null {
  if (!name) return null;
  const direct = entityIdMap.get(name);
  if (direct) return direct;
  const norm = normalizeEntityName(name);
  if (!norm) return null;
  return entityIdMap.get(norm) ?? null;
}

/**
 * Persist `origin='extraction'` rows from the LLM's source_associations.
 *
 * - Filters by `confidence >= threshold` (default 0.9).
 * - Maps each `name` to an entity ID via the resolver's entityIdMap.
 * - Drops rows whose name doesn't resolve (the resolver may have already
 *   filtered the entity out via Q1 match_only — that's intentional).
 * - Idempotent: UPSERT on the quad UNIQUE; we use `ignoreDuplicates`
 *   because the row is invariant for a given (source, entity, link_type,
 *   origin), and confidence is treated as immutable for the LLM pass.
 *
 * Returns counts so the pipeline can log a single summary line.
 */
export async function writeExtractionSourceEntities(args: {
  supabase: SupabaseClient<Database>;
  sourceId: string;
  tenantId: string;
  associations: ExtractionSourceAssociation[];
  entityIdMap: Map<string, string>;
  threshold?: number;
}): Promise<{
  attempted: number;
  written: number;
  droppedLowConfidence: number;
  droppedUnresolved: number;
}> {
  const {
    supabase,
    sourceId,
    tenantId,
    associations,
    entityIdMap,
    threshold = EXTRACTION_CONFIDENCE_FLOOR,
  } = args;

  const stats = {
    attempted: associations.length,
    written: 0,
    droppedLowConfidence: 0,
    droppedUnresolved: 0,
  };

  if (associations.length === 0) return stats;

  const rows: SourceEntityInsert[] = [];
  const seen = new Set<string>(); // (entity_id, link_type) dedupe within this call

  for (const assoc of associations) {
    if (assoc.confidence < threshold) {
      stats.droppedLowConfidence += 1;
      continue;
    }

    const entityId = lookupEntityIdByName(entityIdMap, assoc.name);
    if (!entityId) {
      stats.droppedUnresolved += 1;
      continue;
    }

    const linkType: SourceEntityLinkType = assoc.link_type;
    const origin: SourceEntityOrigin = "extraction";

    const dedupeKey = `${entityId}::${linkType}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    rows.push({
      source_id: sourceId,
      tenant_id: tenantId,
      entity_id: entityId,
      link_type: linkType,
      origin,
      is_primary: false,
      confidence: assoc.confidence,
      evidence: assoc.evidence_text
        ? { quote: assoc.evidence_text }
        : null,
    });
  }

  if (rows.length === 0) return stats;

  const { error } = await supabase
    .from("source_entities")
    .upsert(rows, {
      onConflict: "source_id,entity_id,link_type,origin",
      ignoreDuplicates: true,
    });

  if (error) {
    console.error(
      `[source-entities] extraction write failed for source ${sourceId}:`,
      error
    );
    return stats;
  }

  stats.written = rows.length;
  return stats;
}
