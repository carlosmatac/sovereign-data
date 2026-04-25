/**
 * Admin entity-governance Relationships loader — behavior tests.
 *
 * These guard the contract used by the new admin Relationships section
 * inside `/admin/entities/[id]`:
 *
 *   1. Returns relationships where the entity is EITHER source OR target.
 *   2. INCLUDES rejected rows (admin must see them — unlike the chat
 *      `getRelationships` helper which filters them out).
 *   3. Status filter narrows to `pending` / `approved` / `rejected` /
 *      `active` (= pending + approved).
 *   4. Direction filter narrows to incoming / outgoing.
 *   5. Each row carries the editorial metadata admins need
 *      (`review_status`, `origin`, `interview_title`, etc.) and a stable
 *      `direction` flag relative to the queried entity.
 *
 * The Supabase admin client is mocked so we run with no DB.
 *
 * See docs/features/on-going/editable-relationship-governance.md
 * (Phase 2 — admin entity governance Relationships section).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENTITY_ID = "00000000-0000-0000-0000-000000000aaa";
const OTHER_A = "00000000-0000-0000-0000-000000000bbb";
const OTHER_B = "00000000-0000-0000-0000-000000000ccc";
const INTERVIEW_A = "00000000-0000-0000-0000-0000000777aa";
const INTERVIEW_B = "00000000-0000-0000-0000-0000000777bb";

type RelRow = {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relation_type: string;
  confidence: number;
  evidence_text: string | null;
  interview_id: string;
  review_status: "pending" | "approved" | "rejected";
  origin: "llm" | "human_created" | "human_edited";
  reviewed_at: string | null;
  reviewed_by: string | null;
  updated_at: string;
};

type EntityRow = { id: string; name: string; type: string };
type InterviewRow = { id: string; title: string | null };

// ── In-memory dataset (mutated per test) ──────────────────────────────────
const REL_DATASET: RelRow[] = [];
const ENTITY_DATASET: EntityRow[] = [];
const INTERVIEW_DATASET: InterviewRow[] = [];

function buildRelChain() {
  // Mirrors the small subset of PostgREST builder methods the loader uses:
  //   .select(cols, opts) -> .order() -> .eq()/.or() -> .neq()/.eq() -> .range()
  // We keep filter state in a closure so .range() can apply them.
  const state: {
    eq: Array<[string, unknown]>;
    or: string | null;
    neq: Array<[string, unknown]>;
  } = { eq: [], or: null, neq: [] };

  const chain = {
    select: () => chain,
    order: () => chain,
    eq: (col: string, val: unknown) => {
      state.eq.push([col, val]);
      return chain;
    },
    or: (expr: string) => {
      state.or = expr;
      return chain;
    },
    neq: (col: string, val: unknown) => {
      state.neq.push([col, val]);
      return chain;
    },
    range: (from: number, to: number) => {
      let rows = REL_DATASET.slice();
      if (state.or) {
        const m = state.or.match(/source_entity_id\.eq\.([^,]+),target_entity_id\.eq\.([^,]+)/);
        if (m) {
          const id = m[1];
          rows = rows.filter(
            (r) => r.source_entity_id === id || r.target_entity_id === id
          );
        }
      }
      for (const [col, val] of state.eq) {
        rows = rows.filter(
          (r) => (r as unknown as Record<string, unknown>)[col] === val
        );
      }
      for (const [col, val] of state.neq) {
        rows = rows.filter(
          (r) => (r as unknown as Record<string, unknown>)[col] !== val
        );
      }
      const total = rows.length;
      const sliced = rows.slice(from, to + 1);
      return Promise.resolve({ data: sliced, error: null, count: total });
    },
  };
  return chain;
}

function buildEntitiesChain() {
  const chain = {
    select: () => chain,
    in: (_col: string, ids: string[]) => {
      const set = new Set(ids);
      const rows = ENTITY_DATASET.filter((e) => set.has(e.id));
      return Promise.resolve({ data: rows, error: null });
    },
  };
  return chain;
}

function buildInterviewsChain() {
  const chain = {
    select: () => chain,
    in: (_col: string, ids: string[]) => {
      const set = new Set(ids);
      const rows = INTERVIEW_DATASET.filter((i) => set.has(i.id));
      return Promise.resolve({ data: rows, error: null });
    },
  };
  return chain;
}

vi.mock("@/lib/supabase/admin", () => {
  return {
    createAdminClient: () => ({
      from: (table: string) => {
        if (table === "entity_relationships") return buildRelChain();
        if (table === "entities") return buildEntitiesChain();
        if (table === "interviews") return buildInterviewsChain();
        throw new Error(`Unexpected table in test mock: ${table}`);
      },
    }),
  };
});

// Imported AFTER the vi.mock above so the mock is in place.
import { loadRelationshipsForEntity } from "@/lib/admin/load-governance-relationships";

function seedDataset() {
  REL_DATASET.length = 0;
  ENTITY_DATASET.length = 0;
  INTERVIEW_DATASET.length = 0;

  ENTITY_DATASET.push(
    { id: ENTITY_ID, name: "Acme Corp", type: "COMPANY" },
    { id: OTHER_A, name: "Alice", type: "PERSON" },
    { id: OTHER_B, name: "Globex", type: "COMPANY" }
  );
  INTERVIEW_DATASET.push(
    { id: INTERVIEW_A, title: "Alice on Acme" },
    { id: INTERVIEW_B, title: "Globex briefing" }
  );

  REL_DATASET.push(
    {
      id: "rel-out-approved",
      source_entity_id: ENTITY_ID,
      target_entity_id: OTHER_B,
      relation_type: "competitor",
      confidence: 0.9,
      evidence_text: "outgoing approved",
      interview_id: INTERVIEW_B,
      review_status: "approved",
      origin: "llm",
      reviewed_at: "2026-04-19T00:00:00.000Z",
      reviewed_by: null,
      updated_at: "2026-04-19T00:00:00.000Z",
    },
    {
      id: "rel-in-pending",
      source_entity_id: OTHER_A,
      target_entity_id: ENTITY_ID,
      relation_type: "affiliated_with",
      confidence: 0.8,
      evidence_text: "incoming pending",
      interview_id: INTERVIEW_A,
      review_status: "pending",
      origin: "llm",
      reviewed_at: null,
      reviewed_by: null,
      updated_at: "2026-04-18T00:00:00.000Z",
    },
    {
      id: "rel-in-rejected",
      source_entity_id: OTHER_B,
      target_entity_id: ENTITY_ID,
      relation_type: "ally",
      confidence: 0.5,
      evidence_text: "incoming rejected",
      interview_id: INTERVIEW_B,
      review_status: "rejected",
      origin: "llm",
      reviewed_at: "2026-04-17T00:00:00.000Z",
      reviewed_by: null,
      updated_at: "2026-04-17T00:00:00.000Z",
    },
    // An unrelated edge that must NEVER appear in results for ENTITY_ID
    {
      id: "rel-unrelated",
      source_entity_id: OTHER_A,
      target_entity_id: OTHER_B,
      relation_type: "competitor",
      confidence: 0.7,
      evidence_text: "noise",
      interview_id: INTERVIEW_B,
      review_status: "approved",
      origin: "llm",
      reviewed_at: null,
      reviewed_by: null,
      updated_at: "2026-04-16T00:00:00.000Z",
    }
  );
}

beforeEach(() => {
  seedDataset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("loadRelationshipsForEntity — admin governance loader", () => {
  it("rejects an invalid entity id without hitting the DB", async () => {
    const res = await loadRelationshipsForEntity({ entityId: "not-a-uuid" });
    expect(res.rows).toEqual([]);
    expect(res.totalCount).toBe(0);
    expect(res.totalPages).toBe(1);
  });

  it("returns incoming AND outgoing edges for the queried entity", async () => {
    const res = await loadRelationshipsForEntity({ entityId: ENTITY_ID });

    const ids = res.rows.map((r) => r.id).sort();
    expect(ids).toEqual(
      ["rel-in-pending", "rel-in-rejected", "rel-out-approved"].sort()
    );

    // Unrelated edge must never appear
    expect(ids).not.toContain("rel-unrelated");
    expect(res.totalCount).toBe(3);
  });

  it("INCLUDES rejected rows by default (admin must see them)", async () => {
    const res = await loadRelationshipsForEntity({ entityId: ENTITY_ID });
    const rejected = res.rows.filter((r) => r.review_status === "rejected");
    expect(rejected.map((r) => r.id)).toEqual(["rel-in-rejected"]);
  });

  it("hydrates editorial metadata, related entity info and interview title", async () => {
    const res = await loadRelationshipsForEntity({ entityId: ENTITY_ID });

    const incoming = res.rows.find((r) => r.id === "rel-in-pending");
    expect(incoming).toBeDefined();
    expect(incoming).toMatchObject({
      direction: "incoming",
      related_entity_id: OTHER_A,
      related_entity_name: "Alice",
      related_entity_type: "PERSON",
      review_status: "pending",
      origin: "llm",
      interview_id: INTERVIEW_A,
      interview_title: "Alice on Acme",
      relation_type: "affiliated_with",
    });

    const outgoing = res.rows.find((r) => r.id === "rel-out-approved");
    expect(outgoing).toBeDefined();
    expect(outgoing).toMatchObject({
      direction: "outgoing",
      related_entity_id: OTHER_B,
      related_entity_name: "Globex",
      related_entity_type: "COMPANY",
      review_status: "approved",
      interview_title: "Globex briefing",
    });
  });

  describe("status filter", () => {
    it('"rejected" returns only rejected rows', async () => {
      const res = await loadRelationshipsForEntity({
        entityId: ENTITY_ID,
        statusFilter: "rejected",
      });
      expect(res.rows.map((r) => r.id)).toEqual(["rel-in-rejected"]);
      expect(res.totalCount).toBe(1);
    });

    it('"approved" returns only approved rows', async () => {
      const res = await loadRelationshipsForEntity({
        entityId: ENTITY_ID,
        statusFilter: "approved",
      });
      expect(res.rows.map((r) => r.id)).toEqual(["rel-out-approved"]);
    });

    it('"pending" returns only pending rows', async () => {
      const res = await loadRelationshipsForEntity({
        entityId: ENTITY_ID,
        statusFilter: "pending",
      });
      expect(res.rows.map((r) => r.id)).toEqual(["rel-in-pending"]);
    });

    it('"active" returns pending + approved (excludes rejected)', async () => {
      const res = await loadRelationshipsForEntity({
        entityId: ENTITY_ID,
        statusFilter: "active",
      });
      const ids = res.rows.map((r) => r.id).sort();
      expect(ids).toEqual(["rel-in-pending", "rel-out-approved"].sort());
      expect(ids).not.toContain("rel-in-rejected");
    });

    it('"all" includes rejected rows', async () => {
      const res = await loadRelationshipsForEntity({
        entityId: ENTITY_ID,
        statusFilter: "all",
      });
      expect(res.rows.find((r) => r.review_status === "rejected")).toBeDefined();
    });
  });

  describe("direction filter", () => {
    it('"incoming" returns only edges where the entity is the target', async () => {
      const res = await loadRelationshipsForEntity({
        entityId: ENTITY_ID,
        directionFilter: "incoming",
      });
      expect(res.rows.every((r) => r.direction === "incoming")).toBe(true);
      expect(res.rows.every((r) => r.target_entity_id === ENTITY_ID)).toBe(true);
      expect(res.rows.map((r) => r.id).sort()).toEqual(
        ["rel-in-pending", "rel-in-rejected"].sort()
      );
    });

    it('"outgoing" returns only edges where the entity is the source', async () => {
      const res = await loadRelationshipsForEntity({
        entityId: ENTITY_ID,
        directionFilter: "outgoing",
      });
      expect(res.rows.every((r) => r.direction === "outgoing")).toBe(true);
      expect(res.rows.every((r) => r.source_entity_id === ENTITY_ID)).toBe(true);
      expect(res.rows.map((r) => r.id)).toEqual(["rel-out-approved"]);
    });

    it("combines direction + status filters", async () => {
      const res = await loadRelationshipsForEntity({
        entityId: ENTITY_ID,
        directionFilter: "incoming",
        statusFilter: "rejected",
      });
      expect(res.rows.map((r) => r.id)).toEqual(["rel-in-rejected"]);
    });
  });

  it("paginates via page + pageSize and exposes totalPages", async () => {
    const page1 = await loadRelationshipsForEntity({
      entityId: ENTITY_ID,
      page: 1,
      pageSize: 2,
    });
    expect(page1.rows).toHaveLength(2);
    expect(page1.totalCount).toBe(3);
    expect(page1.totalPages).toBe(2);

    const page2 = await loadRelationshipsForEntity({
      entityId: ENTITY_ID,
      page: 2,
      pageSize: 2,
    });
    expect(page2.rows).toHaveLength(1);
    expect(page2.totalCount).toBe(3);
    expect(page2.totalPages).toBe(2);

    // No overlap between pages
    const page1Ids = new Set(page1.rows.map((r) => r.id));
    const page2Ids = new Set(page2.rows.map((r) => r.id));
    for (const id of page2Ids) expect(page1Ids.has(id)).toBe(false);
  });
});
