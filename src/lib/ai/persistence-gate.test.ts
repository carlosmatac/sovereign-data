import { describe, expect, it } from "vitest";
import {
  applyPersistenceGate,
  type ExtractedRelationship,
} from "./persistence-gate";
import type {
  EntityForGrounding,
  GroundedMention,
  MatchMethod,
} from "@/lib/entities/ground-mentions";

// ── Builders ────────────────────────────────────────────────────────

const INTERVIEW_ID = "interview-1";

function entity(
  entityId: string,
  name: string,
  sentiment: string | null = null
): EntityForGrounding {
  return { entityId, name, sentiment };
}

function grounded(
  entityId: string,
  chunkId: string,
  matchMethod: MatchMethod,
  context = "…evidence…"
): GroundedMention {
  return {
    entityId,
    chunkId,
    context,
    matchMethod,
    matchConfidence: "high",
    sentiment: null,
  };
}

function toMap(mentions: GroundedMention[]): Map<string, GroundedMention[]> {
  const m = new Map<string, GroundedMention[]>();
  for (const g of mentions) {
    const list = m.get(g.entityId) ?? [];
    list.push(g);
    m.set(g.entityId, list);
  }
  return m;
}

function buildEntityIdMap(
  entries: Array<[name: string, entityId: string]>
): Map<string, string> {
  return new Map(entries);
}

const relationship = (
  source: string,
  target: string,
  relation_type: ExtractedRelationship["relation_type"] = "business_partner",
  evidence: string | null = "They are partners."
): ExtractedRelationship => ({
  source_name: source,
  target_name: target,
  relation_type,
  confidence: 0.9,
  evidence_text: evidence,
});

// ── Tests ───────────────────────────────────────────────────────────

