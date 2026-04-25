/**
 * Editable relationship governance — pure logic tests.
 *
 * Covers the persistence gate's editorial-suppression behavior so we can
 * guarantee that:
 *
 *   1. A relationship rejected by an editor is NOT recreated by a fresh LLM
 *      pass (the gate drops it before insert).
 *   2. Pending LLM relationships still flow through normally when no
 *      editorial suppression keys exist.
 *   3. The relationship key helper produces deterministic, collision-free
 *      identifiers for the (source, target, relation_type) triple.
 *
 * See: docs/features/on-going/editable-relationship-governance.md
 */

import { describe, expect, it } from "vitest";
import {
  applyPersistenceGate,
  relationshipKey,
  type ExtractedRelationship,
} from "@/lib/ai/persistence-gate";
import type {
  EntityForGrounding,
  GroundedMention,
} from "@/lib/entities/ground-mentions";

const ALICE_ID = "00000000-0000-0000-0000-00000000a11ce";
const ACME_ID = "00000000-0000-0000-0000-0000000000ac";
const CHUNK_ID = "00000000-0000-0000-0000-00000000c001";
const INTERVIEW_ID = "00000000-0000-0000-0000-0000000071ee";

function persistableMention(entityId: string): GroundedMention {
  return {
    entityId,
    chunkId: CHUNK_ID,
    matchMethod: "exact",
    matchConfidence: "high",
    context: "context",
    sentiment: null,
  };
}

function buildBaseInput(rels: ExtractedRelationship[]) {
  const entitiesForGrounding: EntityForGrounding[] = [
    { name: "Alice", entityId: ALICE_ID, sentiment: null },
    { name: "Acme", entityId: ACME_ID, sentiment: null },
  ];

  const groundedMap = new Map<string, GroundedMention[]>([
    [ALICE_ID, [persistableMention(ALICE_ID)]],
    [ACME_ID, [persistableMention(ACME_ID)]],
  ]);

  const entityIdMap = new Map<string, string>([
    ["Alice", ALICE_ID],
    ["alice", ALICE_ID],
    ["Acme", ACME_ID],
    ["acme", ACME_ID],
  ]);

  return {
    interviewId: INTERVIEW_ID,
    entitiesForGrounding,
    groundedMap,
    relationships: rels,
    entityIdMap,
  };
}

describe("relationshipKey", () => {
  it("produces a deterministic, ordered key", () => {
    expect(relationshipKey("a", "b", "ally")).toBe("a|b|ally");
    expect(relationshipKey("a", "b", "ally")).not.toBe(
      relationshipKey("b", "a", "ally")
    );
    expect(relationshipKey("a", "b", "ally")).not.toBe(
      relationshipKey("a", "b", "competitor")
    );
  });
});

describe("applyPersistenceGate — editorial suppression", () => {
  const baseRels: ExtractedRelationship[] = [
    {
      source_name: "Alice",
      target_name: "Acme",
      relation_type: "ally",
      confidence: 0.9,
      evidence_text: "evidence",
    },
  ];

  it("persists a normal LLM relationship when no editorial suppression exists", () => {
    const gated = applyPersistenceGate(buildBaseInput(baseRels));

    expect(gated.relationshipRows).toHaveLength(1);
    expect(gated.relationshipRows[0]).toMatchObject({
      source_entity_id: ALICE_ID,
      target_entity_id: ACME_ID,
      relation_type: "ally",
      interview_id: INTERVIEW_ID,
    });
    expect(gated.stats.relationshipsKept).toBe(1);
    expect(gated.stats.relationshipsSuppressedByEditorial).toBe(0);
  });

  it("drops a relationship that an editor previously rejected on this interview", () => {
    const rejectedKeys = new Set<string>([
      relationshipKey(ALICE_ID, ACME_ID, "ally"),
    ]);

    const gated = applyPersistenceGate({
      ...buildBaseInput(baseRels),
      rejectedRelationshipKeys: rejectedKeys,
    });

    expect(gated.relationshipRows).toHaveLength(0);
    expect(gated.stats.relationshipsKept).toBe(0);
    expect(gated.stats.relationshipsSuppressedByEditorial).toBe(1);
  });

  it("only suppresses the matching triple — sibling triples flow through", () => {
    const multipleRels: ExtractedRelationship[] = [
      ...baseRels,
      {
        source_name: "Alice",
        target_name: "Acme",
        relation_type: "competitor",
        confidence: 0.8,
        evidence_text: null,
      },
    ];

    const rejectedKeys = new Set<string>([
      relationshipKey(ALICE_ID, ACME_ID, "ally"),
    ]);

    const gated = applyPersistenceGate({
      ...buildBaseInput(multipleRels),
      rejectedRelationshipKeys: rejectedKeys,
    });

    expect(gated.relationshipRows).toHaveLength(1);
    expect(gated.relationshipRows[0].relation_type).toBe("competitor");
    expect(gated.stats.relationshipsKept).toBe(1);
    expect(gated.stats.relationshipsSuppressedByEditorial).toBe(1);
  });

  it("accepts new v2 taxonomy values (affiliated_with, operates_in, governs, customer_of)", () => {
    // Regression guard for migration 00024 + types update: the persistence
    // gate must accept the v2 relation_type values without TypeScript or
    // runtime drama. This is the contract between extraction.ts (Zod
    // enum) and the gate's RelationshipRow.relation_type field.
    const v2Rels: ExtractedRelationship[] = [
      {
        source_name: "Alice",
        target_name: "Acme",
        relation_type: "affiliated_with",
        confidence: 0.9,
        evidence_text: "Alice is the marketing lead at Acme",
      },
      {
        source_name: "Acme",
        target_name: "Alice",
        relation_type: "customer_of",
        confidence: 0.8,
        evidence_text: null,
      },
    ];

    const gated = applyPersistenceGate(buildBaseInput(v2Rels));

    expect(gated.relationshipRows).toHaveLength(2);
    expect(gated.relationshipRows.map((r) => r.relation_type).sort()).toEqual(
      ["affiliated_with", "customer_of"].sort()
    );
    expect(gated.stats.relationshipsKept).toBe(2);
    expect(gated.stats.relationshipsSuppressedByEditorial).toBe(0);
  });

  it("counts editorial suppression separately from grounding-based drops", () => {
    const relsWithUngroundedEndpoint: ExtractedRelationship[] = [
      ...baseRels,
      {
        source_name: "Alice",
        target_name: "Ghost", // not in entityIdMap — gets dropped by grounding
        relation_type: "investor",
        confidence: 0.5,
        evidence_text: null,
      },
    ];

    const rejectedKeys = new Set<string>([
      relationshipKey(ALICE_ID, ACME_ID, "ally"),
    ]);

    const gated = applyPersistenceGate({
      ...buildBaseInput(relsWithUngroundedEndpoint),
      rejectedRelationshipKeys: rejectedKeys,
    });

    expect(gated.stats.relationshipsKept).toBe(0);
    expect(gated.stats.relationshipsSuppressedByEditorial).toBe(1);
    expect(gated.stats.relationshipsDropped).toBe(1);
  });
});
