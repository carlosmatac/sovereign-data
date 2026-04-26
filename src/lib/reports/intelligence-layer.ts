import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { REPORT_TEMPLATES } from "@/lib/constants";
import { normalizeEntityName } from "@/lib/entities/normalize";
import type { Database, ReportTemplate } from "@/types/database";

type AdminClient = ReturnType<typeof createAdminClient>;
type EntityRow = Pick<
  Database["public"]["Tables"]["entities"]["Row"],
  | "id"
  | "name"
  | "type"
  | "project_id"
  | "canonical_entity_id"
  | "normalized_name"
  | "metadata"
>;
type AliasRow = Pick<
  Database["public"]["Tables"]["entity_aliases"]["Row"],
  "entity_id" | "alias" | "confidence" | "project_id"
>;
type ChunkRow = Pick<
  Database["public"]["Tables"]["interview_chunks"]["Row"],
  "id" | "interview_id" | "content" | "speaker" | "start_time" | "end_time"
>;

type ConfidenceLevel = "high" | "medium" | "low";
type InsightBlockType =
  | "key_finding"
  | "evidence_backed_claim"
  | "contradiction"
  | "actor_relationship"
  | "recommendation"
  | "watch_item";

export interface ReportInterviewRecord {
  id: string;
  title: string;
  summary: string | null;
  topics: string[];
  country: string | null;
  sentiment: {
    overall?: string;
    score?: number;
  } | null;
  intervieweeName: string | null;
  intervieweeOrg: string | null;
  intervieweeTitle: string | null;
}

export interface ReportEvidenceRecord {
  id: string;
  kind: "entity_mention" | "relationship" | "interview_summary";
  interviewId: string;
  interviewTitle: string;
  speaker: string | null;
  chunkId: string | null;
  timestamp: string | null;
  excerpt: string;
  supportingEntityNames: string[];
  note: string;
}

export interface ReportEntityRecord {
  entityId: string;
  canonicalEntityId: string;
  canonicalName: string;
  type: string;
  aliases: string[];
  mentionCount: number;
  interviewIds: string[];
  hygieneConfidence: ConfidenceLevel;
  hygieneNote: string | null;
}

export interface ReportInsightBlock {
  blockType: InsightBlockType;
  title: string;
  whatWeKnow: string;
  whyItMatters: string;
  actionOrMonitor: string;
  confidence: ConfidenceLevel;
  supportingEvidenceIds: string[];
  support: {
    evidenceCount: number;
    interviewIds: string[];
    entityNames: string[];
  };
  flaggedUncertainty: string | null;
}

export interface ReportIntelligenceLayer {
  template: ReportTemplate;
  templateLabel: string;
  customFocus: string | null;
  executiveBrief: {
    whatWeKnow: string;
    whyItMatters: string;
    whatToDo: string;
    confidence: ConfidenceLevel;
  };
  interviews: ReportInterviewRecord[];
  entities: ReportEntityRecord[];
  evidence: ReportEvidenceRecord[];
  insightBlocks: ReportInsightBlock[];
  reportingWarnings: string[];
}

type MentionRow = {
  entity_id: string;
  interview_id: string;
  chunk_id: string | null;
  context: string | null;
  sentiment: string | null;
  entities: EntityRow | EntityRow[] | null;
};

type RelationshipRow = {
  source_entity_id: string;
  target_entity_id: string;
  relation_type: string;
  confidence: number;
  evidence_text: string | null;
  interview_id: string;
  source_entity: EntityRow | EntityRow[] | null;
  target_entity: EntityRow | EntityRow[] | null;
};

const InsightBlockSchema = z.object({
  block_type: z.enum([
    "key_finding",
    "evidence_backed_claim",
    "contradiction",
    "actor_relationship",
    "recommendation",
    "watch_item",
  ]),
  title: z.string(),
  what_we_know: z.string(),
  why_it_matters: z.string(),
  action_or_monitor: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  evidence_refs: z.array(z.string()).max(6),
  supporting_entities: z.array(z.string()).max(8),
  uncertainty_note: z.string().nullable(),
});

