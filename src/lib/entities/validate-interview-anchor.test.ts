/**
 * ensureUploadAnchorEntity — PR 2.3 regression-fix contract tests.
 *
 * These tests pin down the deterministic upload-anchor channel:
 *
 *   1. When the client provides a valid `entityId` (autocomplete pick),
 *      we validate and reuse it. No matchOrCreateEntity call. The
 *      canonical name returned is the entity's stored `name`.
 *   2. When the client provides only free-text `name`, we call
 *      `matchOrCreateEntity` (deterministic — `create_or_match`) and
 *      return the resulting entity ID + the row's `name`.
 *   3. When the client provides nothing, we return both null.
 *   4. When the client provides an invalid `entityId`, we return
 *      `{ ok: false, reason: 'invalid_entity_id' }` and never fall
 *      through to matchOrCreateEntity (security boundary: the FK was
 *      tampered with, we surface it).
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const matchOrCreateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/entities/match", () => ({
  matchOrCreateEntity: matchOrCreateMock,
}));

import { ensureUploadAnchorEntity } from "./validate-interview-anchor";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const PERSON_ID = "22222222-2222-2222-2222-222222222222";
const ORG_ID = "33333333-3333-3333-3333-333333333333";

interface MaybeSingleConfig {
  data: unknown;
  error: unknown;
}

interface BuildOpts {
  /** Per-table response from `.maybeSingle()` (FIFO if array; otherwise reused). */
  maybeSingle?: Record<string, MaybeSingleConfig | MaybeSingleConfig[]>;
}

function buildAdmin(opts: BuildOpts = {}): SupabaseClient<Database> {
  const queues = new Map<string, MaybeSingleConfig[]>();
  for (const [table, cfg] of Object.entries(opts.maybeSingle ?? {})) {
    queues.set(table, Array.isArray(cfg) ? [...cfg] : [cfg]);
  }

  const makeChain = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      maybeSingle: async () => {
        const queue = queues.get(table);
        if (!queue || queue.length === 0) {
          return { data: null, error: null };
        }
        const next = queue.length > 1 ? queue.shift()! : queue[0];
        return { data: next.data ?? null, error: next.error ?? null };
      },
    };
    return chain;
  };

  return {
    from: (table: string) => makeChain(table),
  } as unknown as SupabaseClient<Database>;
}

