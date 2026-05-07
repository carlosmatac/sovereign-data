/**
 * Contract tests for source-entities-writer (PR 2.3).
 *
 * Guards the structural invariants of source_entities pipeline writes:
 *   - Anchor writes: only emitted for non-null anchor IDs; quad keys
 *     are exact (interviewee | interviewee_org × upload_anchor).
 *   - Extraction writes: drop confidence < threshold; drop unresolved
 *     names; dedupe (entity, link_type) within a single call.
 *   - Both writers UPSERT with ignoreDuplicates so they're idempotent
 *     across reprocesses.
 *
 * The Supabase client is mocked at the `.from("source_entities").upsert()`
 * boundary, matching the repo convention.
 *
 * Spec: docs/features/on-going/source-entities-pipeline-writes.md
 */

import { describe, expect, it } from "vitest";
import {
  EXTRACTION_CONFIDENCE_FLOOR,
  writeAnchorSourceEntities,
  writeExtractionSourceEntities,
  type ExtractionSourceAssociation,
} from "./source-entities-writer";

type UpsertCall = {
  table: string;
  rows: Array<Record<string, unknown>>;
  opts: { onConflict?: string; ignoreDuplicates?: boolean };
};

function makeAdmin() {
  const calls: UpsertCall[] = [];
  const admin = {
    from: (table: string) => ({
      upsert: (
        rows: Array<Record<string, unknown>>,
        opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}
      ) => {
        calls.push({ table, rows, opts });
        return Promise.resolve({ data: null, error: null });
      },
    }),
  };
  return {
    admin: admin as unknown as Parameters<typeof writeAnchorSourceEntities>[0]["supabase"],
    calls,
  };
}

const SOURCE_ID = "11111111-1111-1111-1111-111111111111";
const PERSON_ID = "22222222-2222-2222-2222-222222222222";
const ORG_ID = "33333333-3333-3333-3333-333333333333";

// ── Anchor writer ──────────────────────────────────────────────────────

describe("writeAnchorSourceEntities", () => {
  it("does nothing when both anchor IDs are null", async () => {
    const { admin, calls } = makeAdmin();
    const written = await writeAnchorSourceEntities({
      supabase: admin,
      sourceId: SOURCE_ID,
      intervieweeEntityId: null,
      intervieweeOrgEntityId: null,
    });
    expect(written).toBe(0);
    expect(calls).toEqual([]);
  });

  it("writes only the interviewee row when only person anchor is set", async () => {
    const { admin, calls } = makeAdmin();
    const written = await writeAnchorSourceEntities({
      supabase: admin,
      sourceId: SOURCE_ID,
      intervieweeEntityId: PERSON_ID,
      intervieweeOrgEntityId: null,
    });
    expect(written).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("source_entities");
    expect(calls[0].rows).toHaveLength(1);
    expect(calls[0].rows[0]).toMatchObject({
      source_id: SOURCE_ID,
      entity_id: PERSON_ID,
      link_type: "interviewee",
      origin: "upload_anchor",
      is_primary: true,
    });
    expect(calls[0].opts).toEqual({
      onConflict: "source_id,entity_id,link_type,origin",
      ignoreDuplicates: true,
    });
  });

  it("writes both rows with correct quad keys, both is_primary=true (PR 2.3 / Q2)", async () => {
    const { admin, calls } = makeAdmin();
    const written = await writeAnchorSourceEntities({
      supabase: admin,
      sourceId: SOURCE_ID,
      intervieweeEntityId: PERSON_ID,
      intervieweeOrgEntityId: ORG_ID,
    });
    expect(written).toBe(2);
    const rows = calls[0].rows;
    const interviewee = rows.find((r) => r.link_type === "interviewee");
    const intervieweeOrg = rows.find((r) => r.link_type === "interviewee_org");
    // Both upload anchors are user-confirmed structural subjects of the
    // source — they are both `is_primary: true` after the 2026-05-07 fix.
    expect(interviewee).toMatchObject({
      entity_id: PERSON_ID,
      origin: "upload_anchor",
      is_primary: true,
      confidence: null,
    });
    expect(intervieweeOrg).toMatchObject({
      entity_id: ORG_ID,
      origin: "upload_anchor",
      is_primary: true,
      confidence: null,
    });
  });
});

// ── Extraction writer ──────────────────────────────────────────────────

function assoc(
  name: string,
  link_type: ExtractionSourceAssociation["link_type"],
  confidence: number,
  evidence_text: string | null = null
): ExtractionSourceAssociation {
  return { name, link_type, confidence, evidence_text };
}

