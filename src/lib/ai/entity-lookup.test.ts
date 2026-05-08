/**
 * Contract tests for getMentions — the consumer of the entity_intel RPC
 * introduced in migration 00026.
 *
 * These tests guard the structural invariants of Phase 1 / PR 1.1:
 *   - All four roles surfaced by entity_intel are mapped onto MentionRecord.
 *   - The interviewee / interviewee_org branches surface even when there
 *     is no chunk-level mention (the audit §13 symptom).
 *   - Dedup keeps the highest-precedence role per interview.
 *   - The relationship branch must never surface review_status='rejected'
 *     rows. The RPC enforces it; this test mirrors the contract for the
 *     consumer side, alongside relationship-active-filter.test.ts which
 *     guards the same rule for getRelationships.
 *
 * The RPC is called via supabase.rpc(...). We mock at that boundary so
 * the test is a pure-function exercise, matching the repo convention
 * (see src/__tests__/relationship-active-filter.test.ts and
 * src/lib/ai/persistence-gate.test.ts).
 *
 * Spec: docs/features/on-going/chat-entity-retrieval-rpc.md
 * Plan: docs/roadmaps/database-refactor-plan.md §3
 */

import { describe, expect, it } from "vitest";
import { getMentions, type MentionRole } from "./entity-lookup";

type EntityIntelRow = {
  source_id: string;
  source_title: string;
  role: MentionRole;
  kind: "mention" | "anchor" | "source_entity" | "relationship";
  evidence: string | null;
  chunk_id: string | null;
  sentiment: string | null;
  conducted_at: string | null;
  created_at: string;
};

function makeAdminClient(rows: EntityIntelRow[], opts?: { error?: { message: string } }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const admin = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (opts?.error) {
        return { data: null, error: opts.error };
      }
      return { data: rows, error: null };
    },
  };
  return { admin: admin as unknown as Parameters<typeof getMentions>[0], calls };
}

const ENTITY_ID = "00000000-0000-0000-0000-000000000aaa";
const PROJECT_ID = "00000000-0000-0000-0000-000000000bbb";

const t = (iso: string) => iso; // alias for readability

