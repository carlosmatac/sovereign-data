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
import {
  buildProjectIntelBrief,
  buildWorkspaceIntelBriefForUser,
} from "@/lib/chat/intel-brief";
import { classifyChatTemporalIntent } from "@/lib/ai/chat-temporal-classifier";
import {
  enrichPositionForTool,
  fetchCurrentPositionsForPerson,
  fetchPositionsForPersonAsOf,
  fetchTimelineForPerson,
  resolvePrefetchPositions,
} from "@/lib/positions/query-validated-positions";
import { resolveChatConversation } from "@/lib/chat/resolve-conversation";
import {
  persistAssistantTurn,
  persistChatEvidence,
  persistUserTurn,
} from "@/lib/chat/persist-messages";
import {
  parseCopilotMode,
  buildSystemPrompt,
  type CopilotMode,
} from "@/lib/chat/prompt-builder";
import { isOrgLikeEntityType } from "@/types/database";

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


async function loadInterviewTimesForChunks(
  admin: ReturnType<typeof createAdminClient>,
  chunks: RagChunk[]
): Promise<Map<string, number>> {
  const ids = [...new Set(chunks.map((c) => c.interview_id))];
  if (ids.length === 0) return new Map();
  const { data } = await admin
    .from("interviews")
    .select("id, conducted_at, created_at")
    .in("id", ids);
  const map = new Map<string, number>();
  for (const row of data ?? []) {
    const raw = row.conducted_at ?? row.created_at;
    const ms = raw ? Date.parse(raw) : 0;
    map.set(row.id, Number.isNaN(ms) ? 0 : ms);
  }
  return map;
}

function rerankRagChunksForTemporal(
  chunks: RagChunk[],
  times: Map<string, number>,
  intent:
    | "current_state"
    | "point_in_time"
    | "timeline"
    | "general_background",
  targetDateIso: string | null
): RagChunk[] {
  if (intent === "general_background" || chunks.length === 0) return chunks;
  const copy = [...chunks];
  const targetMs =
    targetDateIso && /^\d{4}-\d{2}-\d{2}$/.test(targetDateIso)
      ? Date.parse(`${targetDateIso}T12:00:00.000Z`)
      : NaN;
  if (intent === "current_state") {
    copy.sort(
      (a, b) =>
        (times.get(b.interview_id) ?? 0) - (times.get(a.interview_id) ?? 0)
    );
  } else if (intent === "point_in_time" && !Number.isNaN(targetMs)) {
    copy.sort((a, b) => {
      const ta = times.get(a.interview_id) ?? 0;
      const tb = times.get(b.interview_id) ?? 0;
      return (
        Math.abs(ta - targetMs) - Math.abs(tb - targetMs) || tb - ta
      );
    });
  } else if (intent === "timeline") {
    copy.sort(
      (a, b) =>
        (times.get(a.interview_id) ?? 0) - (times.get(b.interview_id) ?? 0)
    );
  }
  return copy;
}