const ReportSynthesisSchema = z.object({
  executive_brief: z.object({
    what_we_know: z.string(),
    why_it_matters: z.string(),
    what_to_do: z.string(),
    confidence: z.enum(["high", "medium", "low"]),
  }),
  insight_blocks: z.array(InsightBlockSchema).max(18),
  reporting_warnings: z.array(z.string()).max(8),
});

export async function buildReportIntelligenceLayer(args: {
  projectId: string;
  interviewIds: string[];
  template: ReportTemplate;
  customFocus?: string | null;
}): Promise<ReportIntelligenceLayer> {
  const admin = createAdminClient();
  const { projectId, interviewIds, template, customFocus } = args;
  const templateConfig = REPORT_TEMPLATES[template as keyof typeof REPORT_TEMPLATES];

  const [interviewsData, chunksData, mentionsData, relationshipsData] =
    await Promise.all([
      admin
        .from("interviews")
        .select(
          "id, title, summary, topics, sentiment, interviewee_name, interviewee_org, interviewee_title, projects(country)"
        )
        .in("id", interviewIds)
        .eq("project_id", projectId)
        .eq("status", "COMPLETED"),
      admin
        .from("interview_chunks")
        .select("id, interview_id, content, speaker, start_time, end_time")
        .in("interview_id", interviewIds),
      admin
        .from("entity_mentions")
        .select(
          "entity_id, interview_id, chunk_id, context, sentiment, entities(id, name, type, project_id, canonical_entity_id, normalized_name, metadata)"
        )
        .in("interview_id", interviewIds),
      // Reports represent active intelligence — exclude editorially
      // rejected relationships. See docs/features/on-going/editable-relationship-governance.md
      admin
        .from("entity_relationships")
        .select(
          "source_entity_id, target_entity_id, relation_type, confidence, evidence_text, interview_id, source_entity:entities!entity_relationships_source_entity_id_fkey(id, name, type, project_id, canonical_entity_id, normalized_name, metadata), target_entity:entities!entity_relationships_target_entity_id_fkey(id, name, type, project_id, canonical_entity_id, normalized_name, metadata)"
        )
        .in("interview_id", interviewIds)
        .neq("review_status", "rejected"),
    ]);

  if (interviewsData.error) throw interviewsData.error;
  if (chunksData.error) throw chunksData.error;
  if (mentionsData.error) throw mentionsData.error;
  if (relationshipsData.error) throw relationshipsData.error;

  const interviews = (interviewsData.data ?? []).map((row) => {
    const project = unwrapJoined<{ country: string | null }>(row.projects);
    return {
      id: row.id,
      title: row.title,
      summary: row.summary,
      topics: row.topics ?? [],
      country: project?.country ?? null,
      sentiment: row.sentiment as { overall?: string; score?: number } | null,
      intervieweeName: row.interviewee_name,
      intervieweeOrg: row.interviewee_org,
      intervieweeTitle: row.interviewee_title,
    };
  });

  if (interviews.length === 0) {
    throw new Error("No completed interviews found for the selected IDs");
  }

  const chunks = (chunksData.data ?? []) as ChunkRow[];
  const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const chunksByInterview = new Map<string, ChunkRow[]>();
  for (const chunk of chunks) {
    const existing = chunksByInterview.get(chunk.interview_id) ?? [];
    existing.push(chunk);
    chunksByInterview.set(chunk.interview_id, existing);
  }

  const mentions = (mentionsData.data ?? []) as MentionRow[];
  const relationships = (relationshipsData.data ?? []) as RelationshipRow[];

  const entityIds = new Set<string>();
  for (const mention of mentions) {
    entityIds.add(mention.entity_id);
    const entity = unwrapJoined<EntityRow>(mention.entities);
    if (entity) entityIds.add(entity.id);
  }
  for (const relationship of relationships) {
    entityIds.add(relationship.source_entity_id);
    entityIds.add(relationship.target_entity_id);
    const source = unwrapJoined<EntityRow>(relationship.source_entity);
    const target = unwrapJoined<EntityRow>(relationship.target_entity);
    if (source) entityIds.add(source.id);
    if (target) entityIds.add(target.id);
  }

  const entityMap = await hydrateEntityClosure(admin, [...entityIds]);
  for (const mention of mentions) {
    const entity = unwrapJoined<EntityRow>(mention.entities);
    if (entity) entityMap.set(entity.id, entity);
  }
  for (const relationship of relationships) {
    const source = unwrapJoined<EntityRow>(relationship.source_entity);
    const target = unwrapJoined<EntityRow>(relationship.target_entity);
    if (source) entityMap.set(source.id, source);
    if (target) entityMap.set(target.id, target);
  }

  const aliasRows = await loadAliasRows(admin, [...entityMap.keys()]);
  const aliasesByEntityId = new Map<string, AliasRow[]>();
  for (const alias of aliasRows) {
    const existing = aliasesByEntityId.get(alias.entity_id) ?? [];
    existing.push(alias);
    aliasesByEntityId.set(alias.entity_id, existing);
  }

  const entityGroups = buildEntityGroups({
    entityMap,
    aliasesByEntityId,
    mentions,
    relationships,
  });

  const evidence = buildEvidenceLedger({
    interviews,
    mentions,
    relationships,
    entityGroups,
    entityMap,
    chunksById,
    chunksByInterview,
  });

  const synthesis = await synthesizeIntelligence({
    template,
    templateLabel: templateConfig.label,
    customFocus: customFocus?.trim() || null,
    interviews,
    entities: entityGroups,
    evidence,
  });

  const evidenceMap = new Map(evidence.map((item) => [item.id, item]));
  const insightBlocks = synthesis.insight_blocks
    .map((block) => hydrateInsightBlock(block, evidenceMap))
    .filter((block): block is ReportInsightBlock => block !== null);

  return {
    template,
    templateLabel: templateConfig.label,
    customFocus: customFocus?.trim() || null,
    executiveBrief: {
      whatWeKnow: synthesis.executive_brief.what_we_know,
      whyItMatters: synthesis.executive_brief.why_it_matters,
      whatToDo: synthesis.executive_brief.what_to_do,
      confidence: synthesis.executive_brief.confidence,
    },
    interviews,
    entities: entityGroups,
    evidence,
    insightBlocks,
    reportingWarnings: synthesis.reporting_warnings,
  };
}

