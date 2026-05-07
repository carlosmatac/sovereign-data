/**
 * matchOrCreateEntity — Phase 2.3 / PR 2.3 / Q1 contract tests.
 *
 * These guard the precision-first behaviour added for orphan-anchor
 * reduction:
 *   - In `match_only` mode, when none of the four exact paths hit,
 *     the function returns `{ entityId: null, needsReview: false }`
 *     WITHOUT calling fuzzy search and WITHOUT creating a new entity.
 *   - In `match_only` mode, an exact alias hit still resolves and
 *     registers the alias for the project.
 *   - The default (`create_or_match`) mode still creates a new project
 *     entity when no match is found.
 *
 * The Supabase client is mocked at the table-builder level. `match.ts`
 * uses these chains:
 *   - .from("entities").select(...).eq().eq().is(...).limit(1).maybeSingle()
 *   - .from("entity_aliases").select(...).eq().is(...).limit(1).maybeSingle()
 *   - .from("entity_aliases").insert(...) (ensureAlias)
 *   - .from("entities").insert(...).select("id").single() (createProjectCanonicalEntity)
 *
 * The mock keeps the API surface narrow: each chain is configurable per
 * call site. We don't reach the fuzzy paths in match_only tests, so we
 * don't need to mock fuzzy queries.
 */

import { describe, expect, it } from "vitest";
import { matchOrCreateEntity } from "./match";

type MaybeSingleResult = { data: unknown; error: unknown };

interface MockChain {
  select: (cols: string) => MockChain;
  eq: (col: string, val: unknown) => MockChain;
  is: (col: string, val: unknown) => MockChain;
  in: (col: string, vals: unknown[]) => MockChain;
  order: (col: string, opts?: unknown) => MockChain;
  limit: (n: number) => MockChain;
  not: (col: string, val: unknown) => MockChain;
  insert: (rows: unknown) => MockChain;
  update: (patch: unknown) => MockChain;
  maybeSingle: <T = unknown>() => Promise<{ data: T | null; error: null }>;
  single: <T = unknown>() => Promise<{ data: T | null; error: null }>;
  returns: <T>() => Promise<{ data: T | null; error: null }>;
  then: (resolve: (v: { data: unknown; error: null }) => unknown) => Promise<unknown>;
}

interface BuildOpts {
  /** Per-table return values for `.maybeSingle()`. */
  maybeSingle?: Partial<Record<string, MaybeSingleResult>>;
  /** Per-table return value for `.returns<...>()` (used by fuzzy paths). */
  returns?: Partial<Record<string, MaybeSingleResult>>;
  /** Per-table return value for `.insert(...).select(...).single()`. */
  insertSingle?: Partial<Record<string, MaybeSingleResult>>;
}

interface MockedClient {
  client: Parameters<typeof matchOrCreateEntity>[0]["supabaseClient"];
  inserts: Array<{ table: string; rows: unknown }>;
}

function buildMock(opts: BuildOpts = {}): MockedClient {
  const inserts: Array<{ table: string; rows: unknown }> = [];

  const makeChain = (table: string): MockChain => {
    const chain: MockChain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      not: () => chain,
      insert: (rows) => {
        inserts.push({ table, rows });
        return chain;
      },
      update: () => chain,
      maybeSingle: async () => {
        const cfg = opts.maybeSingle?.[table];
        return {
          data: (cfg?.data ?? null) as never,
          error: (cfg?.error ?? null) as null,
        };
      },
      single: async () => {
        const cfg = opts.insertSingle?.[table];
        return {
          data: (cfg?.data ?? null) as never,
          error: (cfg?.error ?? null) as null,
        };
      },
      returns: async () => {
        const cfg = opts.returns?.[table];
        return {
          data: (cfg?.data ?? []) as never,
          error: (cfg?.error ?? null) as null,
        };
      },
      then: (resolve) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    };
    return chain;
  };

  const client = {
    from: (table: string) => makeChain(table),
  };

  return {
    client: client as unknown as Parameters<typeof matchOrCreateEntity>[0]["supabaseClient"],
    inserts,
  };
}

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const PERSON_ID = "22222222-2222-2222-2222-222222222222";
const ALIAS_ENTITY_ID = "33333333-3333-3333-3333-333333333333";

describe("matchOrCreateEntity — match_only (Q1 override)", () => {
  it("returns null when no exact entity or alias match exists, without fuzzy/create", async () => {
    // Default mock: every maybeSingle returns null (no exact match anywhere).
    // returns<...>() also defaults to []. `match_only` should short-circuit
    // BEFORE the fuzzy queries are issued — but even if they ran, the mock
    // returns no candidates.
    const { client, inserts } = buildMock();

    const result = await matchOrCreateEntity({
      projectId: PROJECT_ID,
      nameRaw: "Mr. Raji",
      type: "PERSON",
      supabaseClient: client,
      mode: "match_only",
    });

    expect(result).toEqual({ entityId: null, needsReview: false });
    // No new entity was created.
    expect(inserts.find((i) => i.table === "entities")).toBeUndefined();
  });

  it("returns the canonical entity id when an exact alias match exists, even in match_only mode", async () => {
    const { client } = buildMock({
      maybeSingle: {
        // Project exact entity miss …
        entities: { data: null, error: null },
        // … but the aliases table returns a hit on the first call.
        entity_aliases: {
          data: {
            entity_id: ALIAS_ENTITY_ID,
            entities: {
              id: ALIAS_ENTITY_ID,
              canonical_entity_id: null,
              project_id: PROJECT_ID,
              type: "PERSON",
              normalized_name: "raji bashir",
            },
          },
          error: null,
        },
      },
    });

    const result = await matchOrCreateEntity({
      projectId: PROJECT_ID,
      nameRaw: "Mr. Raji",
      type: "PERSON",
      supabaseClient: client,
      mode: "match_only",
    });

    expect(result.entityId).toBe(ALIAS_ENTITY_ID);
    expect(result.needsReview).toBe(false);
  });

  it("returns the canonical entity id when an exact entity match exists, even in match_only mode", async () => {
    const { client } = buildMock({
      maybeSingle: {
        entities: {
          data: {
            id: PERSON_ID,
            canonical_entity_id: null,
            project_id: PROJECT_ID,
            type: "PERSON",
            normalized_name: "raji bashir",
          },
          error: null,
        },
      },
    });

    const result = await matchOrCreateEntity({
      projectId: PROJECT_ID,
      nameRaw: "Raji Bashir",
      type: "PERSON",
      supabaseClient: client,
      mode: "match_only",
    });

    expect(result.entityId).toBe(PERSON_ID);
    expect(result.needsReview).toBe(false);
  });
});

describe("matchOrCreateEntity — default mode (create_or_match) still creates", () => {
  it("creates a new project entity when no match is found and no fuzzy candidate exists", async () => {
    const { client, inserts } = buildMock({
      // No exact matches anywhere; no fuzzy candidates either.
      insertSingle: {
        entities: {
          data: { id: "new-entity-id" },
          error: null,
        },
      },
    });

    const result = await matchOrCreateEntity({
      projectId: PROJECT_ID,
      nameRaw: "Brand New Entity",
      type: "COMPANY",
      supabaseClient: client,
      // No mode → defaults to create_or_match.
    });

    expect(result.entityId).toBe("new-entity-id");
    expect(result.needsReview).toBe(false);
    expect(inserts.some((i) => i.table === "entities")).toBe(true);
  });
});
