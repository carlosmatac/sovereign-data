/**
 * Phase 3b — Reviewed-reprocess transactional swap tests
 *
 * Tests that `reprocessInterviewFromReview`:
 * 1. Calls `replace_source_derived_data` (not `clear_source_derived_data`)
 * 2. The payload carries all three required arrays (chunks, mentions, relationships)
 * 3. Chunk payload includes pre-assigned UUIDs and embedding data
 * 4. When `replace_source_derived_data` throws, status is set to FAILED and
 *    `transcript_review_status` is reset to `ready` (original data preserved path)
 * 5. The first-ingest path still uses direct batch inserts (not the atomic RPC)
 *
 * All external I/O is mocked (OpenAI, Supabase, AssemblyAI).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock extraction result ──────────────────────────────────────────────────
const MOCK_EXTRACTION = {
  summary: "Test summary",
  sentiment: {
    overall: "positive" as const,
    score: 0.7,
    highlights: [{ text: "Great point", sentiment: "positive" as const, timestamp: null }],
  },
  topics: ["policy"],
  entities: [{ raw_name: "Jane Doe", canonical_name: "Jane Doe", type: "PERSON" as const }],
  relationships: [],
  risks: [],
  opportunities: [],
  source_associations: [],
};

const MOCK_EMBEDDINGS = [[0.1, 0.2, 0.3, 0.4, 0.5]];

// ── Supabase mock ───────────────────────────────────────────────────────────
type UpdateCall = { table: string; patch: Record<string, unknown> };
type RpcCall = { fn: string; args: Record<string, unknown> };
type InsertCall = { table: string; rows: unknown };

type AnyChain = {
  eq: (...args: unknown[]) => AnyChain;
  in: (...args: unknown[]) => AnyChain;
  is: (...args: unknown[]) => AnyChain;
  not: (...args: unknown[]) => AnyChain;
  order: (...args: unknown[]) => AnyChain;
  limit: (...args: unknown[]) => AnyChain;
  select: (...args: unknown[]) => AnyChain;
  single: () => Promise<{ data: unknown; error: null }>;
  maybeSingle: () => Promise<{ data: null; error: null }>;
  then: (resolve: (v: { data: unknown; error: null }) => unknown) => Promise<unknown>;
};

function makeChain(data: unknown = null): AnyChain {
  const chain: AnyChain = {
    eq: () => chain,
    in: () => chain,
    is: () => chain,
    not: () => chain,
    order: () => chain,
    limit: () => chain,
    select: () => chain,
    single: () => Promise.resolve({ data, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve) => Promise.resolve({ data, error: null }).then(resolve),
  };
  return chain;
}

const INTERVIEW_ROW = {
  title: "Reviewed Interview",
  project_id: "proj-1",
  tenant_id: "tenant-1",
  interviewee_name: "Jane Doe",
  interviewee_org: "Acme Corp",
  interviewee_entity_id: null,
  interviewee_org_entity_id: null,
  speaker_map: { A: "Speaker A" },
  reviewed_utterances: [
    { speaker: "A", text: "Reviewed text about energy policy.", start: 0, end: 5 },
  ],
  transcript_review_status: "ready",
  audio_duration: 60,
  projects: { country: "Nigeria" },
};

function buildMock(rpcBehavior?: (fn: string) => { data: null; error: null } | { data: null; error: Error }) {
  const updateCalls: UpdateCall[] = [];
  const rpcCalls: RpcCall[] = [];
  const insertCalls: InsertCall[] = [];

  const mock = {
    _updateCalls: updateCalls,
    _rpcCalls: rpcCalls,
    _insertCalls: insertCalls,

    from: (table: string) => ({
      select: (_cols?: string) => {
        const chain = makeChain([]);
        chain.eq = (...args: unknown[]) => {
          if (table === "interviews" && args[0] === "id") {
            return makeChain(INTERVIEW_ROW);
          }
          if (table === "interview_review_entities") {
            return makeChain([]);
          }
          if (table === "entity_relationships") {
            // rejected rows query — return empty
            return makeChain([]);
          }
          return makeChain([]);
        };
        return chain;
      },
      update: (patch: Record<string, unknown>) => {
        updateCalls.push({ table, patch });
        return {
          eq: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
        };
      },
      insert: (rows: unknown) => {
        insertCalls.push({ table, rows });
        return Promise.resolve({ data: null, error: null });
      },
      upsert: (rows: unknown) => {
        insertCalls.push({ table, rows });
        return Promise.resolve({ data: null, error: null });
      },
    }),

    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (rpcBehavior) {
        return Promise.resolve(rpcBehavior(fn));
      }
      return Promise.resolve({ data: null, error: null });
    },
  };

  return mock;
}

// ── Module mocks ──────────────────────────────────────────────────────────

let mockSupabase = buildMock();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => mockSupabase),
}));

vi.mock("@/lib/ai/extraction", () => ({
  extractIntelligence: vi.fn(() => Promise.resolve(MOCK_EXTRACTION)),
}));

vi.mock("@/lib/ai/embeddings", () => ({
  generateEmbeddings: vi.fn(() => Promise.resolve(MOCK_EMBEDDINGS)),
}));

vi.mock("@/lib/ai/assemblyai", () => ({
  getTranscription: vi.fn(),
}));

vi.mock("@/lib/entities/resolve", () => ({
  resolveExtractedEntities: vi.fn(() => Promise.resolve([])),
}));

vi.mock("@/lib/entities/ground-mentions", () => ({
  groundEntityMentions: vi.fn(() => Promise.resolve(new Map())),
}));

vi.mock("@/lib/ai/content-generation", () => ({
  generateContentSnippets: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/ai/retry", () => ({
  withRetry: vi.fn((fn: () => unknown) => fn()),
}));

vi.mock("@/lib/entities/source-entities-writer", () => ({
  writeAnchorSourceEntities: vi.fn(() => Promise.resolve(0)),
  writeExtractionSourceEntities: vi.fn(() =>
    Promise.resolve({ written: 0, attempted: 0, droppedLowConfidence: 0, droppedUnresolved: 0 })
  ),
}));

// ── Tests ─────────────────────────────────────────────────────────────────

describe("Phase 3b — reprocess transactional swap", () => {
  beforeEach(async () => {
    mockSupabase = buildMock();
    const adminModule = await import("@/lib/supabase/admin");
    vi.mocked(adminModule.createAdminClient).mockReturnValue(
      mockSupabase as unknown as ReturnType<typeof adminModule.createAdminClient>
    );
  });

  it("calls replace_source_derived_data (not clear_source_derived_data) on reprocess", async () => {
    const { reprocessInterviewFromReview } = await import("@/lib/ai/pipeline");
    await reprocessInterviewFromReview("source-reprocess-1");

    const replaceRpc = mockSupabase._rpcCalls.find(
      (c) => c.fn === "replace_source_derived_data"
    );
    expect(replaceRpc).toBeDefined();

    const clearRpc = mockSupabase._rpcCalls.find(
      (c) => c.fn === "clear_source_derived_data"
    );
    expect(clearRpc).toBeUndefined();
  });

  it("replace_source_derived_data payload has all required fields", async () => {
    const { reprocessInterviewFromReview } = await import("@/lib/ai/pipeline");
    await reprocessInterviewFromReview("source-reprocess-2");

    const replaceRpc = mockSupabase._rpcCalls.find(
      (c) => c.fn === "replace_source_derived_data"
    );
    expect(replaceRpc).toBeDefined();
    expect(replaceRpc?.args.p_source_id).toBe("source-reprocess-2");

    // All three params must be present as arrays (not JSON strings)
    const chunks = replaceRpc?.args.p_chunks;
    const mentions = replaceRpc?.args.p_mentions;
    const relationships = replaceRpc?.args.p_relationships;

    expect(Array.isArray(chunks)).toBe(true);
    expect(Array.isArray(mentions)).toBe(true);
    expect(Array.isArray(relationships)).toBe(true);
  });

  it("chunk payload carries pre-assigned UUID and serialised embedding", async () => {
    const { reprocessInterviewFromReview } = await import("@/lib/ai/pipeline");
    await reprocessInterviewFromReview("source-reprocess-3");

    const replaceRpc = mockSupabase._rpcCalls.find(
      (c) => c.fn === "replace_source_derived_data"
    );

    const chunks = replaceRpc?.args.p_chunks as Array<Record<string, unknown>>;

    // Must have at least one chunk from the reviewed utterances
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);

    const chunk = chunks[0];
    // Pre-assigned UUID — must be a valid UUID string
    expect(typeof chunk.id).toBe("string");
    expect(chunk.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );

    // Embedding is a JSON.stringify'd float array (string inside the array element)
    expect(typeof chunk.embedding).toBe("string");
    const embedding = JSON.parse(chunk.embedding as string);
    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding[0]).toBeCloseTo(0.1);
  });

  it("sets status FAILED (not COMPLETED) when replace_source_derived_data throws", async () => {
    const rpcBehavior = (fn: string) => {
      if (fn === "replace_source_derived_data") {
        return { data: null, error: new Error("DB transaction failed") };
      }
      return { data: null, error: null };
    };

    mockSupabase = buildMock(rpcBehavior as Parameters<typeof buildMock>[0]);
    const adminModule = await import("@/lib/supabase/admin");
    vi.mocked(adminModule.createAdminClient).mockReturnValue(
      mockSupabase as unknown as ReturnType<typeof adminModule.createAdminClient>
    );

    const { reprocessInterviewFromReview } = await import("@/lib/ai/pipeline");
    await reprocessInterviewFromReview("source-fail-1");

    const failedCall = mockSupabase._updateCalls.find(
      (c) => c.table === "sources" && c.patch.status === "FAILED"
    );
    expect(failedCall).toBeDefined();
    // transcript_review_status must be reset to 'ready' so the user can retry
    expect(failedCall?.patch.transcript_review_status).toBe("ready");

    // COMPLETED must never be set
    const completedCall = mockSupabase._updateCalls.find(
      (c) => c.patch.status === "COMPLETED"
    );
    expect(completedCall).toBeUndefined();
  });

  it("first-ingest path does NOT call replace_source_derived_data", async () => {
    const { processTextInterview } = await import("@/lib/ai/document-pipeline");
    const longText =
      "Q: What is the policy?\nA: Energy reform is key.\n\n".repeat(20);
    await processTextInterview("source-first-1", longText, "qa_structured");

    const replaceRpc = mockSupabase._rpcCalls.find(
      (c) => c.fn === "replace_source_derived_data"
    );
    expect(replaceRpc).toBeUndefined();
  });
});
