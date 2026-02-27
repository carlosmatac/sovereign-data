import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbeddings } from "@/lib/ai/embeddings";
import { streamText, tool, stepCountIs, type UIMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
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

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  results: TavilyResult[];
}

async function tavilySearch(
  query: string,
  topic: "general" | "news"
): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return [
      {
        title: "Web search unavailable",
        url: "",
        content: "TAVILY_API_KEY is not configured. Web search is disabled.",
        score: 0,
      },
    ];
  }

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      topic,
      search_depth: "advanced",
      max_results: 5,
      include_answer: false,
    }),
  });

  if (!res.ok) {
    return [
      {
        title: "Search failed",
        url: "",
        content: `Web search returned HTTP ${res.status}. Respond using only internal context.`,
        score: 0,
      },
    ];
  }

  const data = (await res.json()) as TavilyResponse;
  return data.results ?? [];
}

/**
 * POST /api/chat
 *
 * Agentic RAG endpoint. Streams responses using Vercel AI SDK v6.
 *
 * Flow:
 * 1. Take the latest user message
 * 2. Generate embedding for the query
 * 3. Run hybrid_search to find relevant chunks (pre-injected context)
 * 4. Build context from top chunks with citation markers
 * 5. Stream a response with optional web search tool calling (maxSteps: 3)
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

CRITICAL REASONING DIRECTIVE — "SECOND-ORDER THINKING" FOR LEAD GENERATION:
When a user asks for "new leads", "new companies", "opportunities", "who to target", or any variant of prospecting in a market, you are FORBIDDEN from recommending the companies that are the primary subjects of our existing interviews. If we already interviewed them, they are in our pipeline — suggesting them is useless.

Instead, treat every retrieved transcript as an intelligence hub and execute this three-step cascade:

**Step 1 — THE ORBIT (Entity Extraction)**:
Scan the transcripts for third-party entities MENTIONED by the interviewee — competitors they name, suppliers they depend on, B2B clients they serve, regulators blocking their projects, partners they are courting. These explicitly mentioned third parties are your primary lead recommendations. Always cite the exact transcript passage where the entity was mentioned.

**Step 2 — THE MARKET GAP (Sector Deduction)**:
If interviewees describe bottlenecks, unmet needs, or emerging trends (e.g., "we lack cold-chain logistics", "cybersecurity is our biggest risk", "the government just approved a $500M renewable energy fund"), deduce the target sectors that would service those gaps. Frame each gap as a sales opportunity with the specific TBY product to pitch.

**Step 3 — IDEAL TARGET PROFILE (Anti-Hallucination Fallback)**:
If the transcripts do not explicitly name third-party companies and no clear sector gap emerges, DO NOT invent or hallucinate company names. Instead, output a structured "Ideal Target Profile" that the CM can use for their own research:
  - **Profile**: Description of the ideal target (size, sector, geography).
  - **Why they'd buy**: The pain point from our interviews that makes TBY relevant to them.
  - **Recommended TBY product**: Which product to pitch and the exact angle (e.g., "Pitch a Half-Page by telling them that [Interviewee Company] is actively seeking their services — we have the quote to prove it").

Always follow the steps in order. If Step 1 yields results, still check Step 2 for additional opportunities. Only reach Step 3 when the transcripts provide no concrete names or gaps.

TOOL USE — WEB SEARCH:
You have access to a \`webSearch\` tool that queries the live internet. Use it strategically:
- **DO call webSearch** when: the user asks about current events, recent news, companies not in our transcripts, market trends, competitor intelligence, or anything where real-time data would strengthen your answer.
- **DO NOT call webSearch** when: the internal transcript context already fully answers the question, or the user is asking about our own interview data.
- When you use web results, cite them as inline markdown links: [Source Title](url). List all web sources in a "Web Sources" section AFTER the internal "Sources" section.
- Internal transcript evidence ALWAYS takes priority over web data. Web data supplements — it does not override interview intelligence.

CITATION & SOURCING RULES:
- Ground every claim in the provided context. Use citation markers like [1], [2] to reference internal transcript sources.
- If the context doesn't contain enough information to answer, say so explicitly — do NOT hallucinate.
- Be concise but thorough. Use bullet points for structured information.
- When quoting interviewees, preserve their exact words and attribute to the speaker.
- Highlight risks, opportunities, and actionable intelligence when relevant.
- At the END of your response, add a "Sources" section listing the internal citations you used.
- If you called webSearch, add a separate "Web Sources" section listing each result as a markdown link.

${
  contextBlock
    ? `RETRIEVED CONTEXT (from interview transcripts):\n\n${contextBlock}\n\nSOURCE REFERENCES:\n${citationsSummary}`
    : "NO RELEVANT CONTEXT FOUND. Consider using the webSearch tool, or tell the user you couldn't find relevant information in the interview database for their query."
}`;

  // Convert UIMessages to simple format for streamText
  const chatMessages = messages.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" "),
  }));

  // ── Stream Response with Agentic Tool Calling (AI SDK v6) ─────
  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: systemPrompt,
    messages: chatMessages,
    tools: {
      webSearch: tool({
        description:
          "Search the live internet for real-time information about companies, markets, sectors, people, or recent news. Use when internal interview transcripts are insufficient, or when the user needs current events, new leads, market trends, or entities not found in our database.",
        inputSchema: z.object({
          query: z
            .string()
            .describe(
              "The search query — be specific, include company names, countries, or sectors"
            ),
          topic: z
            .enum(["general", "news"])
            .describe(
              "general for company/sector research, news for current events and recent developments"
            ),
        }),
        execute: async ({ query, topic }) => {
          const results = await tavilySearch(query, topic);
          return results.map((r) => ({
            title: r.title,
            url: r.url,
            content: r.content,
            score: r.score,
          }));
        },
      }),
    },
    stopWhen: stepCountIs(3),
  });

  return result.toUIMessageStreamResponse();
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
