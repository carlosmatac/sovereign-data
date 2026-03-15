import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbeddings } from "@/lib/ai/embeddings";
import { streamText, tool, stepCountIs, type UIMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { AI_CONFIG } from "@/lib/constants";
import {
  findEntity,
  getRelationships,
  getMentions,
} from "@/lib/ai/entity-lookup";

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
 * Grounded Agentic RAG endpoint with internal entity/relationship tools.
 *
 * Flow:
 * 1. Accept messages + optional projectId from client
 * 2. Embed query, run hybrid_search with project filter
 * 3. Provide 3 internal tools (findEntity, getRelationships, getMentions)
 *    + 1 external tool (webSearch)
 * 4. Stream a grounded response (up to 5 steps)
 * 5. Log grounding metrics
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json();
  const messages: UIMessage[] = body.messages ?? [];
  const projectId: string | null = body.projectId ?? null;
  const explicitInterviewId: string | null = body.interviewId ?? null;

  if (messages.length === 0) {
    return new Response("No messages provided", { status: 400 });
  }

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

  // ── Scope detection ─────────────────────────────────────────────
  const admin = createAdminClient();
  const scopeIntent = detectScopeIntent(queryText);
  const effectiveInterviewId = explicitInterviewId ?? null;

  let interviewMeta: { title: string; interviewee_name: string | null; interviewee_org: string | null } | null = null;
  if (effectiveInterviewId) {
    const { data } = await admin
      .from("interviews")
      .select("title, interviewee_name, interviewee_org")
      .eq("id", effectiveInterviewId)
      .maybeSingle();
    interviewMeta = data;
  }

  const scopedToInterview = scopeIntent === "this_interview" && !!effectiveInterviewId;
  const scopeWarning =
    scopeIntent === "this_interview" && !effectiveInterviewId
      ? "The user said \"this interview\" but no specific interview is selected. Answer using all available evidence but tell the user to open chat from a specific interview page for interview-scoped questions."
      : null;

  console.log(
    `[chat-scope] intent=${scopeIntent} explicitInterview=${effectiveInterviewId ?? "none"} scopedToInterview=${scopedToInterview}`
  );

  // ── RAG Retrieval ───────────────────────────────────────────────
  const [queryEmbedding] = await generateEmbeddings([queryText]);

  const { data: chunks } = await admin.rpc("hybrid_search", {
    query_embedding: JSON.stringify(queryEmbedding),
    filter_project_ids: projectId ? [projectId] : null,
    filter_interview_ids: scopedToInterview ? [effectiveInterviewId!] : null,
    filter_country: null,
    filter_topics: null,
    match_threshold: AI_CONFIG.similarityThreshold,
    match_count: scopedToInterview ? 30 : 20,
  });

  const ragChunks = (chunks ?? []) as RagChunk[];

  const contextBlock = ragChunks
    .map((chunk, i) => {
      const speaker = chunk.speaker ? `[${chunk.speaker}]` : "";
      const time = chunk.start_time
        ? `[${formatTime(chunk.start_time)}]`
        : "";
      return `[${i + 1}] ${speaker} ${time}\n${chunk.content}`;
    })
    .join("\n\n");

  const citationsSummary = ragChunks
    .map((chunk, i) => {
      const speaker = chunk.speaker ?? "Unknown";
      const time = chunk.start_time ? formatTime(chunk.start_time) : "N/A";
      const interviewUrl = `/interviews/${chunk.interview_id}`;
      return `[${i + 1}] Speaker: ${speaker}, Time: ${time}, Relevance: ${Math.round(chunk.similarity * 100)}% — [View Interview](${interviewUrl})`;
    })
    .join("\n");

  // ── Grounding-first system prompt ─────────────────────────────
  const systemPrompt = `You are "Sovereign", the Business Intelligence Copilot for "The Business Year" (TBY).

IDENTITY:
TBY is a media/consulting firm producing economic reviews across emerging markets. The team in each country has a Country Manager (CM — sales) and Editor (content). Products: Full page + interview, Half page, Logo placement, Interview, Barter. Key jargon: "pitch", "drop-off", "all-in-one", "follow-up".

═══════════════════════════════════════════════════════
GROUNDING RULES — NON-NEGOTIABLE
═══════════════════════════════════════════════════════

1. **NEVER invent facts about people, companies, roles, or relationships.** Every factual claim about "who manages what", "who is connected to whom", or "what entity does X" MUST be backed by:
   (a) An entity_relationships evidence_text returned by the \`lookupRelationships\` tool, OR
   (b) A direct transcript chunk citation from the RETRIEVED CONTEXT below, OR
   (c) A mention returned by the \`lookupMentions\` tool.

2. **When asked about a person or company you are not sure about**: ALWAYS call \`lookupEntity\` first. If the entity is found, follow up with \`lookupRelationships\` and/or \`lookupMentions\` to get evidence. Only then make claims.

3. **If no evidence is found** after using the tools, respond with:
   "I cannot confirm this from our interview database. Here is what I do know: [any partial matches]. Could you clarify the project or full name?"

4. **Response structure** (mandatory for factual queries):
   **Section 1 — What Sovereign Knows (from interviews)**
   Ground every claim with citation markers [1], [2]… or tool results. Quote exact evidence_text when available.

   **Section 2 — Recommended Approach**
   Only after presenting evidence, give strategic advice tied to that evidence.

   **Sources**
   List internal citations used.

5. **Second-Order Thinking for Lead Generation** still applies:
   Step 1 (Orbit): Extract third-party entities mentioned in transcripts.
   Step 2 (Market Gap): Deduce sectors from bottlenecks/trends.
   Step 3 (Ideal Target Profile): If no names found, output a structured profile. NEVER hallucinate company names.

TOOL USE PRIORITY:
1. \`lookupEntity\` — Use FIRST whenever a query mentions a specific person, company, or organization by name.
2. \`lookupRelationships\` — Use after finding an entity to get relationship edges with evidence.
3. \`lookupMentions\` — Use to get interview contexts where an entity was discussed.
4. \`webSearch\` — Use ONLY when internal data is insufficient AND the user needs current events or external context. Internal evidence always takes priority.

CITATION RULES:
- Transcript chunks: cite as [1], [2], etc.
- Entity tool results: cite as "According to our entity database: …"
- Web results: cite as inline markdown links. List in a separate "Web Sources" section.

${buildScopeBlock(scopedToInterview, interviewMeta, scopeWarning)}

${
  contextBlock
    ? `RETRIEVED CONTEXT (from interview transcripts):\n\n${contextBlock}\n\nSOURCE REFERENCES:\n${citationsSummary}`
    : "NO RELEVANT TRANSCRIPT CONTEXT FOUND for this query. Use the lookup tools or tell the user you could not find relevant information."
}`;

  const chatMessages = messages.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" "),
  }));

  // ── Grounding metrics ─────────────────────────────────────────
  let usedInternalTools = false;
  let tavilyCallsCount = 0;

  // ── Stream Response with Internal + External Tools ────────────
  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: systemPrompt,
    messages: chatMessages,
    tools: {
      lookupEntity: tool({
        description:
          "Look up a person, company, or organization in the Sovereign intelligence database by name. Returns the canonical entity record if found (id, name, type, description). Use this FIRST before making any factual claim about who someone is or what they manage.",
        inputSchema: z.object({
          name: z
            .string()
            .describe("The entity name to search for (e.g. 'Mr. Lwamba', 'SNEL', 'Ministry of Energy')"),
        }),
        execute: async ({ name }) => {
          usedInternalTools = true;
          const entity = await findEntity(admin, name, projectId);
          if (!entity) {
            return {
              found: false,
              message: `No entity matching "${name}" was found in our database.`,
            };
          }
          return {
            found: true,
            entity_id: entity.id,
            name: entity.name,
            type: entity.type,
            description: entity.description,
          };
        },
      }),

      lookupRelationships: tool({
        description:
          "Get all known relationships for an entity (by entity_id). Returns edges with relation_type, confidence, evidence_text, and the connected entity. Use after lookupEntity to verify claims about who is connected to whom.",
        inputSchema: z.object({
          entityId: z.string().describe("The entity UUID returned by lookupEntity"),
        }),
        execute: async ({ entityId }) => {
          usedInternalTools = true;
          const edges = await getRelationships(admin, entityId, projectId);
          if (edges.length === 0) {
            return {
              found: false,
              message: "No relationships found for this entity in our database.",
            };
          }
          return {
            found: true,
            count: edges.length,
            relationships: edges.map((e) => ({
              direction: e.direction,
              relation_type: e.relation_type,
              other_entity: `${e.other_entity_name} (${e.other_entity_type})`,
              confidence: `${Math.round(e.confidence * 100)}%`,
              evidence: e.evidence_text,
              interview_id: e.interview_id,
            })),
          };
        },
      }),

      lookupMentions: tool({
        description:
          "Get interview mentions for an entity (by entity_id). Returns the interview titles, sentiment, and chunk content where the entity was discussed. Use to gather context about how an entity is portrayed across interviews.",
        inputSchema: z.object({
          entityId: z.string().describe("The entity UUID returned by lookupEntity"),
        }),
        execute: async ({ entityId }) => {
          usedInternalTools = true;
          const mentions = await getMentions(admin, entityId, projectId);
          if (mentions.length === 0) {
            return {
              found: false,
              message: "No interview mentions found for this entity.",
            };
          }
          return {
            found: true,
            count: mentions.length,
            mentions: mentions.map((m) => ({
              interview_title: m.interview_title,
              interview_id: m.interview_id,
              sentiment: m.sentiment ?? "neutral",
              context: m.chunk_content
                ? m.chunk_content.slice(0, 500)
                : "No chunk content available",
            })),
          };
        },
      }),

      webSearch: tool({
        description:
          "Search the live internet for real-time information. Use ONLY when internal tools and transcript context are insufficient — for example, current events, companies not in our database, or market trends. Internal evidence always takes priority over web results.",
        inputSchema: z.object({
          query: z
            .string()
            .describe("Specific search query with company names, countries, or sectors"),
          topic: z
            .enum(["general", "news"])
            .describe("general for company/sector research, news for current events"),
        }),
        execute: async ({ query, topic }) => {
          tavilyCallsCount++;
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
    stopWhen: stepCountIs(5),
    async onFinish({ text }) {
      const citationsUsed = (text.match(/\[\d+\]/g) ?? []).length;
      console.log(
        `[chat-grounding] chunks=${ragChunks.length} internalTools=${usedInternalTools} citations=${citationsUsed} tavily=${tavilyCallsCount} project=${projectId ?? "all"} interview=${effectiveInterviewId ?? "all"} scope=${scopeIntent}`
      );
    },
  });

  return result.toUIMessageStreamResponse();
}

// ── Scope detection ─────────────────────────────────────────────────

type ScopeIntent = "this_interview" | "this_project" | "global";

const THIS_INTERVIEW_PATTERNS = [
  /\bthis\s+interview\b/i,
  /\bin\s+the\s+interview\b/i,
  /\bfrom\s+this\s+interview\b/i,
  /\bthis\s+transcript\b/i,
  /\bin\s+this\s+conversation\b/i,
  /\bwhat\s+did\s+(he|she|they|the\s+interviewee)\s+say\b/i,
  /\bwhat\s+was\s+said\s+about\b/i,
  /\baccording\s+to\s+this\s+interview\b/i,
];

function detectScopeIntent(query: string): ScopeIntent {
  for (const pattern of THIS_INTERVIEW_PATTERNS) {
    if (pattern.test(query)) return "this_interview";
  }
  if (/\bthis\s+project\b/i.test(query) || /\bacross\s+(all\s+)?interviews\b/i.test(query)) {
    return "this_project";
  }
  return "global";
}

function buildScopeBlock(
  scopedToInterview: boolean,
  interviewMeta: { title: string; interviewee_name: string | null; interviewee_org: string | null } | null,
  scopeWarning: string | null
): string {
  if (scopeWarning) {
    return `\n═══════════════════════════════════════════════════════\nSCOPE WARNING\n═══════════════════════════════════════════════════════\n${scopeWarning}\n`;
  }

  if (scopedToInterview && interviewMeta) {
    const interviewee = [interviewMeta.interviewee_name, interviewMeta.interviewee_org]
      .filter(Boolean)
      .join(" — ");
    return `\n═══════════════════════════════════════════════════════\nSCOPE: SINGLE INTERVIEW\n═══════════════════════════════════════════════════════\nThe user is asking about a SPECIFIC interview. ALL evidence below comes ONLY from this interview:\n- Title: "${interviewMeta.title}"\n${interviewee ? `- Interviewee: ${interviewee}\n` : ""}\nCRITICAL: Do NOT use general knowledge, web search, or information from other interviews to answer this question. If the answer is not in the retrieved context below, say "This was not discussed in this interview" rather than supplementing from other sources.\n`;
  }

  return "";
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