describe("applyPersistenceGate — entities", () => {
  it("persists an entity with an `exact` grounded mention", () => {
    const entities = [entity("e1", "Acme Corp")];
    const map = toMap([grounded("e1", "chunk-1", "exact")]);

    const result = applyPersistenceGate({
      interviewId: INTERVIEW_ID,
      entitiesForGrounding: entities,
      groundedMap: map,
      relationships: [],
      entityIdMap: buildEntityIdMap([["Acme Corp", "e1"]]),
    });

    expect(result.persistedEntityIds.has("e1")).toBe(true);
    expect(result.mentionRows).toHaveLength(1);
    expect(result.mentionRows[0]).toMatchObject({
      entity_id: "e1",
      interview_id: INTERVIEW_ID,
      chunk_id: "chunk-1",
    });
    expect(result.stats.persistedEntities).toBe(1);
    expect(result.stats.ungrounded).toBe(0);
    expect(result.stats.droppedByPolicy).toBe(0);
  });

  it("persists an entity resolved via `alias` found literally in the text", () => {
    const entities = [entity("e-imf", "International Monetary Fund")];
    const map = toMap([grounded("e-imf", "chunk-2", "alias")]);

    const result = applyPersistenceGate({
      interviewId: INTERVIEW_ID,
      entitiesForGrounding: entities,
      groundedMap: map,
      relationships: [],
      entityIdMap: buildEntityIdMap([
        ["International Monetary Fund", "e-imf"],
      ]),
    });

    expect(result.persistedEntityIds.has("e-imf")).toBe(true);
    expect(result.mentionRows).toHaveLength(1);
  });

  it("does NOT persist a plausible-but-unmentioned entity (no grounded evidence)", () => {
    // This is the canonical leak: the LLM proposed `Plausible Inc` from
    // project context, grounding found no chunk for it.
    const entities = [
      entity("e-mentioned", "Acme Corp"),
      entity("e-plausible", "Plausible Inc"),
    ];
    const map = toMap([grounded("e-mentioned", "chunk-1", "exact")]);

    const result = applyPersistenceGate({
      interviewId: INTERVIEW_ID,
      entitiesForGrounding: entities,
      groundedMap: map,
      relationships: [],
      entityIdMap: buildEntityIdMap([
        ["Acme Corp", "e-mentioned"],
        ["Plausible Inc", "e-plausible"],
      ]),
    });

    expect(result.persistedEntityIds.has("e-mentioned")).toBe(true);
    expect(result.persistedEntityIds.has("e-plausible")).toBe(false);
    expect(result.mentionRows).toHaveLength(1);
    // No silent null-chunk fallback.
    expect(
      result.mentionRows.some((r) => r.entity_id === "e-plausible")
    ).toBe(false);
    expect(result.stats.ungrounded).toBe(1);
  });

  it("does NOT persist an entity whose only grounding is `anchor_context`", () => {
    // Upload anchor that was inferred via honorific/surname matching but
    // whose canonical name is not literally in the source.
    const entities = [entity("e-anchor", "Ngozi Okonjo-Iweala")];
    const map = toMap([grounded("e-anchor", "chunk-1", "anchor_context")]);

    const result = applyPersistenceGate({
      interviewId: INTERVIEW_ID,
      entitiesForGrounding: entities,
      groundedMap: map,
      relationships: [],
      entityIdMap: buildEntityIdMap([
        ["Ngozi Okonjo-Iweala", "e-anchor"],
      ]),
    });

    expect(result.persistedEntityIds.has("e-anchor")).toBe(false);
    expect(result.mentionRows).toHaveLength(0);
    expect(result.stats.droppedByPolicy).toBe(1);
  });

  it("does NOT persist an entity whose only grounding is `fuzzy`", () => {
    const entities = [entity("e-fuzzy", "Société Générale")];
    const map = toMap([grounded("e-fuzzy", "chunk-1", "fuzzy")]);

    const result = applyPersistenceGate({
      interviewId: INTERVIEW_ID,
      entitiesForGrounding: entities,
      groundedMap: map,
      relationships: [],
      entityIdMap: buildEntityIdMap([["Société Générale", "e-fuzzy"]]),
    });

    expect(result.persistedEntityIds.has("e-fuzzy")).toBe(false);
    expect(result.stats.droppedByPolicy).toBe(1);
  });

  it("persists an entity as long as it has ONE persistable mention, even if other mentions are fuzzy", () => {
    const entities = [entity("e-mix", "Example Ltd")];
    const map = toMap([
      grounded("e-mix", "chunk-1", "fuzzy"),
      grounded("e-mix", "chunk-2", "exact"),
    ]);

    const result = applyPersistenceGate({
      interviewId: INTERVIEW_ID,
      entitiesForGrounding: entities,
      groundedMap: map,
      relationships: [],
      entityIdMap: buildEntityIdMap([["Example Ltd", "e-mix"]]),
    });

    expect(result.persistedEntityIds.has("e-mix")).toBe(true);
    // Only the `exact` mention is written — the `fuzzy` one is dropped.
    expect(result.mentionRows).toHaveLength(1);
    expect(result.mentionRows[0].chunk_id).toBe("chunk-2");
  });
});