describe("writeExtractionSourceEntities", () => {
  it("returns zero stats and skips DB when there are no associations", async () => {
    const { admin, calls } = makeAdmin();
    const stats = await writeExtractionSourceEntities({
      supabase: admin,
      sourceId: SOURCE_ID,
      associations: [],
      entityIdMap: new Map(),
    });
    expect(stats).toEqual({
      attempted: 0,
      written: 0,
      droppedLowConfidence: 0,
      droppedUnresolved: 0,
    });
    expect(calls).toEqual([]);
  });

  it("drops associations below the default 0.9 confidence floor", async () => {
    const { admin, calls } = makeAdmin();
    const map = new Map([["raji bashir", PERSON_ID]]);
    const stats = await writeExtractionSourceEntities({
      supabase: admin,
      sourceId: SOURCE_ID,
      associations: [assoc("raji bashir", "primary_subject", 0.85)],
      entityIdMap: map,
    });
    expect(stats.attempted).toBe(1);
    expect(stats.written).toBe(0);
    expect(stats.droppedLowConfidence).toBe(1);
    expect(calls).toEqual([]);
  });

  it("drops associations whose name does not resolve via entityIdMap", async () => {
    const { admin, calls } = makeAdmin();
    const stats = await writeExtractionSourceEntities({
      supabase: admin,
      sourceId: SOURCE_ID,
      associations: [assoc("unknown person", "author", 0.95)],
      entityIdMap: new Map(),
    });
    expect(stats.written).toBe(0);
    expect(stats.droppedUnresolved).toBe(1);
    expect(calls).toEqual([]);
  });

  it("writes high-confidence associations and persists evidence as { quote }", async () => {
    const { admin, calls } = makeAdmin();
    const map = new Map([["Raji Bashir", PERSON_ID]]);
    const stats = await writeExtractionSourceEntities({
      supabase: admin,
      sourceId: SOURCE_ID,
      associations: [
        assoc("Raji Bashir", "primary_subject", 0.95, "Today we speak with Raji Bashir."),
      ],
      entityIdMap: map,
    });
    expect(stats.written).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].rows[0]).toMatchObject({
      source_id: SOURCE_ID,
      entity_id: PERSON_ID,
      link_type: "primary_subject",
      origin: "extraction",
      is_primary: false,
      confidence: 0.95,
      evidence: { quote: "Today we speak with Raji Bashir." },
    });
    expect(calls[0].opts).toEqual({
      onConflict: "source_id,entity_id,link_type,origin",
      ignoreDuplicates: true,
    });
  });

  it("dedupes (entity, link_type) within a single call (keeps first)", async () => {
    const { admin, calls } = makeAdmin();
    const map = new Map([["Raji Bashir", PERSON_ID]]);
    const stats = await writeExtractionSourceEntities({
      supabase: admin,
      sourceId: SOURCE_ID,
      associations: [
        assoc("Raji Bashir", "primary_subject", 0.95, "first quote"),
        assoc("Raji Bashir", "primary_subject", 0.99, "second quote"),
      ],
      entityIdMap: map,
    });
    expect(stats.attempted).toBe(2);
    expect(stats.written).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].rows).toHaveLength(1);
    expect(calls[0].rows[0]).toMatchObject({
      confidence: 0.95,
      evidence: { quote: "first quote" },
    });
  });

  it("allows the same entity with two different link_types (e.g. author + primary_subject)", async () => {
    const { admin, calls } = makeAdmin();
    const map = new Map([["Raji Bashir", PERSON_ID]]);
    const stats = await writeExtractionSourceEntities({
      supabase: admin,
      sourceId: SOURCE_ID,
      associations: [
        assoc("Raji Bashir", "author", 0.95),
        assoc("Raji Bashir", "primary_subject", 0.95),
      ],
      entityIdMap: map,
    });
    expect(stats.written).toBe(2);
    expect(calls[0].rows).toHaveLength(2);
    const linkTypes = calls[0].rows.map((r) => r.link_type).sort();
    expect(linkTypes).toEqual(["author", "primary_subject"]);
  });

  it("falls back to normalized lookup when literal name does not match", async () => {
    const { admin, calls } = makeAdmin();
    // entityIdMap typically contains normalized keys (set by pipeline.ts).
    const map = new Map([["raji bashir", PERSON_ID]]);
    const stats = await writeExtractionSourceEntities({
      supabase: admin,
      sourceId: SOURCE_ID,
      associations: [assoc("Raji Bashir", "primary_subject", 0.95)],
      entityIdMap: map,
    });
    expect(stats.written).toBe(1);
    expect(calls[0].rows[0]).toMatchObject({ entity_id: PERSON_ID });
  });

  it("respects a custom threshold passed by the caller", async () => {
    const { admin, calls } = makeAdmin();
    const map = new Map([["Raji Bashir", PERSON_ID]]);
    const stats = await writeExtractionSourceEntities({
      supabase: admin,
      sourceId: SOURCE_ID,
      associations: [assoc("Raji Bashir", "primary_subject", 0.85)],
      entityIdMap: map,
      threshold: 0.8,
    });
    expect(stats.written).toBe(1);
    expect(calls[0].rows[0]).toMatchObject({ confidence: 0.85 });
  });

  it("default threshold equals EXTRACTION_CONFIDENCE_FLOOR (0.9)", () => {
    expect(EXTRACTION_CONFIDENCE_FLOOR).toBe(0.9);
  });
});
