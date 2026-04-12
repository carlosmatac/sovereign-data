/**
 * PR1 Smoke tests — pipeline unification
 *
 * Tests three paths through the shared runIntelPipelineFromCanonicalSource runner:
 * 1. Audio path  (processTranscription → COMPLETED, lastIntelSource = assemblyai_auto)
 * 2. PDF path    (processDocument     → COMPLETED, lastIntelSource = direct_ingest)
 * 3. Reprocess   (reprocessInterviewFromReview → clear_interview_derived_data called, lastIntelSource = human_review)
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
  topics: ["test-topic"],
  entities: [],
  relationships: [],
  risks: [],
  opportunities: [],
};

// ── Mock AssemblyAI transcription result ───────────────────────────────────
const MOCK_TRANSCRIPTION = {
  status: "completed",
  text: "Speaker A said hello. Speaker B replied.",
  audio_duration: 60,
  utterances: [
    { speaker: "A", text: "Speaker A said hello.", start: 0, end: 5000 },
    { speaker: "B", text: "Speaker B replied.", start: 5500, end: 10000 },
  ],
};

// ── Supabase mock builder ──────────────────────────────────────────────────
type UpdateCall = { table: string; status?: string; lastIntelSource?: string; patch: Record<string, unknown> };
type RpcCall = { fn: string; args: Record<string, unknown> };

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

/**
 * Fully-chainable Supabase query builder mock.
 * Any terminal operation (single, maybeSingle, then as promise) resolves to empty/null.
 */
function makeChain(data: unknown = null): AnyChain {
  const resolvedData = data;

  const chain: AnyChain = {
    eq: (_col, _val) => chain,
    in: (_col, _vals) => chain,
    is: (_col, _val) => chain,
    not: (_col, _val) => chain,
    order: (_col, _opts) => chain,
    limit: (_n) => chain,
    select: (_cols) => chain,
    single: () => Promise.resolve({ data: resolvedData, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve) =>
      Promise.resolve({ data: resolvedData, error: null }).then(resolve),
  };
  return chain;
}

function buildSupabaseMock() {
  const updateCalls: UpdateCall[] = [];
  const rpcCalls: RpcCall[] = [];

  const INTERVIEW_ROW = {
    title: "Test Interview",
    project_id: "proj-1",
    interviewee_name: "Jane Doe",
    interviewee_org: "Acme Corp",
    interviewee_entity_id: null,
    interviewee_org_entity_id: null,
    speaker_map: { A: "Speaker A", B: "Speaker B" },
    reviewed_utterances: [
      { speaker: "A", text: "Reviewed text.", start: 0, end: 5 },
    ],
    transcript_review_status: "ready",
    audio_duration: 60,
    projects: { country: "Nigeria" },
  };

  const mock = {
    _updateCalls: updateCalls,
    _rpcCalls: rpcCalls,

    from: (table: string) => {
      return {
        select: (_cols?: string) => {
          // Default chain: awaitable, resolves to { data: [], error: null }
          const listChain = makeChain([]);
          listChain.eq = (...args: unknown[]) => {
            const col = args[0] as string;
            if (table === "interviews") {
              if (col === "id") {
                // .select(...).eq("id", interviewId).single() — return the row
                const rowChain = makeChain(INTERVIEW_ROW);
                rowChain.single = () =>
                  Promise.resolve({ data: INTERVIEW_ROW, error: null });
                return rowChain;
              }
              // .select("id").eq("project_id", ...) — return list of ids
              return makeChain([{ id: "mock-interview-id" }]);
            }
            return makeChain([]);
          };
          return listChain;
        },
        update: (patch: Record<string, unknown>) => {
          updateCalls.push({ table, patch });
          return {
            eq: () => ({
              eq: () => Promise.resolve({ data: null, error: null }),
            }),
          };
        },
        insert: () => Promise.resolve({ data: null, error: null }),
        upsert: () => Promise.resolve({ data: null, error: null }),
      };
    },

    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: null, error: null });
    },
  };

  return mock;
}

// ── Module mocks ──────────────────────────────────────────────────────────

let mockSupabase = buildSupabaseMock();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => mockSupabase),
}));

vi.mock("@/lib/ai/extraction", () => ({
  extractIntelligence: vi.fn(() => Promise.resolve(MOCK_EXTRACTION)),
}));

vi.mock("@/lib/ai/embeddings", () => ({
  generateEmbeddings: vi.fn(() =>
    Promise.resolve([[0.1, 0.2, 0.3]])
  ),
}));

vi.mock("@/lib/ai/assemblyai", () => ({
  getTranscription: vi.fn(() => Promise.resolve(MOCK_TRANSCRIPTION)),
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

// ── Tests ─────────────────────────────────────────────────────────────────

describe("pipeline smoke tests", () => {
  beforeEach(async () => {
    mockSupabase = buildSupabaseMock();
    // Reset the createAdminClient mock to return fresh supabase mock
    const adminModule = await import("@/lib/supabase/admin");
    vi.mocked(adminModule.createAdminClient).mockReturnValue(
      mockSupabase as unknown as ReturnType<typeof adminModule.createAdminClient>
    );
  });

  it("audio path: processTranscription reaches COMPLETED with assemblyai_auto", async () => {
    const { processTranscription } = await import("@/lib/ai/pipeline");
    await processTranscription("interview-audio-1", "assemblyai-tx-1");

    const completedCall = mockSupabase._updateCalls.find(
      (c) => c.patch.status === "COMPLETED"
    );
    expect(completedCall).toBeDefined();
    expect(completedCall?.patch.last_intel_source).toBe("assemblyai_auto");
  });

  it("PDF path: processDocument reaches COMPLETED with direct_ingest", async () => {
    const { processDocument } = await import("@/lib/ai/document-pipeline");
    await processDocument(
      "interview-pdf-1",
      "This is a long PDF text with plenty of content to process. ".repeat(20)
    );

    const completedCall = mockSupabase._updateCalls.find(
      (c) => c.patch.status === "COMPLETED"
    );
    expect(completedCall).toBeDefined();
    expect(completedCall?.patch.last_intel_source).toBe("direct_ingest");
  });

  it("reprocess: clears derived data and uses human_review lastIntelSource", async () => {
    const { reprocessInterviewFromReview } = await import("@/lib/ai/pipeline");

    // Need interview_review_entities for the seeds query
    const origFrom = mockSupabase.from.bind(mockSupabase);
    vi.spyOn(mockSupabase, "from").mockImplementation((table: string) => {
      if (table === "interview_review_entities") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        } as unknown as ReturnType<typeof origFrom>;
      }
      return origFrom(table);
    });

    await reprocessInterviewFromReview("interview-reprocess-1");

    const clearedRpc = mockSupabase._rpcCalls.find(
      (c) => c.fn === "clear_interview_derived_data"
    );
    expect(clearedRpc).toBeDefined();

    const completedCall = mockSupabase._updateCalls.find(
      (c) => c.patch.status === "COMPLETED"
    );
    expect(completedCall).toBeDefined();
    expect(completedCall?.patch.last_intel_source).toBe("human_review");
  });
});
