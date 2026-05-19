// ============================================
// LLM relationship validation (Phase 3c)
// ============================================
// Pure validation pass run after extraction and before the persistence gate.
// Drops invalid rows and downgrades over-confident rows without evidence.

import { normalizeEntityName } from "@/lib/entities/normalize";
import { RELATION_TYPE_VALUES, type RelationType } from "@/types/database";
import type { ExtractedRelationship } from "@/lib/ai/persistence-gate";

const CANONICAL_RELATION_TYPE_SET: ReadonlySet<string> = new Set(
  RELATION_TYPE_VALUES
);

export interface RelationshipValidationStats {
  input: number;
  kept: number;
  droppedUnknownType: number;
  droppedSelfRelationship: number;
  droppedConfidenceFloor: number;
  downgradedHighConfidenceNoEvidence: number;
}

export interface ValidateExtractedRelationshipsOptions {
  sourceId?: string;
}

/**
 * Validate and normalize LLM-extracted relationships before persistence.
 *
 * - Drops unknown relation types, self-relationships, and near-zero confidence.
 * - Downgrades high-confidence rows missing evidence (does not drop them).
 */
export function validateExtractedRelationships(
  relationships: ExtractedRelationship[],
  options?: ValidateExtractedRelationshipsOptions
): { relationships: ExtractedRelationship[]; stats: RelationshipValidationStats } {
  const stats: RelationshipValidationStats = {
    input: relationships.length,
    kept: 0,
    droppedUnknownType: 0,
    droppedSelfRelationship: 0,
    droppedConfidenceFloor: 0,
    downgradedHighConfidenceNoEvidence: 0,
  };

  const sourceTag = options?.sourceId ? ` source=${options.sourceId}` : "";
  const kept: ExtractedRelationship[] = [];

  for (const rel of relationships) {
    if (!CANONICAL_RELATION_TYPE_SET.has(rel.relation_type)) {
      stats.droppedUnknownType += 1;
      console.warn(
        `[relationship-validation] WARN: unknown_relation_type${sourceTag} type=${String(rel.relation_type)}`
      );
      continue;
    }

    const sourceNorm = normalizeEntityName(rel.source_name);
    const targetNorm = normalizeEntityName(rel.target_name);
    if (
      rel.source_name === rel.target_name ||
      (sourceNorm && targetNorm && sourceNorm === targetNorm)
    ) {
      stats.droppedSelfRelationship += 1;
      console.warn(
        `[relationship-validation] WARN: self_relationship${sourceTag} entity=${rel.source_name}`
      );
      continue;
    }

    if (rel.confidence < 0.1) {
      stats.droppedConfidenceFloor += 1;
      console.warn(
        `[relationship-validation] WARN: confidence_below_floor${sourceTag} confidence=${rel.confidence}`
      );
      continue;
    }

    let confidence = rel.confidence;
    const evidence = rel.evidence_text?.trim() ?? null;
    if (confidence >= 0.7 && !evidence) {
      confidence = 0.5;
      stats.downgradedHighConfidenceNoEvidence += 1;
      console.warn(
        `[relationship-validation] WARN: high_confidence_no_evidence${sourceTag} type=${rel.relation_type} downgraded to 0.5`
      );
    }

    kept.push({
      ...rel,
      relation_type: rel.relation_type as RelationType,
      confidence,
      evidence_text: evidence,
    });
  }

  stats.kept = kept.length;
  return { relationships: kept, stats };
}