describe("ensureUploadAnchorEntity", () => {
  it("returns null entity + null name when no entityId or name is provided", async () => {
    matchOrCreateMock.mockReset();
    const admin = buildAdmin();

    const res = await ensureUploadAnchorEntity(admin, {
      entityId: null,
      name: null,
      projectId: PROJECT_ID,
      role: "person",
    });

    expect(res).toEqual({ ok: true, entityId: null, name: null });
    expect(matchOrCreateMock).not.toHaveBeenCalled();
  });

  it("returns null entity + null name when name is whitespace-only", async () => {
    matchOrCreateMock.mockReset();
    const admin = buildAdmin();

    const res = await ensureUploadAnchorEntity(admin, {
      entityId: null,
      name: "   ",
      projectId: PROJECT_ID,
      role: "person",
    });

    expect(res).toEqual({ ok: true, entityId: null, name: null });
    expect(matchOrCreateMock).not.toHaveBeenCalled();
  });

  it("validates and reuses an explicit PERSON entityId without calling matchOrCreate", async () => {
    matchOrCreateMock.mockReset();
    const admin = buildAdmin({
      maybeSingle: {
        entities: {
          data: {
            id: PERSON_ID,
            name: "Francisco Pinzon",
            type: "PERSON",
            project_id: PROJECT_ID,
            canonical_entity_id: null,
          },
          error: null,
        },
      },
    });

    const res = await ensureUploadAnchorEntity(admin, {
      entityId: PERSON_ID,
      name: "francisco pinzon",
      projectId: PROJECT_ID,
      role: "person",
    });

    expect(res).toEqual({
      ok: true,
      entityId: PERSON_ID,
      name: "Francisco Pinzon",
    });
    expect(matchOrCreateMock).not.toHaveBeenCalled();
  });

  it("validates and reuses an explicit ORG-like entityId", async () => {
    matchOrCreateMock.mockReset();
    const admin = buildAdmin({
      maybeSingle: {
        entities: {
          data: {
            id: ORG_ID,
            name: "DP World Angola",
            type: "COMPANY",
            project_id: null,
            canonical_entity_id: null,
          },
          error: null,
        },
      },
    });

    const res = await ensureUploadAnchorEntity(admin, {
      entityId: ORG_ID,
      name: "DP World",
      projectId: PROJECT_ID,
      role: "organization",
    });

    expect(res).toEqual({
      ok: true,
      entityId: ORG_ID,
      name: "DP World Angola",
    });
    expect(matchOrCreateMock).not.toHaveBeenCalled();
  });

  it("rejects a tampered/invalid entityId with ok=false (no fallback to matchOrCreate)", async () => {
    matchOrCreateMock.mockReset();
    const admin = buildAdmin({
      maybeSingle: {
        // Entity does not exist
        entities: { data: null, error: null },
      },
    });

    const res = await ensureUploadAnchorEntity(admin, {
      entityId: "00000000-0000-0000-0000-000000000000",
      name: "Some Name",
      projectId: PROJECT_ID,
      role: "person",
    });

    expect(res).toEqual({ ok: false, reason: "invalid_entity_id" });
    expect(matchOrCreateMock).not.toHaveBeenCalled();
  });

  it("rejects a wrong-type entityId (e.g. ORG given for person role)", async () => {
    matchOrCreateMock.mockReset();
    const admin = buildAdmin({
      maybeSingle: {
        entities: {
          data: {
            id: ORG_ID,
            name: "DP World Angola",
            type: "COMPANY",
            project_id: null,
            canonical_entity_id: null,
          },
          error: null,
        },
      },
    });

    const res = await ensureUploadAnchorEntity(admin, {
      entityId: ORG_ID,
      name: null,
      projectId: PROJECT_ID,
      role: "person",
    });

    expect(res).toEqual({ ok: false, reason: "invalid_entity_id" });
    expect(matchOrCreateMock).not.toHaveBeenCalled();
  });

  it("calls matchOrCreateEntity in create_or_match mode for a free-text PERSON anchor", async () => {
    matchOrCreateMock.mockReset();
    matchOrCreateMock.mockResolvedValueOnce({
      entityId: PERSON_ID,
      needsReview: false,
    });
    const admin = buildAdmin({
      maybeSingle: {
        entities: {
          data: { name: "Francisco Pinzon" },
          error: null,
        },
      },
    });

    const res = await ensureUploadAnchorEntity(admin, {
      entityId: null,
      name: "Francisco Pinzon",
      projectId: PROJECT_ID,
      role: "person",
    });

    expect(matchOrCreateMock).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      nameRaw: "Francisco Pinzon",
      type: "PERSON",
      supabaseClient: admin,
      mode: "create_or_match",
    });
    expect(res).toEqual({
      ok: true,
      entityId: PERSON_ID,
      name: "Francisco Pinzon",
    });
  });

  it("calls matchOrCreateEntity with type=ORGANIZATION for a free-text org anchor", async () => {
    matchOrCreateMock.mockReset();
    matchOrCreateMock.mockResolvedValueOnce({
      entityId: ORG_ID,
      needsReview: false,
    });
    const admin = buildAdmin({
      maybeSingle: {
        entities: {
          data: { name: "Cenored" },
          error: null,
        },
      },
    });

    const res = await ensureUploadAnchorEntity(admin, {
      entityId: null,
      name: "CENORED",
      projectId: PROJECT_ID,
      role: "organization",
    });

    expect(matchOrCreateMock).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      nameRaw: "CENORED",
      type: "ORGANIZATION",
      supabaseClient: admin,
      mode: "create_or_match",
    });
    expect(res).toEqual({
      ok: true,
      entityId: ORG_ID,
      name: "Cenored",
    });
  });

  it("falls back to user-typed name if the entity row read-back fails after matchOrCreate", async () => {
    matchOrCreateMock.mockReset();
    matchOrCreateMock.mockResolvedValueOnce({
      entityId: PERSON_ID,
      needsReview: false,
    });
    const admin = buildAdmin({
      maybeSingle: {
        entities: { data: null, error: null },
      },
    });

    const res = await ensureUploadAnchorEntity(admin, {
      entityId: null,
      name: "  Francisco Pinzon  ",
      projectId: PROJECT_ID,
      role: "person",
    });

    expect(res).toEqual({
      ok: true,
      entityId: PERSON_ID,
      name: "Francisco Pinzon",
    });
  });
});