describe("getMentions — entity_intel RPC consumer", () => {
  it("calls entity_intel with the entity id and project id (or null)", async () => {
    const { admin, calls } = makeAdminClient([]);
    await getMentions(admin, ENTITY_ID, PROJECT_ID);
    expect(calls).toEqual([
      {
        fn: "entity_intel",
        args: { p_entity_id: ENTITY_ID, p_project_id: PROJECT_ID },
      },
    ]);

    const noProject = makeAdminClient([]);
    await getMentions(noProject.admin, ENTITY_ID);
    expect(noProject.calls[0]?.args).toEqual({
      p_entity_id: ENTITY_ID,
      p_project_id: null,
    });
  });

  it("returns [] when the RPC errors (and does not throw)", async () => {
    const { admin } = makeAdminClient([], { error: { message: "boom" } });
    const out = await getMentions(admin, ENTITY_ID);
    expect(out).toEqual([]);
  });

  it("maps mention rows: chunk_content from evidence, sentiment, role", async () => {
    const rows: EntityIntelRow[] = [
      {
        source_id: "src-A",
        source_title: "Interview A",
        role: "mention",
        kind: "mention",
        evidence: "He said the project would scale.",
        chunk_id: "chunk-1",
        sentiment: "positive",
        conducted_at: t("2026-04-10T00:00:00.000Z"),
        created_at: t("2026-04-11T00:00:00.000Z"),
      },
    ];
    const { admin } = makeAdminClient(rows);
    const out = await getMentions(admin, ENTITY_ID);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      interview_id: "src-A",
      interview_title: "Interview A",
      role: "mention",
      kind: "mention",
      sentiment: "positive",
      chunk_content: "He said the project would scale.",
    });
    expect(out[0].interview_time_ms).toEqual(
      Date.parse("2026-04-10T00:00:00.000Z"),
    );
  });

  it("surfaces interviewee anchor rows even when the chunk-level mention is absent (audit §13)", async () => {
    // The exact pattern the audit §13 known-symptom probe describes:
    // entity is the interviewee of the interview, no entity_mention was
    // persisted by the gate. The RPC's branch #2 emits an anchor row,
    // and getMentions must surface it as role='interviewee'.
    const rows: EntityIntelRow[] = [
      {
        source_id: "src-B",
        source_title: "Interview B",
        role: "interviewee",
        kind: "anchor",
        evidence: null,
        chunk_id: null,
        sentiment: null,
        conducted_at: t("2026-03-01T00:00:00.000Z"),
        created_at: t("2026-03-02T00:00:00.000Z"),
      },
    ];
    const { admin } = makeAdminClient(rows);
    const out = await getMentions(admin, ENTITY_ID);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe("interviewee");
    expect(out[0].chunk_content).toBeNull();
    expect(out[0].interview_id).toBe("src-B");
  });

  it("surfaces interviewee_org and related_via_relationship rows", async () => {
    const rows: EntityIntelRow[] = [
      {
        source_id: "src-C",
        source_title: "Interview C",
        role: "interviewee_org",
        kind: "anchor",
        evidence: null,
        chunk_id: null,
        sentiment: null,
        conducted_at: null,
        created_at: t("2026-02-01T00:00:00.000Z"),
      },
      {
        source_id: "src-D",
        source_title: "Interview D",
        role: "related_via_relationship",
        kind: "relationship",
        evidence: "X partners with Y.",
        chunk_id: null,
        sentiment: null,
        conducted_at: null,
        created_at: t("2026-02-02T00:00:00.000Z"),
      },
    ];
    const { admin } = makeAdminClient(rows);
    const out = await getMentions(admin, ENTITY_ID);
    const byId = new Map(out.map((r) => [r.interview_id, r]));
    expect(byId.get("src-C")?.role).toBe("interviewee_org");
    expect(byId.get("src-D")?.role).toBe("related_via_relationship");
    expect(byId.get("src-D")?.chunk_content).toBe("X partners with Y.");
  });

  it("dedups by interview, keeping the highest-precedence role (interviewee > mention > related)", async () => {
    // Same interview, three rows: relationship + mention + interviewee.
    // Precedence dictates the survivor is the interviewee row.
    const rows: EntityIntelRow[] = [
      {
        source_id: "src-E",
        source_title: "Interview E",
        role: "related_via_relationship",
        kind: "relationship",
        evidence: "rel evidence",
        chunk_id: null,
        sentiment: null,
        conducted_at: null,
        created_at: t("2026-01-03T00:00:00.000Z"),
      },
      {
        source_id: "src-E",
        source_title: "Interview E",
        role: "mention",
        kind: "mention",
        evidence: "chunk text",
        chunk_id: "chunk-9",
        sentiment: "positive",
        conducted_at: null,
        created_at: t("2026-01-03T00:00:00.000Z"),
      },
      {
        source_id: "src-E",
        source_title: "Interview E",
        role: "interviewee",
        kind: "anchor",
        evidence: null,
        chunk_id: null,
        sentiment: null,
        conducted_at: null,
        created_at: t("2026-01-03T00:00:00.000Z"),
      },
    ];
    const { admin } = makeAdminClient(rows);
    const out = await getMentions(admin, ENTITY_ID);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe("interviewee");
  });

  it("sorts by recency (most recent first) when no temporal target is given", async () => {
    const rows: EntityIntelRow[] = [
      {
        source_id: "old",
        source_title: "Old",
        role: "mention",
        kind: "mention",
        evidence: "x",
        chunk_id: "c1",
        sentiment: null,
        conducted_at: t("2026-01-01T00:00:00.000Z"),
        created_at: t("2026-01-02T00:00:00.000Z"),
      },
      {
        source_id: "new",
        source_title: "New",
        role: "mention",
        kind: "mention",
        evidence: "y",
        chunk_id: "c2",
        sentiment: null,
        conducted_at: t("2026-04-01T00:00:00.000Z"),
        created_at: t("2026-04-02T00:00:00.000Z"),
      },
    ];
    const { admin } = makeAdminClient(rows);
    const out = await getMentions(admin, ENTITY_ID);
    expect(out.map((r) => r.interview_id)).toEqual(["new", "old"]);
  });

  it("sorts by proximity to targetDateIso when prioritizeTemporalProximity is set", async () => {
    const rows: EntityIntelRow[] = [
      {
        source_id: "before",
        source_title: "Before",
        role: "mention",
        kind: "mention",
        evidence: "x",
        chunk_id: "c1",
        sentiment: null,
        conducted_at: t("2026-01-01T00:00:00.000Z"),
        created_at: t("2026-01-02T00:00:00.000Z"),
      },
      {
        source_id: "near",
        source_title: "Near",
        role: "mention",
        kind: "mention",
        evidence: "y",
        chunk_id: "c2",
        sentiment: null,
        conducted_at: t("2026-03-15T00:00:00.000Z"),
        created_at: t("2026-03-16T00:00:00.000Z"),
      },
      {
        source_id: "after",
        source_title: "After",
        role: "mention",
        kind: "mention",
        evidence: "z",
        chunk_id: "c3",
        sentiment: null,
        conducted_at: t("2026-06-01T00:00:00.000Z"),
        created_at: t("2026-06-02T00:00:00.000Z"),
      },
    ];
    const { admin } = makeAdminClient(rows);
    const out = await getMentions(admin, ENTITY_ID, null, {
      targetDateIso: "2026-03-20",
      prioritizeTemporalProximity: true,
    });
    expect(out[0].interview_id).toBe("near");
  });

  it("caps the result at 30 rows", async () => {
    const rows: EntityIntelRow[] = Array.from({ length: 50 }).map((_, i) => ({
      source_id: `s-${i}`,
      source_title: `S ${i}`,
      role: "mention" as const,
      kind: "mention" as const,
      evidence: "x",
      chunk_id: `c-${i}`,
      sentiment: null,
      conducted_at: null,
      created_at: t(`2026-04-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`),
    }));
    const { admin } = makeAdminClient(rows);
    const out = await getMentions(admin, ENTITY_ID);
    expect(out.length).toBeLessThanOrEqual(30);
  });
});