async function synthesizeIntelligence(args: {
  template: ReportTemplate;
  templateLabel: string;
  customFocus: string | null;
  interviews: ReportInterviewRecord[];
  entities: ReportEntityRecord[];
  evidence: ReportEvidenceRecord[];
}) {
  const { template, templateLabel, customFocus, interviews, entities, evidence } = args;

  const interviewContext = interviews
    .map(
      (interview, index) =>
        [
          `Interview ${index + 1}: ${interview.title}`,
          `- Interview ID: ${interview.id}`,
          `- Country: ${interview.country ?? "Unknown"}`,
          `- Topics: ${interview.topics.join(", ") || "None tagged"}`,
          `- Sentiment: ${interview.sentiment?.overall ?? "Unknown"} (${String(interview.sentiment?.score ?? "n/a")})`,
          `- Primary anchors: ${[interview.intervieweeName, interview.intervieweeOrg, interview.intervieweeTitle].filter(Boolean).join(" | ") || "None"}`,
          `- Summary: ${interview.summary ?? "No interview summary stored."}`,
        ].join("\n")
    )
    .join("\n\n");

  const entityContext = entities
    .slice(0, 20)
    .map((entity) => {
      const aliases = entity.aliases.filter((alias) => alias !== entity.canonicalName);
      return [
        `- ${entity.canonicalName} (${entity.type})`,
        `mentions=${entity.mentionCount}`,
        `interviews=${entity.interviewIds.length}`,
        `hygiene=${entity.hygieneConfidence}`,
        `aliases=${aliases.join(", ") || "none"}`,
        entity.hygieneNote ? `note=${entity.hygieneNote}` : "note=none",
      ].join(" | ");
    })
    .join("\n");

  const evidenceContext = evidence
    .map(
      (item) =>
        `${item.id} | ${item.kind} | interview="${item.interviewTitle}" | interview_id=${item.interviewId} | speaker=${item.speaker ?? "unknown"} | timestamp=${item.timestamp ?? "n/a"} | entities=${item.supportingEntityNames.join(", ") || "none"} | note=${item.note} | excerpt="${item.excerpt}"`
    )
    .join("\n");

  const { object } = await generateObject({
    model: openai("gpt-4o"),
    schema: ReportSynthesisSchema,
    prompt: `You are designing the shared intelligence substrate for Aksum reports.

Your job is to convert interview evidence into reusable report blocks that can be remixed across templates without losing provenance or nuance.

TEMPLATE: ${templateLabel} (${template})
${customFocus ? `CUSTOM FOCUS: ${customFocus}` : "CUSTOM FOCUS: none"}

INTERVIEWS:
${interviewContext}

ENTITY HYGIENE REGISTRY:
${entityContext || "No resolved entities."}

EVIDENCE LEDGER:
${evidenceContext || "No evidence records."}

NON-NEGOTIABLE RULES:
- Every block must be evidence-backed. Use only evidence_refs that exist in the evidence ledger.
- Prefer canonical entity names from the entity hygiene registry.
- If an entity has hygiene=low, explicitly reflect that in uncertainty_note instead of presenting the identity as fully clean.
- Surface contradictions when interviewees disagree, frame the same issue differently, or emphasize different constraints.
- Keep outputs executive-friendly: answer what we know, why it matters, what to do or monitor, and how confident we are.
- Recommendations and watch items must be grounded in the supplied evidence, not generic best practices.
- Do not invent entities, interviews, speakers, or timestamps.
- Favor higher-signal blocks over quantity. It is acceptable to return fewer blocks if evidence is thin.

BLOCK SELECTION GUIDANCE:
- Use a mix of key_finding, evidence_backed_claim, contradiction, actor_relationship, recommendation, and watch_item blocks when supported by evidence.
- Contradiction blocks should only appear when there is genuine tension or materially different framing across sources.
- Actor_relationship blocks should emphasize who matters, how they are connected, and why that matters for the user.

Return the executive brief plus reusable blocks.`,
  });

  return object;
}