/**
 * POST /api/chat
 *
 * Grounded Agentic RAG endpoint with internal entity/relationship tools.
 *
 * Flow:
 * 1. Accept messages + optional projectId from client
 * 2. Embed query, run hybrid_search with project filter
 * 3. Provide 4 internal tools: lookupPositions, lookupEntity,
 *    lookupRelationships, lookupMentions
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
  let projectId: string | null = body.projectId ?? null;
  let explicitInterviewId: string | null = body.interviewId ?? null;
  const copilotMode: CopilotMode = parseCopilotMode(body.copilotMode);

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

  const admin = createAdminClient();

  const bodyConversationId =
    typeof body.conversationId === "string" && body.conversationId.length > 0
      ? body.conversationId
      : null;

  const resolved = await resolveChatConversation({
    admin,
    userId: user.id,
    conversationId: bodyConversationId,
    bodyProjectId: projectId,
    bodyInterviewId: explicitInterviewId,
  });
  if (!resolved.ok) return resolved.response;

  projectId = resolved.projectId;
  explicitInterviewId = resolved.interviewId;
  const activeConversationId = resolved.conversationId;
  const activeTenantId = resolved.tenantId;

  const persistedUser = await persistUserTurn({
    admin,
    conversationId: activeConversationId,
    tenantId: activeTenantId,
    clientMessageId: lastUserMessage.id,
    content: queryText,
  });
  if (!persistedUser.ok) return persistedUser.response;
  const userMessageDbId = persistedUser.userMessageDbId;

  const temporalClassification = await classifyChatTemporalIntent(queryText);

  // ── Scope detection ─────────────────────────────────────────────
  const scopeIntent = detectScopeIntent(queryText);
  const effectiveInterviewId = explicitInterviewId ?? null;

  let interviewMeta: {
    title: string;
    interviewee_name: string | null;
    interviewee_org: string | null;
    interviewee_title: string | null;
  } | null = null;
  if (effectiveInterviewId) {
    const { data } = await admin
      .from("interviews")
      .select("title, interviewee_name, interviewee_org, interviewee_title")
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

  let resolvedPersonEntityId: string | null = null;
  let resolvedOrgEntityId: string | null = null;
  if (temporalClassification.person_name?.trim()) {
    const match = await findEntity(
      admin,
      temporalClassification.person_name.trim(),
      projectId
    );
    if (match?.type === "PERSON") resolvedPersonEntityId = match.id;
  }
  if (temporalClassification.organization_name?.trim()) {
    const match = await findEntity(
      admin,
      temporalClassification.organization_name.trim(),
      projectId
    );
    if (match && isOrgLikeEntityType(match.type)) {
      resolvedOrgEntityId = match.id;
    }
  }

  const { block: positionsBlock } = await resolvePrefetchPositions(admin, {
    temporalIntent: temporalClassification.temporal_intent,
    personEntityId: resolvedPersonEntityId,
    organizationEntityId: resolvedOrgEntityId,
    targetDateIso: temporalClassification.target_date_iso,
  });

  const dbIntelBrief = projectId
    ? await buildProjectIntelBrief(admin, projectId)
    : await buildWorkspaceIntelBriefForUser(admin, user.id);

  const dbIntelSection = dbIntelBrief
    ? `
═══════════════════════════════════════════════════════
DATABASE INTEL (project + interview summaries)
═══════════════════════════════════════════════════════
${dbIntelBrief}

The user may refer to a project by its display name (e.g. "Nigeria 2026"). That name is the PROJECT title above, not necessarily a phrase inside transcript excerpts. Use this section to answer "what we know about our project" at a high level; cite transcript chunks [n] for verbatim claims and use lookup tools for entities and relationships.
`
    : "";

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

  let ragChunks = (chunks ?? []) as RagChunk[];
  const interviewTimes = await loadInterviewTimesForChunks(admin, ragChunks);
  ragChunks = rerankRagChunksForTemporal(
    ragChunks,
    interviewTimes,
    temporalClassification.temporal_intent,
    temporalClassification.target_date_iso
  );

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

  const validatedPositionsSection =
    positionsBlock.trim().length > 0
      ? `
═══════════════════════════════════════════════════════
VALIDATED POSITIONS (authoritative for roles / titles)
═══════════════════════════════════════════════════════
${positionsBlock}

Human-validated global records. For leadership, job title, or employer questions, prefer this over isolated transcript lines. If a quote conflicts, keep validated facts as the anchor and describe interview wording as something that was "mentioned" or "said in an interview" rather than proof of org chart.
`
      : temporalClassification.temporal_intent !== "general_background"
        ? `
═══════════════════════════════════════════════════════
VALIDATED POSITIONS
═══════════════════════════════════════════════════════
None pre-loaded. After \`lookupEntity\` resolves a PERSON, call \`lookupPositions\` when the user asks about roles, employers, or titles.
`
        : "";

  // ── Modular system prompt ─────────────────────────────────────
  const systemPrompt = buildSystemPrompt({
    mode: copilotMode,
    temporalIntent: temporalClassification.temporal_intent,
    scopeBlock: buildScopeBlock(scopedToInterview, interviewMeta, scopeWarning),
    dbIntelSection,
    validatedPositionsSection,
    contextBlock,
    citationsSummary,
  });

  const priorForModel = messages.slice(0, -1).slice(-6);
  const lastForModel = messages[messages.length - 1];
  const messagesForModel = [...priorForModel, lastForModel];

  const chatMessages = messagesForModel.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" "),
  }));

  // ── Grounding metrics ─────────────────────────────────────────
  let usedInternalTools = false;

  // ── Stream Response with Internal + External Tools ────────────
  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: systemPrompt,
    messages: chatMessages,
    tools: {
      lookupPositions: tool({
        description:
          "Look up human-validated global positions for a person (PERSON entity_id from lookupEntity). Use for current role, historical as-of date, or career timeline. Prefer over inferring titles only from transcript excerpts.",
        inputSchema: z.object({
          personEntityId: z
            .string()
            .describe("UUID of a PERSON entity from lookupEntity"),
          mode: z
            .enum(["current", "as_of", "timeline"])
            .describe("current = active roles; as_of = roles valid on a date; timeline = ordered history"),
          asOfDate: z
            .string()
            .nullable()
            .describe("YYYY-MM-DD when mode is as_of; otherwise null"),
        }),
        execute: async ({ personEntityId, mode, asOfDate }) => {
          usedInternalTools = true;
          const wantsExactHistorical =
            temporalClassification.temporal_intent === "point_in_time";
          let rows = await fetchCurrentPositionsForPerson(admin, personEntityId);
          if (mode === "as_of") {
            const d = asOfDate?.trim() ?? "";
            rows = /^\d{4}-\d{2}-\d{2}$/.test(d)
              ? await fetchPositionsForPersonAsOf(admin, personEntityId, d)
              : await fetchCurrentPositionsForPerson(admin, personEntityId);
          } else if (mode === "timeline") {
            rows = await fetchTimelineForPerson(admin, personEntityId);
          }
          return {
            found: rows.length > 0,
            count: rows.length,
            positions: rows.map((r) =>
              enrichPositionForTool(r, {
                asOfIsoDate: asOfDate ?? undefined,
                wantsExactHistorical: wantsExactHistorical,
              })
            ),
          };
        },
      }),

      lookupEntity: tool({
        description:
          "Look up a person, company, or organization in the Aksum knowledge database by name. Returns the canonical entity record if found (id, name, type, description, metadata). Use this FIRST before making any factual claim about who someone is or what they manage.",
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
          const metaSummary = formatEntityMetadata(entity.metadata);
          return {
            found: true,
            entity_id: entity.id,
            name: entity.name,
            type: entity.type,
            description: entity.description,
            ...(metaSummary ? { metadata: metaSummary } : {}),
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
          const edges = await getRelationships(admin, entityId, projectId, {
            sortByInterviewRecency:
              temporalClassification.temporal_intent !== "general_background",
          });
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
          "Get interviews where this entity (by entity_id) is associated. Returns interviews where the entity is the upload-anchor INTERVIEWEE, the INTERVIEWEE'S ORG, mentioned in a transcript chunk, or party to a non-rejected relationship. Each row carries a `role` field naming which kind of association it is. Use to gather every source where the entity matters, not just textual mentions.",
        inputSchema: z.object({
          entityId: z.string().describe("The entity UUID returned by lookupEntity"),
        }),
        execute: async ({ entityId }) => {
          usedInternalTools = true;
          const mentions = await getMentions(admin, entityId, projectId, {
            targetDateIso: temporalClassification.target_date_iso,
            prioritizeTemporalProximity:
              temporalClassification.temporal_intent === "point_in_time" &&
              !!temporalClassification.target_date_iso,
          });
          if (mentions.length === 0) {
            return {
              found: false,
              message:
                "No interviews found where this entity is mentioned, an interviewee anchor, or a relationship party.",
            };
          }
          return {
            found: true,
            count: mentions.length,
            mentions: mentions.map((m) => ({
              interview_title: m.interview_title,
              interview_id: m.interview_id,
              role: m.role,
              sentiment: m.sentiment ?? "neutral",
              context: m.chunk_content
                ? m.chunk_content.slice(0, 500)
                : m.role === "interviewee"
                  ? "Anchor interviewee on this source — no transcript excerpt for this row."
                  : m.role === "interviewee_org"
                    ? "Anchor interviewee org on this source — no transcript excerpt for this row."
                    : m.role === "author"
                      ? "Author or primary creator of this source."
                      : m.role === "primary_subject"
                        ? "Primary subject of this source."
                        : m.role === "subject_organization"
                          ? "Organization that is the primary subject of this source."
                          : m.role === "related_via_relationship"
                            ? "Linked via an entity relationship on this source — no transcript excerpt for this row."
                            : "No chunk content available",
            })),
          };
        },
      }),

    },
    stopWhen: stepCountIs(5),
    async onFinish({ text }) {
      const citationsUsed = (text.match(/\[\d+\]/g) ?? []).length;
      console.log(
        `[chat-grounding] chunks=${ragChunks.length} internalTools=${usedInternalTools} citations=${citationsUsed} project=${projectId ?? "all"} interview=${effectiveInterviewId ?? "all"} scope=${scopeIntent} temporal=${temporalClassification.temporal_intent}`
      );
      const assistantMessageId = await persistAssistantTurn({
        admin,
        conversationId: activeConversationId,
        tenantId: activeTenantId,
        userMessageDbId,
        text,
      });
      if (assistantMessageId && ragChunks.length > 0) {
        await persistChatEvidence({
          admin,
          messageId: assistantMessageId,
          tenantId: activeTenantId,
          ragChunks,
          text,
        });
      }
    },
  });

  return result.toUIMessageStreamResponse({
    headers: { "X-Conversation-Id": activeConversationId },
    originalMessages: messages,
  });
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
  interviewMeta: {
    title: string;
    interviewee_name: string | null;
    interviewee_org: string | null;
    interviewee_title: string | null;
  } | null,
  scopeWarning: string | null
): string {
  if (scopeWarning) {
    return `\n═══════════════════════════════════════════════════════\nSCOPE WARNING\n═══════════════════════════════════════════════════════\n${scopeWarning}\n`;
  }

  if (scopedToInterview && interviewMeta) {
    const interviewee = [
      interviewMeta.interviewee_name,
      interviewMeta.interviewee_org,
      interviewMeta.interviewee_title,
    ]
      .filter(Boolean)
      .join(" — ");
    const titleNote = interviewMeta.interviewee_title?.trim()
      ? " (upload metadata only — not validated org-chart truth)"
      : "";
    return `\n═══════════════════════════════════════════════════════\nSCOPE: SINGLE INTERVIEW\n═══════════════════════════════════════════════════════\nThe user is asking about a SPECIFIC interview. ALL evidence below comes ONLY from this interview:\n- Title: "${interviewMeta.title}"\n${interviewee ? `- Interviewee: ${interviewee}${titleNote}\n` : ""}\nCRITICAL: Do NOT use general knowledge, web search, or information from other interviews to answer this question. If the answer is not in the retrieved context below, say "This was not discussed in this interview" rather than supplementing from other sources.\n`;
  }

  return "";
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Render entity_metadata_v1 as a compact pipe-delimited string for the
 * LLM tool output. Returns null when no v1 metadata is present.
 */
function formatEntityMetadata(metadata: Record<string, unknown> | null): string | null {
  if (!metadata || metadata.schema_version !== "entity_metadata_v1") return null;
  const parts: string[] = [];
  if (Array.isArray(metadata.countries) && metadata.countries.length > 0) {
    parts.push(`countries: ${(metadata.countries as string[]).join(", ")}`);
  }
  if (Array.isArray(metadata.sectors) && metadata.sectors.length > 0) {
    parts.push(`sectors: ${(metadata.sectors as string[]).join(", ")}`);
  }
  if (Array.isArray(metadata.summary_tags) && metadata.summary_tags.length > 0) {
    parts.push(`tags: ${(metadata.summary_tags as string[]).join(", ")}`);
  }
  if (typeof metadata.confidence === "string") {
    parts.push(`confidence: ${metadata.confidence}`);
  }
  return parts.length > 0 ? parts.join(" | ") : null;
}