describe("applyPersistenceGate — relationships", () => {
  it("persists a relationship when both endpoints are grounded-and-persisted", () => {
    const entities = [
      entity("e-a", "Acme Corp"),
      entity("e-b", "Beta SA"),
    ];
    const map = toMap([
      grounded("e-a", "chunk-1", "exact"),
      grounded("e-b", "chunk-1", "exact"),
    ]);

    const result = applyPersistenceGate({
      interviewId: INTERVIEW_ID,
      entitiesForGrounding: entities,
      groundedMap: map,
      relationships: [relationship("Acme Corp", "Beta SA")],
      entityIdMap: buildEntityIdMap([
        ["Acme Corp", "e-a"],
        ["Beta SA", "e-b"],
      ]),
    });

    expect(result.relationshipRows).toHaveLength(1);
    expect(result.relationshipRows[0]).toMatchObject({
      source_entity_id: "e-a",
      target_entity_id: "e-b",
      interview_id: INTERVIEW_ID,
    });
    expect(result.stats.relationshipsKept).toBe(1);
    expect(result.stats.relationshipsDropped).toBe(0);
  });

  it("does NOT persist a relationship when one endpoint is ungrounded", () => {
    const entities = [
      entity("e-a", "Acme Corp"),
      entity("e-ghost", "Ghost Holdings"),
    ];
    // Only Acme is grounded.
    const map = toMap([grounded("e-a", "chunk-1", "exact")]);

    const result = applyPersistenceGate({
      interviewId: INTERVIEW_ID,
      entitiesForGrounding: entities,
      groundedMap: map,
      relationships: [relationship("Acme Corp", "Ghost Holdings")],
      entityIdMap: buildEntityIdMap([
        ["Acme Corp", "e-a"],
        ["Ghost Holdings", "e-ghost"],
      ]),
    });

    expect(result.relationshipRows).toHaveLength(0);
    expect(result.stats.relationshipsDropped).toBe(1);
  });

  it("does NOT persist a relationship when one endpoint is only grounded via `anchor_context`", () => {
    const entities = [
      entity("e-a", "Acme Corp"),
      entity("e-anchor", "Ngozi Okonjo-Iweala"),
    ];
    const map = toMap([
      grounded("e-a", "chunk-1", "exact"),
      grounded("e-anchor", "chunk-1", "anchor_context"),
    ]);

    const result = applyPersistenceGate({
      interviewId: INTERVIEW_ID,
      entitiesForGrounding: entities,
      groundedMap: map,
      relationships: [
        relationship("Ngozi Okonjo-Iweala", "Acme Corp", "critic"),
      ],
      entityIdMap: buildEntityIdMap([
        ["Acme Corp", "e-a"],
        ["Ngozi Okonjo-Iweala", "e-anchor"],
      ]),
    });

    expect(result.relationshipRows).toHaveLength(0);
    expect(result.stats.relationshipsDropped).toBe(1);
  });

  it("does NOT persist a relationship when an endpoint name cannot be resolved at all", () => {
    const entities = [entity("e-a", "Acme Corp")];
    const map = toMap([grounded("e-a", "chunk-1", "exact")]);

    const result = applyPersistenceGate({
      interviewId: INTERVIEW_ID,
      entitiesForGrounding: entities,
      groundedMap: map,
      relationships: [relationship("Acme Corp", "Unknown Entity")],
      entityIdMap: buildEntityIdMap([["Acme Corp", "e-a"]]),
    });

    expect(result.relationshipRows).toHaveLength(0);
    expect(result.stats.relationshipsDropped).toBe(1);
  });

  it("resolves relationship endpoints via normalized name when raw name is missing", () => {
    const entities = [
      entity("e-a", "Acme Corp"),
      entity("e-b", "Beta S.A."),
    ];
    const map = toMap([
      grounded("e-a", "chunk-1", "exact"),
      grounded("e-b", "chunk-1", "exact"),
    ]);

    // entityIdMap only carries the normalized form for Beta — simulating
    // pipeline-level mapping where both raw and normalized keys are stored.
    // Here we store raw for one and normalized for the other.
    const result = applyPersistenceGate({
      interviewId: INTERVIEW_ID,
      entitiesForGrounding: entities,
      groundedMap: map,
      relationships: [relationship("Acme Corp", "Beta S.A.")],
      entityIdMap: buildEntityIdMap([
        ["Acme Corp", "e-a"],
        // normalized form of "Beta S.A." is "beta s a"
        ["beta s a", "e-b"],
      ]),
    });

    expect(result.relationshipRows).toHaveLength(1);
  });
});

describe("applyPersistenceGate — stats", () => {
  it("reports accurate counts across a mixed batch", () => {
    const entities = [
      entity("e-exact", "Alpha"),
      entity("e-alias", "Bravo"),
      entity("e-anchor-only", "Charlie"),
      entity("e-fuzzy-only", "Delta"),
      entity("e-none", "Echo"),
    ];
    const map = toMap([
      grounded("e-exact", "c1", "exact"),
      grounded("e-alias", "c1", "alias"),
      grounded("e-anchor-only", "c1", "anchor_context"),
      grounded("e-fuzzy-only", "c1", "fuzzy"),
      // e-none not grounded at all
    ]);

    const result = applyPersistenceGate({
      interviewId: INTERVIEW_ID,
      entitiesForGrounding: entities,
      groundedMap: map,
      relationships: [],
      entityIdMap: new Map(),
    });

    expect(result.stats).toEqual({
      totalEntities: 5,
      persistedEntities: 2,
      ungrounded: 1,
      droppedByPolicy: 2,
      relationshipsKept: 0,
      relationshipsDropped: 0,
      relationshipsSuppressedByEditorial: 0,
    });
  });
});