async function hydrateEntityClosure(
  admin: AdminClient,
  seedIds: string[]
): Promise<Map<string, EntityRow>> {
  const entityMap = new Map<string, EntityRow>();
  let pending = unique(seedIds).filter(Boolean);

  while (pending.length > 0) {
    const batch = pending.slice(0, 100);
    pending = pending.slice(100);

    const { data, error } = await admin
      .from("entities")
      .select("id, name, type, project_id, canonical_entity_id, normalized_name, metadata")
      .in("id", batch);

    if (error) throw error;

    for (const row of (data ?? []) as EntityRow[]) {
      if (!entityMap.has(row.id)) {
        entityMap.set(row.id, row);
      }
      if (row.canonical_entity_id && !entityMap.has(row.canonical_entity_id)) {
        pending.push(row.canonical_entity_id);
      }
    }

    pending = unique(pending);
  }

  return entityMap;
}

async function loadAliasRows(
  admin: AdminClient,
  entityIds: string[]
): Promise<AliasRow[]> {
  if (entityIds.length === 0) return [];

  const { data, error } = await admin
    .from("entity_aliases")
    .select("entity_id, alias, confidence, project_id")
    .in("entity_id", entityIds);

  if (error) throw error;
  return (data ?? []) as AliasRow[];
}

