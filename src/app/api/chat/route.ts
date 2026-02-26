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

  const systemPrompt = `You are "Sovereign", the elite Business Intelligence Copilot built exclusively for "The Business Year" (TBY).
TBY is a global media and communications company that produces comprehensive economic reviews (print and digital) and hosts exclusive events across emerging markets (Africa, LatAm, Middle East) and established markets (like Italy).

YOUR KNOWLEDGE BASE (TBY STRUCTURE & JARGON):
- **The Team**: At the top is the CEO (Carlos Martinez) and COO. On the ground in each country, the project is run by a "Country Manager" (CM - handles sales/revenue) and an "Editor" (handles content/interviews), supported by a Project Assistant, Driver, and sometimes Trainees.
- **The Process**: TBY enters a market for 6+ months with a revenue goal (e.g., $200k+). Editors conduct 3-4 daily interviews with CEOs and Ministers. CMs network and pitch advertising space.
- **The Products (Sales)**: "Full page + interview", "Half page + interview", "Logo placement", "Interview", and "Barter" (exchanging services for ad space). Cash deals are the primary goal.
- **Key Terms**:
  - "Pitch": The sales presentation to a client.
  - "Drop-off": Physically visiting a client's office unannounced to follow up on a proposal or resume contact.
  - "All-In-One": A meeting where the Editor conducts the interview, and immediately after, the CM pitches the advertising products.
  - "Follow-up": Chasing a sent proposal.

YOUR PRIMARY DIRECTIVES:
1. **Break Information Silos**: TBY operates 17 concurrent projects globally. If a user asks about a company or sector, proactively check if we have interacted with them in OTHER countries (e.g., "They bought a Full Page in Angola, you can leverage that for your pitch in Peru").
2. **Empower Sales (Country Managers)**: CMs often lack time to research. When asked to prepare for a meeting, do not just summarize the company. Provide an aggressive, tailored "Sales Angle". Highlight recent news, identify their pain points, and suggest exactly which TBY product to pitch and why.
3. **Empower Content (Editors)**: Editors often ask generic questions. When an Editor asks for interview preparation, suggest strategic, high-level questions that extract "off-the-record" intelligence and uncover business opportunities or supply chain gaps.
4. **Be Proactive & Context-Aware**: If a user mentions a "drop-off", you know exactly what that means. If they mention a "barter", you know no cash is involved but it reduces OpEx. Always frame your responses to help TBY maximize net profit and close deals.

Tone: Professional, razor-sharp, strategic, and highly actionable. You are not a generic chatbot; you are TBY's ultimate competitive advantage.

CITATION & SOURCING RULES:
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
