import { describe, expect, it } from "vitest";
import { validateExtractedRelationships } from "@/lib/ai/validate-extracted-relationships";
import type { ExtractedRelationship } from "@/lib/ai/persistence-gate";

function rel(
  partial: Partial<ExtractedRelationship> & Pick<ExtractedRelationship, "source_name" | "target_name" | "relation_type">
): ExtractedRelationship {
  return {
    confidence: 0.8,
    evidence_text: "quoted evidence",
    ...partial,
  };
}

describe("validateExtractedRelationships", () => {
  it("drops self-relationships and unknown types", () => {
    const { relationships, stats } = validateExtractedRelationships([
      rel({ source_name: "Acme", target_name: "Acme", relation_type: "works_at" }),
      rel({
        source_name: "A",
        target_name: "B",
        relation_type: "not_a_real_type" as ExtractedRelationship["relation_type"],
      }),
      rel({ source_name: "Person", target_name: "Org", relation_type: "is_ceo_of" }),
    ]);

    expect(relationships).toHaveLength(1);
    expect(relationships[0].relation_type).toBe("is_ceo_of");
    expect(stats.droppedSelfRelationship).toBe(1);
    expect(stats.droppedUnknownType).toBe(1);
  });

  it("downgrades high-confidence rows without evidence", () => {
    const { relationships, stats } = validateExtractedRelationships([
      rel({
        source_name: "Person",
        target_name: "Org",
        relation_type: "works_at",
        confidence: 0.9,
        evidence_text: null,
      }),
    ]);

    expect(relationships[0].confidence).toBe(0.5);
    expect(stats.downgradedHighConfidenceNoEvidence).toBe(1);
  });

  it("drops rows below the confidence floor", () => {
    const { relationships, stats } = validateExtractedRelationships([
      rel({
        source_name: "Person",
        target_name: "Org",
        relation_type: "works_at",
        confidence: 0.05,
      }),
    ]);

    expect(relationships).toHaveLength(0);
    expect(stats.droppedConfidenceFloor).toBe(1);
  });
});