function buildEntityGroups(args: {
  entityMap: Map<string, EntityRow>;
  aliasesByEntityId: Map<string, AliasRow[]>;
  mentions: MentionRow[];
  relationships: RelationshipRow[];
}): ReportEntityRecord[] {
  const { entityMap, aliasesByEntityId, mentions, relationships } = args;
  const memberIdsByCanonical = new Map<string, Set<string>>();
  const mentionCountByCanonical = new Map<string, number>();
  const interviewIdsByCanonical = new Map<string, Set<string>>();

  for (const entityId of entityMap.keys()) {
    const canonicalId = resolveCanonicalEntityId(entityId, entityMap);
    const memberIds = memberIdsByCanonical.get(canonicalId) ?? new Set<string>();
    memberIds.add(entityId);
    memberIdsByCanonical.set(canonicalId, memberIds);
  }

  for (const mention of mentions) {
    const canonicalId = resolveCanonicalEntityId(mention.entity_id, entityMap);
    mentionCountByCanonical.set(
      canonicalId,
      (mentionCountByCanonical.get(canonicalId) ?? 0) + 1
    );
    const interviews = interviewIdsByCanonical.get(canonicalId) ?? new Set<string>();
    interviews.add(mention.interview_id);
    interviewIdsByCanonical.set(canonicalId, interviews);
  }

  for (const relationship of relationships) {
    const sourceCanonicalId = resolveCanonicalEntityId(
      relationship.source_entity_id,
      entityMap
    );
    const targetCanonicalId = resolveCanonicalEntityId(
      relationship.target_entity_id,
      entityMap
    );
    for (const canonicalId of [sourceCanonicalId, targetCanonicalId]) {
      const interviews = interviewIdsByCanonical.get(canonicalId) ?? new Set<string>();
      interviews.add(relationship.interview_id);
      interviewIdsByCanonical.set(canonicalId, interviews);
    }
  }

  const groups: ReportEntityRecord[] = [];

  for (const [canonicalId, memberIds] of memberIdsByCanonical.entries()) {
    const canonical = entityMap.get(canonicalId);
    if (!canonical) continue;

    const aliases = new Set<string>([canonical.name]);
    let needsReview = metadataNeedsReview(canonical.metadata);
    let memberCount = 0;

    for (const memberId of memberIds) {
      const member = entityMap.get(memberId);
      if (!member) continue;

      memberCount += 1;
      aliases.add(member.name);
      needsReview = needsReview || metadataNeedsReview(member.metadata);

      for (const alias of aliasesByEntityId.get(memberId) ?? []) {
        aliases.add(alias.alias);
      }
    }

    const hygieneConfidence: ConfidenceLevel = needsReview
      ? "low"
      : memberCount > 1 || aliases.size > 1
        ? "medium"
        : "high";

    let hygieneNote: string | null = null;
    if (needsReview) {
      hygieneNote =
        "Entity normalization is marked for review; treat the canonical name as provisional.";
    } else if (memberCount > 1 || aliases.size > 1) {
      hygieneNote =
        "Canonicalized from aliases or variant spellings to reduce ambiguity in the report.";
    }

    groups.push({
      entityId: canonical.id,
      canonicalEntityId: canonical.id,
      canonicalName: canonical.name,
      type: canonical.type,
      aliases: [...aliases].sort((left, right) => left.localeCompare(right)),
      mentionCount: mentionCountByCanonical.get(canonicalId) ?? 0,
      interviewIds: [...(interviewIdsByCanonical.get(canonicalId) ?? new Set<string>())],
      hygieneConfidence,
      hygieneNote,
    });
  }

  return groups.sort((left, right) => {
    if (right.mentionCount !== left.mentionCount) {
      return right.mentionCount - left.mentionCount;
    }
    return left.canonicalName.localeCompare(right.canonicalName);
  });
}