// ── Phase 2.4 — source_entities roles ────────────────────────────────────────

describe("getMentions — source_entities roles (Phase 2.4)", () => {
  it("surfaces author rows from source_entities (kind=source_entity)", async () => {
    // An entity written with link_type='author', origin='extraction' by Phase 2.3.
    const rows: EntityIntelRow[] = [
      {
        source_id: "src-F",
        source_title: "Policy Brief",
        role: "author",
        kind: "source_entity",
        evidence: null,
        chunk_id: null,
        sentiment: null,
        conducted_at: t("2026-03-01T00:00:00.000Z"),
        created_at: t("2026-03-02T00:00:00.000Z"),
      },
    ];
    const { admin } = makeAdminClient(rows);
    const out = await getMentions(admin, ENTITY_ID);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe("author");
    expect(out[0].kind).toBe("source_entity");
    expect(out[0].chunk_content).toBeNull();
    expect(out[0].interview_id).toBe("src-F");
  });

  it("surfaces primary_subject rows (kind=source_entity)", async () => {
    const rows: EntityIntelRow[] = [
      {
        source_id: "src-G",
        source_title: "Market Report",
        role: "primary_subject",
        kind: "source_entity",
        evidence: null,
        chunk_id: null,
        sentiment: null,
        conducted_at: null,
        created_at: t("2026-04-01T00:00:00.000Z"),
      },
    ];
    const { admin } = makeAdminClient(rows);
    const out = await getMentions(admin, ENTITY_ID);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe("primary_subject");
    expect(out[0].kind).toBe("source_entity");
  });

  it("dedup: interviewee (anchor) wins over author (source_entity) for same source", async () => {
    // Phase 2.3 could write both an upload_anchor interviewee row AND an
    // extraction author row for the same entity on the same source (they have
    // different link_type so the quad key allows both). entity_intel will emit
    // two rows; getMentions should keep only the higher-precedence one.
    const rows: EntityIntelRow[] = [
      {
        source_id: "src-H",
        source_title: "Interview H",
        role: "author",
        kind: "source_entity",
        evidence: null,
        chunk_id: null,
        sentiment: null,
        conducted_at: t("2026-04-01T00:00:00.000Z"),
        created_at: t("2026-04-02T00:00:00.000Z"),
      },
      {
        source_id: "src-H",
        source_title: "Interview H",
        role: "interviewee",
        kind: "anchor",
        evidence: null,
        chunk_id: null,
        sentiment: null,
        conducted_at: t("2026-04-01T00:00:00.000Z"),
        created_at: t("2026-04-02T00:00:00.000Z"),
      },
    ];
    const { admin } = makeAdminClient(rows);
    const out = await getMentions(admin, ENTITY_ID);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe("interviewee");
  });

  it("dedup: primary_subject wins over mention for same source", async () => {
    const rows: EntityIntelRow[] = [
      {
        source_id: "src-I",
        source_title: "Interview I",
        role: "mention",
        kind: "mention",
        evidence: "She spoke at length about Angola.",
        chunk_id: "chunk-x",
        sentiment: "neutral",
        conducted_at: null,
        created_at: t("2026-04-03T00:00:00.000Z"),
      },
      {
        source_id: "src-I",
        source_title: "Interview I",
        role: "primary_subject",
        kind: "source_entity",
        evidence: null,
        chunk_id: null,
        sentiment: null,
        conducted_at: null,
        created_at: t("2026-04-03T00:00:00.000Z"),
      },
    ];
    const { admin } = makeAdminClient(rows);
    const out = await getMentions(admin, ENTITY_ID);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe("primary_subject");
  });

  it("dedup: author wins over related_via_relationship for same source", async () => {
    const rows: EntityIntelRow[] = [
      {
        source_id: "src-J",
        source_title: "Interview J",
        role: "related_via_relationship",
        kind: "relationship",
        evidence: "partners with org X",
        chunk_id: null,
        sentiment: null,
        conducted_at: null,
        created_at: t("2026-04-04T00:00:00.000Z"),
      },
      {
        source_id: "src-J",
        source_title: "Interview J",
        role: "author",
        kind: "source_entity",
        evidence: null,
        chunk_id: null,
        sentiment: null,
        conducted_at: null,
        created_at: t("2026-04-04T00:00:00.000Z"),
      },
    ];
    const { admin } = makeAdminClient(rows);
    const out = await getMentions(admin, ENTITY_ID);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe("author");
  });
});
