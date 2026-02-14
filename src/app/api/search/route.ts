import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbeddings } from "@/lib/ai/embeddings";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { AI_CONFIG } from "@/lib/constants";

// Schema for intent classification (pre-filter extraction)
// NOTE: OpenAI structured outputs require ALL fields to be required (no optional/default).
const IntentSchema = z.object({
  rewritten_query: z
    .string()
    .describe("The query rewritten for optimal semantic search"),
  filters: z.object({
    country: z
      .string()
      .nullable()
      .describe("Country filter if mentioned, null otherwise"),
    topics: z
      .array(z.string())
      .describe("Topic tags to filter by, empty array if none"),
    project_ids: z
      .array(z.string())
      .describe("Specific project IDs if referenced, empty array if none"),
  }),
});

/**
 * POST /api/search
 *
 * Hybrid RAG Search:
 * 1. Intent classification (extract metadata filters)
 * 2. SQL pre-filter (WHERE clause)
 * 3. Vector similarity search (pgvector HNSW)
 * 4. Return ranked chunks with citations
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { query, project_id } = (await request.json()) as {
    query: string;
    project_id?: string;
  };

  if (!query?.trim()) {
    return NextResponse.json(
      { error: "Query is required" },
      { status: 400 }
    );
  }

  try {
    // ── Step 1: Intent Classification ────────────────────────────
    const { object: intent } = await generateObject({
      model: openai(AI_CONFIG.extractionModel),
      schema: IntentSchema,
      prompt: `Analyze this intelligence search query and extract metadata filters for database pre-filtering.
      
Query: "${query}"

Extract:
- Country name if a specific country is mentioned (use full name, e.g., "Nigeria" not "NG")
- Topic tags that match common categories: energy, infrastructure, mining, agriculture, finance, regulation, corruption, elections, trade, defense, technology, healthcare
- Rewrite the query for optimal semantic similarity search (remove filter words, focus on the concept)`,
    });

    // ── Step 2: Generate query embedding ─────────────────────────
    const [queryEmbedding] = await generateEmbeddings([
      intent.rewritten_query,
    ]);

    // ── Step 3: Hybrid search via Supabase RPC ───────────────────
    // Use admin client for RPC call — auth.uid() is NULL in PostgREST context
    // (user identity already verified above via getUser).
    const admin = createAdminClient();
    const filterProjectIds = project_id
      ? [project_id]
      : intent.filters.project_ids.length > 0
        ? intent.filters.project_ids
        : null;

    const { data: results, error } = await admin.rpc("hybrid_search", {
      query_embedding: JSON.stringify(queryEmbedding),
      filter_project_ids: filterProjectIds,
      filter_country: intent.filters.country,
      filter_topics:
        intent.filters.topics.length > 0 ? intent.filters.topics : null,
      match_threshold: AI_CONFIG.similarityThreshold,
      match_count: AI_CONFIG.maxSearchResults,
    });

    if (error) {
      console.error("Hybrid search failed:", error);
      return NextResponse.json(
        { error: "Search failed", details: error.message },
        { status: 500 }
      );
    }

    console.log(
      `[search] query="${intent.rewritten_query}" country=${intent.filters.country} → ${results?.length ?? 0} results`
    );

    return NextResponse.json({
      query: intent.rewritten_query,
      filters: intent.filters,
      results: results ?? [],
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}