function buildEvidenceLedger(args: {
  interviews: ReportInterviewRecord[];
  mentions: MentionRow[];
  relationships: RelationshipRow[];
  entityGroups: ReportEntityRecord[];
  entityMap: Map<string, EntityRow>;
  chunksById: Map<string, ChunkRow>;
  chunksByInterview: Map<string, ChunkRow[]>;
}): ReportEvidenceRecord[] {
  const {
    interviews,
    mentions,
    relationships,
    entityGroups,
    entityMap,
    chunksById,
    chunksByInterview,
  } = args;

  const interviewMap = new Map(interviews.map((interview) => [interview.id, interview]));
  const entityGroupMap = new Map(
    entityGroups.map((entity) => [entity.canonicalEntityId, entity])
  );
  const evidence: Array<Omit<ReportEvidenceRecord, "id">> = [];
  const dedupeKeys = new Set<string>();

  const mentionGroups = new Map<string, MentionRow[]>();
  for (const mention of mentions) {
    const canonicalId = resolveCanonicalEntityId(mention.entity_id, entityMap);
    const key = `${canonicalId}::${mention.interview_id}`;
    const rows = mentionGroups.get(key) ?? [];
    rows.push(mention);
    mentionGroups.set(key, rows);
  }

  const sortedMentionGroups = [...mentionGroups.entries()].sort((left, right) => {
    const [leftCanonicalId] = left[0].split("::");
    const [rightCanonicalId] = right[0].split("::");
    const leftEntity = entityGroupMap.get(leftCanonicalId);
    const rightEntity = entityGroupMap.get(rightCanonicalId);
    return (rightEntity?.mentionCount ?? 0) - (leftEntity?.mentionCount ?? 0);
  });

  for (const [key, rows] of sortedMentionGroups) {
    if (evidence.length >= 18) break;

    const [canonicalId, interviewId] = key.split("::");
    const interview = interviewMap.get(interviewId);
    const entity = entityGroupMap.get(canonicalId);
    if (!interview || !entity) continue;

    const candidate = rows[0];
    const chunk = resolveBestChunk({
      preferredChunkId: candidate.chunk_id,
      chunks: chunksByInterview.get(interviewId) ?? [],
      chunksById,
      snippet: candidate.context,
      searchTerms: entity.aliases,
    });

    const excerpt = chunk
      ? buildExcerpt(chunk.content, candidate.context, entity.aliases)
      : clipText(candidate.context ?? entity.canonicalName, 220);
    const note = candidate.sentiment
      ? `Entity mention with ${candidate.sentiment} sentiment`
      : "Entity mention";

    pushEvidenceRecord(
      evidence,
      dedupeKeys,
      {
        kind: "entity_mention",
        interviewId,
        interviewTitle: interview.title,
        speaker: chunk?.speaker ?? null,
        chunkId: chunk?.id ?? candidate.chunk_id,
        timestamp: formatTimestampRange(chunk?.start_time ?? null, chunk?.end_time ?? null),
        excerpt,
        supportingEntityNames: [entity.canonicalName],
        note,
      }
    );
  }

  const sortedRelationships = [...relationships].sort(
    (left, right) => right.confidence - left.confidence
  );
  for (const relationship of sortedRelationships) {
    if (evidence.length >= 30) break;

    const interview = interviewMap.get(relationship.interview_id);
    if (!interview) continue;

    const sourceCanonicalId = resolveCanonicalEntityId(
      relationship.source_entity_id,
      entityMap
    );
    const targetCanonicalId = resolveCanonicalEntityId(
      relationship.target_entity_id,
      entityMap
    );
    const sourceEntity = entityGroupMap.get(sourceCanonicalId);
    const targetEntity = entityGroupMap.get(targetCanonicalId);

    const searchTerms = [
      ...(sourceEntity?.aliases ?? []),
      ...(targetEntity?.aliases ?? []),
      relationship.evidence_text ?? "",
    ];

    const chunk = resolveBestChunk({
      preferredChunkId: null,
      chunks: chunksByInterview.get(relationship.interview_id) ?? [],
      chunksById,
      snippet: relationship.evidence_text,
      searchTerms,
    });

    const supportingEntityNames = [
      sourceEntity?.canonicalName,
      targetEntity?.canonicalName,
    ].filter((value): value is string => Boolean(value));

    const excerpt = chunk
      ? buildExcerpt(chunk.content, relationship.evidence_text, supportingEntityNames)
      : clipText(
          relationship.evidence_text ??
            `${supportingEntityNames.join(" / ")} ${relationship.relation_type}`,
          220
        );

    pushEvidenceRecord(
      evidence,
      dedupeKeys,
      {
        kind: "relationship",
        interviewId: relationship.interview_id,
        interviewTitle: interview.title,
        speaker: chunk?.speaker ?? null,
        chunkId: chunk?.id ?? null,
        timestamp: formatTimestampRange(chunk?.start_time ?? null, chunk?.end_time ?? null),
        excerpt,
        supportingEntityNames,
        note: `Relationship: ${supportingEntityNames.join(" -> ") || "Unknown entities"} (${relationship.relation_type})`,
      }
    );
  }

  if (evidence.length < 6) {
    for (const interview of interviews) {
      if (!interview.summary) continue;
      if (evidence.length >= 12) break;

      pushEvidenceRecord(
        evidence,
        dedupeKeys,
        {
          kind: "interview_summary",
          interviewId: interview.id,
          interviewTitle: interview.title,
          speaker: null,
          chunkId: null,
          timestamp: null,
          excerpt: clipText(interview.summary, 220),
          supportingEntityNames: [],
          note: "Interview-level summary fallback",
        }
      );
    }
  }

  return evidence.map((item, index) => ({
    id: `EV-${index + 1}`,
    ...item,
  }));
}

