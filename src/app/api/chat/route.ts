import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbeddings } from "@/lib/ai/embeddings";
import { streamText, type UIMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { AI_CONFIG } from "@/lib/constants";

interface RagChunk {
  chunk_id: string;
  interview_id: string;
  content: string;
  speaker: string | null;
  start_time: number | null;
  end_time: number | null;
  metadata: Record<string, unknown>;
  similarity: number;
}

/**
 * POST /api/chat
 *
 * Conversational RAG endpoint. Streams responses using Vercel AI SDK v6.
 *
 * Flow:
 * 1. Take the latest user message
 * 2. Generate embedding for the query
 * 3. Run hybrid_search to find relevant chunks
 * 4. Build context from top chunks with citation markers
 * 5. Stream a response grounded in the retrieved context
 */
export async function POST(request: NextRequest) {
  // Verify authentication
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json();
  const messages: UIMessage[] = body.messages ?? [];

  if (messages.length === 0) {
    return new Response("No messages provided", { status: 400 });
  }

  // Extract the latest user message text for RAG retrieval
  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === "user");
  if (!lastUserMessage) {
    return new Response("No user message found", { status: 400 });
  }

  const queryText = lastUserMessage.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ");

  if (!queryText.trim()) {
    return new Response("Empty query", { status: 400 });
  }

  // ── RAG Retrieval ──────────────────────────────────────────────
  const admin = createAdminClient();

  const [queryEmbedding] = await generateEmbeddings([queryText]);

  const { data: chunks } = await admin.rpc("hybrid_search", {
    query_embedding: JSON.stringify(queryEmbedding),
    filter_project_ids: null,
    filter_country: null,
    filter_topics: null,
    match_threshold: AI_CONFIG.similarityThreshold,
    match_count: 8,
  });

  const ragChunks = (chunks ?? []) as RagChunk[];

  // Build context block with citation markers [1], [2], etc.
  const contextBlock = ragChunks
    .map((chunk, i) => {
      const speaker = chunk.speaker ? `[${chunk.speaker}]` : "";
      const time = chunk.start_time
        ? `[${formatTime(chunk.start_time)}]`
        : "";
      return `[${i + 1}] ${speaker} ${time}\n${chunk.content}`;
    })
    .join("\n\n");

  // Build citation data to inject into the response
  const citationsSummary = ragChunks
    .map((chunk, i) => {
      const speaker = chunk.speaker ?? "Unknown";
      const time = chunk.start_time ? formatTime(chunk.start_time) : "N/A";
      const interviewUrl = `/interviews/${chunk.interview_id}`;
      return `[${i + 1}] Speaker: ${speaker}, Time: ${time}, Relevance: ${Math.round(chunk.similarity * 100)}% — [View Interview](${interviewUrl})`;
    })
    .join("\n");

  const systemPrompt = `You are Sovereign Data AI, an expert intelligence analyst for frontier markets (Africa, Latin America, Asia). You answer questions based ONLY on interview transcripts provided as context.

RULES:
- Ground every claim in the provided context. Use citation markers like [1], [2] to reference sources.
- If the context doesn't contain enough information to answer, say so explicitly — do NOT hallucinate.
- Be concise but thorough. Use bullet points for structured information.
- When quoting interviewees, preserve their exact words and attribute to the speaker.
- Highlight risks, opportunities, and actionable intelligence when relevant.
- At the END of your response, add a "Sources" section listing the citations you used.

${
  contextBlock
    ? `RETRIEVED CONTEXT (from interview transcripts):\n\n${contextBlock}\n\nSOURCE REFERENCES:\n${citationsSummary}`
    : "NO RELEVANT CONTEXT FOUND. Tell the user you couldn't find relevant information in the interview database for their query."
}`;

  // Convert UIMessages to simple format for streamText
  const chatMessages = messages.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" "),
  }));

  // ── Stream Response using AI SDK v6 ────────────────────────────
  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: systemPrompt,
    messages: chatMessages,
  });

  return result.toUIMessageStreamResponse();
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