function hydrateInsightBlock(
  block: z.infer<typeof InsightBlockSchema>,
  evidenceMap: Map<string, ReportEvidenceRecord>
): ReportInsightBlock | null {
  let supportingEvidenceIds = unique(
    block.evidence_refs.filter((ref) => evidenceMap.has(ref))
  );

  if (supportingEvidenceIds.length === 0 && block.supporting_entities.length > 0) {
    const fallback = [...evidenceMap.values()]
      .filter((item) =>
        item.supportingEntityNames.some((name) =>
          block.supporting_entities.some(
            (supportingEntity) =>
              normalizeEntityName(supportingEntity) === normalizeEntityName(name)
          )
        )
      )
      .slice(0, 2)
      .map((item) => item.id);
    supportingEvidenceIds = unique(fallback);
  }

  if (supportingEvidenceIds.length === 0 && evidenceMap.size > 0) {
    supportingEvidenceIds = [[...evidenceMap.keys()][0]];
  }

  if (supportingEvidenceIds.length === 0) return null;

  const supportInterviewIds = new Set<string>();
  const supportEntityNames = new Set<string>();

  for (const evidenceId of supportingEvidenceIds) {
    const evidence = evidenceMap.get(evidenceId);
    if (!evidence) continue;
    supportInterviewIds.add(evidence.interviewId);
    for (const name of evidence.supportingEntityNames) {
      supportEntityNames.add(name);
    }
  }

  for (const entityName of block.supporting_entities) {
    if (entityName.trim()) supportEntityNames.add(entityName.trim());
  }

  return {
    blockType: block.block_type,
    title: block.title,
    whatWeKnow: block.what_we_know,
    whyItMatters: block.why_it_matters,
    actionOrMonitor: block.action_or_monitor,
    confidence: block.confidence,
    supportingEvidenceIds,
    support: {
      evidenceCount: supportingEvidenceIds.length,
      interviewIds: [...supportInterviewIds],
      entityNames: [...supportEntityNames],
    },
    flaggedUncertainty: block.uncertainty_note,
  };
}

function resolveBestChunk(args: {
  preferredChunkId: string | null;
  chunks: ChunkRow[];
  chunksById: Map<string, ChunkRow>;
  snippet: string | null;
  searchTerms: string[];
}): ChunkRow | null {
  const { preferredChunkId, chunks, chunksById, snippet, searchTerms } = args;

  if (preferredChunkId && chunksById.has(preferredChunkId)) {
    return chunksById.get(preferredChunkId) ?? null;
  }

  const normalizedSnippet = normalizeEntityName(snippet ?? "");
  if (normalizedSnippet) {
    const bySnippet = chunks.find((chunk) =>
      normalizeEntityName(chunk.content).includes(normalizedSnippet)
    );
    if (bySnippet) return bySnippet;
  }

  const normalizedTerms = unique(
    searchTerms
      .map((term) => normalizeEntityName(term))
      .filter((term) => term.length >= 3)
  );
  if (normalizedTerms.length === 0) {
    return chunks[0] ?? null;
  }

  let bestChunk: ChunkRow | null = null;
  let bestScore = -1;

  for (const chunk of chunks) {
    const normalizedContent = normalizeEntityName(chunk.content);
    let score = 0;
    for (const term of normalizedTerms) {
      if (normalizedContent.includes(term)) score += term.length;
    }
    if (score > bestScore) {
      bestScore = score;
      bestChunk = chunk;
    }
  }

  return bestScore > 0 ? bestChunk : (chunks[0] ?? null);
}

function buildExcerpt(
  content: string,
  preferredSnippet: string | null,
  searchTerms: string[]
): string {
  const source = content.replace(/\s+/g, " ").trim();
  if (!source) return "";

  const normalizedSource = normalizeEntityName(source);
  const normalizedSnippet = normalizeEntityName(preferredSnippet ?? "");

  if (normalizedSnippet) {
    const excerpt = clipAround(source, preferredSnippet ?? "", 220);
    if (excerpt) return excerpt;
    if (normalizedSource.includes(normalizedSnippet)) {
      return clipText(source, 220);
    }
  }

  for (const term of searchTerms) {
    const excerpt = clipAround(source, term, 220);
    if (excerpt) return excerpt;
  }

  return clipText(source, 220);
}

function clipAround(text: string, needle: string, limit: number): string | null {
  const index = text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  if (index === -1) return null;

  const start = Math.max(0, index - Math.floor(limit / 3));
  const end = Math.min(text.length, start + limit);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function pushEvidenceRecord(
  target: Array<Omit<ReportEvidenceRecord, "id">>,
  dedupeKeys: Set<string>,
  item: Omit<ReportEvidenceRecord, "id">
): void {
  const dedupeKey = `${item.interviewId}::${normalizeEntityName(item.excerpt)}`;
  if (!item.excerpt.trim() || dedupeKeys.has(dedupeKey)) return;
  dedupeKeys.add(dedupeKey);
  target.push(item);
}

function resolveCanonicalEntityId(
  entityId: string,
  entityMap: Map<string, EntityRow>
): string {
  let currentId = entityId;
  const visited = new Set<string>();

  while (!visited.has(currentId)) {
    visited.add(currentId);
    const entity = entityMap.get(currentId);
    if (!entity?.canonical_entity_id) {
      return currentId;
    }
    currentId = entity.canonical_entity_id;
  }

  return currentId;
}

function metadataNeedsReview(metadata: Record<string, unknown> | null): boolean {
  return Boolean(metadata && typeof metadata === "object" && metadata.needs_review === true);
}

function formatTimestampRange(
  startTime: number | null,
  endTime: number | null
): string | null {
  if (startTime == null && endTime == null) return null;
  if (startTime != null && endTime != null) {
    return `${formatSeconds(startTime)}-${formatSeconds(endTime)}`;
  }
  return formatSeconds(startTime ?? endTime ?? 0);
}

function formatSeconds(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function clipText(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 3).trim()}...`;
}

function unwrapJoined<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
