// ============================================
// ETL Pipeline Orchestrator
// ============================================
// Runs after AssemblyAI webhook: Extract -> Chunk -> Embed -> Persist
// Reviewed reprocessing: same intel path from reviewed_utterances only.

import { createAdminClient } from "@/lib/supabase/admin";
import { getTranscription } from "./assemblyai";
import { extractIntelligence, type ExtractionResult } from "./extraction";
import { chunkTranscript, chunkPlainText, type TranscriptUtterance } from "./chunking";
import { chunkTextInterview, type TextStructureType } from "./chunking-text-interview";
import { generateEmbeddings } from "./embeddings";
import { generateContentSnippets } from "./content-generation";
import type { ChunkMetadata, EntityType, InterviewStatus, SpeakerMap } from "@/types/database";
import { normalizeEntityName } from "@/lib/entities/normalize";
import { normalizeTranscriptDisplay } from "@/lib/transcript/normalizeDisplay";
import {
  normalizeChunkWithAnchors,
  buildNormalizedChunkMetadata,
} from "@/lib/chunks/anchor-normalization";
import {
  groundEntityMentions,
  type EntityForGrounding,
  type ChunkForGrounding,
} from "@/lib/entities/ground-mentions";
import {
  resolveExtractedEntities,
  type RawExtractedEntity,
} from "@/lib/entities/resolve";
import { applyPersistenceGate, relationshipKey } from "@/lib/ai/persistence-gate";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { formatUtterancesToTranscriptFull } from "@/lib/interviews/transcript-utterances-from-full";

/** Extract a human-readable message from any thrown value (Error or Supabase PostgrestError). */
function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as Record<string, unknown>).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return String(error);
}

/**
 * Update interview status in the database.
 * Uses admin client (bypasses RLS) since this runs from webhooks.
 */
async function updateInterviewStatus(
  interviewId: string,
  status: InterviewStatus,
  extra?: Record<string, unknown>
) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("sources")
    .update({ status, ...extra })
    .eq("id", interviewId);

  if (error) {
    console.error(`Failed to update interview ${interviewId} to ${status}:`, error);
  }
}

async function markEntityNeedsReview(
  supabase: SupabaseClient<Database>,
  entityId: string
) {
  const { data: existing, error: fetchError } = await supabase
    .from("entities")
    .select("metadata")
    .eq("id", entityId)
    .maybeSingle<{ metadata: Record<string, unknown> | null }>();

  if (fetchError) {
    console.error("Failed to fetch entity metadata for review flag:", fetchError);
    return;
  }

  const metadata = {
    ...(existing?.metadata ?? {}),
    needs_review: true,
    review_source: "entity_normalization",
  };

  const { error: updateError } = await supabase
    .from("entities")
    .update({ metadata })
    .eq("id", entityId);

  if (updateError) {
    console.error("Failed to update entity metadata with needs_review flag:", updateError);
  }
}

function buildRawEntitiesWithReviewerSeeds(
  extraction: ExtractionResult,
  seeds: Array<{
    display_name: string;
    entity_type: EntityType;
    entity_id: string | null;
  }>
): RawExtractedEntity[] {
  const rawFromModel: RawExtractedEntity[] = extraction.entities.map((e) => ({
    raw_name: e.raw_name,
    canonical_name: e.canonical_name,
    type: e.type,
    description: e.description,
    sentiment: e.sentiment ?? null,
  }));

  const covered = new Set<string>();
  for (const e of rawFromModel) {
    covered.add(normalizeEntityName(e.canonical_name));
    covered.add(normalizeEntityName(e.raw_name));
  }

  const merged = [...rawFromModel];
  for (const s of seeds) {
    const n = normalizeEntityName(s.display_name);
    if (covered.has(n)) continue;
    covered.add(n);
    merged.push({
      raw_name: s.display_name,
      canonical_name: s.display_name,
      type: s.entity_type,
      description: "Human-confirmed entity from transcript review (pre-reprocess).",
      sentiment: null,
      forcedEntityId: s.entity_id ?? undefined,
    });
  }
  return merged;
}

/** Parse reviewed JSON rows (speaker, text, start, end). */
function parseRawReviewedUtterancesForChunking(json: unknown): Array<{
  speaker: string;
  text: string;
  start: number;
  end: number;
}> | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const out: Array<{ speaker: string; text: string; start: number; end: number }> = [];
  for (const row of json) {
    if (typeof row !== "object" || row === null) return null;
    const o = row as Record<string, unknown>;
    if (
      typeof o.speaker !== "string" ||
      typeof o.text !== "string" ||
      typeof o.start !== "number" ||
      typeof o.end !== "number"
    ) {
      return null;
    }
    out.push({
      speaker: o.speaker,
      text: o.text,
      start: o.start,
      end: o.end,
    });
  }
  return out;
}

/**
 * `reviewed_utterances` stores **seconds** (editor + playback). Chunking expects **ms**.
 * Legacy rows may still hold ms (large end values); use `audio_duration` to disambiguate.
 */
function parseReviewedUtterancesJson(
  json: unknown,
  audioDurationSec: number | null
): TranscriptUtterance[] | null {
  const raw = parseRawReviewedUtterancesForChunking(json);
  if (!raw) return null;

  const maxEnd = Math.max(0, ...raw.map((u) => u.end));
  const dur = audioDurationSec != null && audioDurationSec > 0 ? audioDurationSec : null;

  const storedInSeconds =
    (dur != null && maxEnd <= dur + 300) ||
    (dur != null && maxEnd <= Math.max(dur * 2, 90)) ||
    (dur == null && maxEnd <= 86_400);

  return raw.map((u) => ({
    speaker: u.speaker,
    text: u.text,
    start: storedInSeconds ? u.start * 1000 : u.start,
    end: storedInSeconds ? u.end * 1000 : u.end,
  }));
}

// ── fetchCandidateEntities ─────────────────────────────────────────────────

/**
 * Build a shortlist of known project entities to pass to extractIntelligence
 * as reference context, improving entity matching and reducing duplicates.
 *
 * Priority:
 * 1. Explicit anchor entities (interviewee + org, by entity_id if available)
 * 2. Most-mentioned project entities (by entity_mention count)
 * 3. Global fallback when project has <5 own entities
 */
async function fetchCandidateEntities(
  supabase: SupabaseClient<Database>,
  params: {
    projectId: string;
    anchors: {
      intervieweeName: string | null;
      intervieweeOrg: string | null;
      intervieweeEntityId?: string | null;
      intervieweeOrgEntityId?: string | null;
    };
    limit?: number;
    maxAliasesPerEntity?: number;
  }
): Promise<Array<{ name: string; type: EntityType; aliases: string[] }>> {
  const { projectId, anchors, limit = 28, maxAliasesPerEntity = 2 } = params;
  const hardMax = Math.min(limit, 30);

  const result: Array<{ id: string; name: string; type: EntityType }> = [];
  const addedIds = new Set<string>();

  // Step 1: anchor entities by ID (always first)
  const anchorIds = [
    anchors.intervieweeEntityId,
    anchors.intervieweeOrgEntityId,
  ].filter(Boolean) as string[];

  if (anchorIds.length > 0) {
    const { data: anchorEntities } = await supabase
      .from("entities")
      .select("id, name, type")
      .in("id", anchorIds);

    for (const e of anchorEntities ?? []) {
      if (!addedIds.has(e.id)) {
        result.push({ id: e.id, name: e.name, type: e.type as EntityType });
        addedIds.add(e.id);
      }
    }
  }

  // Step 2: most-mentioned project entities
  const remaining = hardMax - result.length;
  if (remaining > 0) {
    const { data: mentionData } = await supabase
      .from("entity_mentions")
      .select("entity_id, entities!inner(id, name, type, project_id)")
      .in(
        "interview_id",
        (
          await supabase
            .from("interviews")
            .select("id")
            .eq("project_id", projectId)
        ).data?.map((i) => i.id) ?? []
      )
      .limit(500);

    // Aggregate by entity_id
    const countMap = new Map<string, { name: string; type: string; projectId: string | null; count: number }>();
    for (const row of mentionData ?? []) {
      const ent = row.entities as unknown as { id: string; name: string; type: string; project_id: string | null };
      if (!ent) continue;
      const existing = countMap.get(ent.id);
      if (existing) {
        existing.count++;
      } else {
        countMap.set(ent.id, { name: ent.name, type: ent.type, projectId: ent.project_id, count: 1 });
      }
    }

    const sorted = [...countMap.entries()]
      .filter(([id]) => !addedIds.has(id))
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, remaining);

    for (const [id, { name, type }] of sorted) {
      result.push({ id, name, type: type as EntityType });
      addedIds.add(id);
    }

    // Step 3: global fallback when project has <5 own entities
    const ownEntitiesCount = [...countMap.values()].filter(
      (e) => e.projectId === projectId
    ).length;
    if (ownEntitiesCount < 5) {
      const globalRemaining = hardMax - result.length;
      if (globalRemaining > 0) {
        const { data: globalEntities } = await supabase
          .from("entities")
          .select("id, name, type")
          .is("project_id", null)
          .limit(globalRemaining + addedIds.size);

        for (const e of globalEntities ?? []) {
          if (!addedIds.has(e.id) && result.length < hardMax) {
            result.push({ id: e.id, name: e.name, type: e.type as EntityType });
            addedIds.add(e.id);
          }
        }
      }
    }
  }

  // Step 4: fetch aliases for each entity
  const withAliases: Array<{ name: string; type: EntityType; aliases: string[] }> = [];
  for (const entity of result) {
    const { data: aliasRows } = await supabase
      .from("entity_aliases")
      .select("alias_normalized")
      .eq("entity_id", entity.id)
      .order("created_at", { ascending: false })
      .limit(maxAliasesPerEntity);

    withAliases.push({
      name: entity.name,
      type: entity.type,
      aliases: (aliasRows ?? []).map((a) => a.alias_normalized).filter(Boolean),
    });
  }

  return withAliases;
}

/**
 * Shared path: extraction → chunk → embed → persist chunks → resolve → ground → relationships → snippets.
 * Handles audio (chunkUtterances present), PDF/text (chunkUtterances empty → chunkPlainText), and
 * reviewed reprocess (clearDerivedBeforeInsert: true).
 * @param clearDerivedBeforeInsert — when true, RPC-wipes chunks/mentions/relationships/snippets after embeddings are computed and before chunk insert (reviewed reprocess).
 */
export async function runIntelPipelineFromCanonicalSource(params: {
  supabase: SupabaseClient<Database>;
  interviewId: string;
  interview: {
    title: string;
    project_id: string;
    interviewee_name: string | null;
    interviewee_org: string | null;
    interviewee_entity_id?: string | null;
    interviewee_org_entity_id?: string | null;
  };
  country?: string;
  speakerMap: SpeakerMap;
  /** Plain transcript for GPT only. Reviewed pass: derive only from reviewed utterances. */
  extractionTranscript: string;
  chunkUtterances: TranscriptUtterance[];
  /** Source type from DB — controls which chunking strategy is used. Defaults to 'audio'. */
  sourceType?: "audio" | "document" | "text";
  /** Semantic category used for prompt overlay in extraction. */
  semanticSourceType?: string;
  /** Optional structure hint for text sources (auto-detected when absent). */
  sourceMetadata?: Record<string, unknown>;
  reviewerSeedsForExtraction?: Array<{ displayName: string; type: EntityType }>;
  reviewerSeedsForMerge?: Array<{
    display_name: string;
    entity_type: EntityType;
    entity_id: string | null;
  }>;
  clearDerivedBeforeInsert: boolean;
  lastIntelSource: "assemblyai_auto" | "human_review" | "direct_ingest";
  /** Merged into the final COMPLETED row update (e.g. transcript_review_status for human review). */
  completedInterviewExtra?: Record<string, unknown>;
}): Promise<void> {
  const {
    supabase,
    interviewId,
    interview,
    country,
    speakerMap,
    extractionTranscript,
    chunkUtterances,
    sourceType = "audio",
    semanticSourceType = "interview",
    sourceMetadata,
    reviewerSeedsForExtraction,
    reviewerSeedsForMerge,
    clearDerivedBeforeInsert,
    lastIntelSource,
    completedInterviewExtra,
  } = params;

  // Fetch candidate entities from the project to improve extraction matching
  const candidateEntities = await fetchCandidateEntities(supabase, {
    projectId: interview.project_id,
    anchors: {
      intervieweeName: interview.interviewee_name ?? null,
      intervieweeOrg: interview.interviewee_org ?? null,
      intervieweeEntityId: interview.interviewee_entity_id,
      intervieweeOrgEntityId: interview.interviewee_org_entity_id,
    },
  });

  const extraction = await extractIntelligence({
    transcript: extractionTranscript,
    interviewTitle: interview.title ?? "Unknown Interview",
    country,
    speakerMap,
    primaryPerson: interview.interviewee_name ?? null,
    primaryOrg: interview.interviewee_org ?? null,
    reviewerSeedEntities: reviewerSeedsForExtraction,
    sourceType,
    semanticSourceType,
    candidateEntities: candidateEntities.length > 0 ? candidateEntities : undefined,
  });

  await updateInterviewStatus(interviewId, "EMBEDDING", {
    summary: extraction.summary,
    sentiment: extraction.sentiment,
    topics: extraction.topics,
  });

  const chunks =
    chunkUtterances.length > 0
      ? chunkTranscript(chunkUtterances)
      : sourceType === "text"
        ? chunkTextInterview(
            extractionTranscript,
            sourceMetadata?.structure_type as TextStructureType | undefined
          )
        : chunkPlainText(extractionTranscript);

  const chunkAnchors = {
    intervieweeName: interview.interviewee_name ?? null,
    intervieweeOrg: interview.interviewee_org ?? null,
  };

  const baseMetadata: Partial<ChunkMetadata> = {
    country,
    topics: extraction.topics,
    entities: extraction.entities.map((e) => e.canonical_name),
  };

  const enrichedChunks = chunks.map((chunk) => {
    const normResult = normalizeChunkWithAnchors(chunk.content, chunkAnchors);
    const metadata = buildNormalizedChunkMetadata(baseMetadata, normResult, chunkAnchors);
    return { chunk, metadata, normResult };
  });

  const embeddingTexts = enrichedChunks.map((ec) =>
    ec.metadata.content_for_embedding ?? ec.chunk.content
  );
  const embeddings = await generateEmbeddings(embeddingTexts);

  if (clearDerivedBeforeInsert) {
    const { error: rpcError } = await supabase.rpc("clear_source_derived_data", {
      p_source_id: interviewId,
    });
    if (rpcError) {
      throw new Error(`clear_source_derived_data failed: ${rpcError.message}`);
    }
  }

  // Editorial suppression: any (source, target, relation_type) the user has
  // previously rejected on this interview must NOT be re-inserted by the LLM.
  // The clear-RPC keeps these rows alive on reprocess; we read them so the
  // persistence gate can drop matching new rows before upsert.
  // See docs/features/on-going/editable-relationship-governance.md
  const { data: rejectedRows, error: rejectedError } = await supabase
    .from("entity_relationships")
    .select("source_entity_id, target_entity_id, relation_type")
    .eq("interview_id", interviewId)
    .eq("review_status", "rejected");

  if (rejectedError) {
    console.error("Failed to load rejected relationship suppression list:", rejectedError);
  }

  const rejectedRelationshipKeys = new Set<string>(
    (rejectedRows ?? []).map((r) =>
      relationshipKey(r.source_entity_id, r.target_entity_id, r.relation_type)
    )
  );

  const chunkRows = enrichedChunks.map((ec, i) => ({
    source_id: interviewId,
    chunk_index: ec.chunk.chunkIndex,
    content: ec.chunk.content,
    speaker: ec.chunk.speaker,
    start_time: ec.chunk.startTime,
    end_time: ec.chunk.endTime,
    embedding: JSON.stringify(embeddings[i]),
    metadata: ec.metadata,
  }));

  for (let i = 0; i < chunkRows.length; i += 50) {
    const batch = chunkRows.slice(i, i + 50);
    const { error: chunkError } = await supabase.from("source_chunks").insert(batch);
    if (chunkError) {
      console.error("Failed to insert chunks batch:", chunkError);
      throw chunkError;
    }
  }

  const projectId = interview.project_id;
  const rawEntities = buildRawEntitiesWithReviewerSeeds(
    extraction,
    reviewerSeedsForMerge ?? []
  );

  const resolvedEntities = await resolveExtractedEntities({
    rawEntities,
    anchors: {
      intervieweeName: interview.interviewee_name ?? null,
      intervieweeOrg: interview.interviewee_org ?? null,
    },
    projectId,
    supabaseClient: supabase,
  });

  const entityIdMap = new Map<string, string>();
  const entitiesForGrounding: EntityForGrounding[] = [];

  for (const resolved of resolvedEntities) {
    entityIdMap.set(resolved.resolvedName, resolved.entityId);
    entityIdMap.set(normalizeEntityName(resolved.resolvedName), resolved.entityId);
    if (resolved.rawName) {
      entityIdMap.set(resolved.rawName, resolved.entityId);
      entityIdMap.set(normalizeEntityName(resolved.rawName), resolved.entityId);
    }
    entitiesForGrounding.push({
      name: resolved.resolvedName,
      entityId: resolved.entityId,
      sentiment: resolved.sentiment,
    });
    if (resolved.needsReview) {
      await markEntityNeedsReview(supabase, resolved.entityId);
    }
  }

  if (interview.interviewee_entity_id && interview.interviewee_name?.trim()) {
    const n = interview.interviewee_name.trim();
    entityIdMap.set(n, interview.interviewee_entity_id);
    entityIdMap.set(normalizeEntityName(n), interview.interviewee_entity_id);
  }
  if (interview.interviewee_org_entity_id && interview.interviewee_org?.trim()) {
    const n = interview.interviewee_org.trim();
    entityIdMap.set(n, interview.interviewee_org_entity_id);
    entityIdMap.set(normalizeEntityName(n), interview.interviewee_org_entity_id);
  }

  const { data: persistedChunks } = await supabase
    .from("interview_chunks")
    .select("id, chunk_index, content, speaker")
    .eq("interview_id", interviewId)
    .order("chunk_index");

  const chunksForGrounding: ChunkForGrounding[] = (persistedChunks ?? []).map((c) => ({
    id: c.id,
    chunkIndex: c.chunk_index,
    content: c.content,
    speaker: c.speaker,
  }));

  const groundedMap = await groundEntityMentions({
    entities: entitiesForGrounding,
    chunks: chunksForGrounding,
    anchors: {
      intervieweeName: interview.interviewee_name ?? null,
      intervieweeOrg: interview.interviewee_org ?? null,
    },
    entityIdMap,
    supabaseClient: supabase,
  });

  // Persistence gate: only `exact`/`alias` grounded mentions are written,
  // and only relationships whose endpoints survived the gate are written.
  // Silent `chunk_id = null` fallback is intentionally gone.
  const gated = applyPersistenceGate({
    interviewId,
    entitiesForGrounding,
    groundedMap,
    relationships: extraction.relationships,
    entityIdMap,
    rejectedRelationshipKeys,
  });

  for (let i = 0; i < gated.mentionRows.length; i += 50) {
    const batch = gated.mentionRows.slice(i, i + 50);
    const { error: mentionError } = await supabase
      .from("entity_mentions")
      .upsert(batch, { onConflict: "entity_id,interview_id,chunk_id" });
    if (mentionError) {
      console.error("Failed to upsert entity mentions batch:", mentionError);
    }
  }

  const personName = interview.interviewee_name ?? "";
  const orgName = interview.interviewee_org ?? "";
  const personEntityId =
    interview.interviewee_entity_id ??
    (personName
      ? entityIdMap.get(personName) ??
        entityIdMap.get(normalizeEntityName(personName)) ??
        null
      : null);
  const orgEntityId =
    interview.interviewee_org_entity_id ??
    (orgName
      ? entityIdMap.get(orgName) ??
        entityIdMap.get(normalizeEntityName(orgName)) ??
        null
      : null);

  if (personEntityId || orgEntityId) {
    for (const row of chunkRows) {
      const meta = row.metadata as ChunkMetadata;
      if (personEntityId) meta.primary_person_entity_id = personEntityId;
      if (orgEntityId) meta.primary_org_entity_id = orgEntityId;
    }
    for (const row of chunkRows) {
      const { error: metaError } = await supabase
        .from("source_chunks")
        .update({ metadata: row.metadata })
        .eq("source_id", interviewId)
        .eq("chunk_index", row.chunk_index);
      if (metaError) {
        console.error("Failed to backfill anchor entity ID in chunk metadata:", metaError);
      }
    }
  }

  for (const row of gated.relationshipRows) {
    // `ignoreDuplicates: true` guarantees that a row already carrying any
    // editorial state (approved / rejected / human_edited / human_created)
    // is never overwritten by a fresh LLM pass. Rejected rows are also
    // pre-filtered upstream by the persistence gate; this is belt + braces
    // for approved / human_edited triples that the LLM may legitimately
    // re-extract on reprocess.
    const { error: relError } = await supabase.from("entity_relationships").upsert(
      { ...row, origin: "llm", review_status: "pending" },
      {
        onConflict: "source_entity_id,target_entity_id,relation_type,interview_id",
        ignoreDuplicates: true,
      }
    );
    if (relError) {
      console.error("Failed to upsert relationship:", relError);
    }
  }

  const completedPatch: Record<string, unknown> = {
    last_intel_source: lastIntelSource,
    ...completedInterviewExtra,
  };

  if (lastIntelSource === "human_review" && chunkUtterances.length > 0) {
    const formattedReviewed = formatUtterancesToTranscriptFull(
      chunkUtterances,
      speakerMap
    );
    const normalizedReviewed = normalizeTranscriptDisplay(formattedReviewed, {
      intervieweeName: interview.interviewee_name,
      intervieweeOrg: interview.interviewee_org,
    });
    completedPatch.transcript_display = normalizedReviewed.transcriptDisplay;
  }

  await updateInterviewStatus(interviewId, "COMPLETED", completedPatch);

  console.log(
    `Pipeline completed for interview ${interviewId}: ${chunks.length} chunks, ${resolvedEntities.length} resolved entities (from ${rawEntities.length} raw), ` +
      `persistence gate kept ${gated.stats.persistedEntities}/${gated.stats.totalEntities} entities ` +
      `(ungrounded=${gated.stats.ungrounded}, dropped_by_policy=${gated.stats.droppedByPolicy}), ` +
      `relationships kept=${gated.stats.relationshipsKept} dropped=${gated.stats.relationshipsDropped}`
  );

  try {
    const keyQuotes = extraction.sentiment.highlights.map((h) => h.text);
    await generateContentSnippets({
      interviewId,
      title: interview.title ?? "Unknown Interview",
      summary: extraction.summary,
      topics: extraction.topics,
      country,
      keyQuotes,
    });
  } catch (contentErr) {
    console.error(`Content generation failed for ${interviewId} (non-critical):`, contentErr);
  }
}

/**
 * Process a completed transcription through the full ETL pipeline.
 */
export async function processTranscription(
  interviewId: string,
  assemblyaiId: string
): Promise<void> {
  const supabase = createAdminClient();

  try {
    const transcription = await getTranscription(assemblyaiId);

    if (transcription.status === "error") {
      await updateInterviewStatus(interviewId, "FAILED", {
        error_message: transcription.error ?? "Transcription failed",
      });
      return;
    }

    if (!transcription.text) {
      await updateInterviewStatus(interviewId, "FAILED", {
        error_message: "Empty transcription returned",
      });
      return;
    }

    const speakerMap: SpeakerMap = {};
    let formattedTranscript = transcription.text;

    if (transcription.utterances && transcription.utterances.length > 0) {
      const speakers = new Set(transcription.utterances.map((u) => u.speaker));
      speakers.forEach((s) => {
        speakerMap[s] = `Speaker ${s}`;
      });
      formattedTranscript = transcription.utterances
        .map((u) => `[${speakerMap[u.speaker]}]: ${u.text}`)
        .join("\n\n");
    }

    const { data: interview } = await supabase
      .from("interviews")
      .select(
        "title, project_id, interviewee_name, interviewee_org, interviewee_entity_id, interviewee_org_entity_id, projects(country)"
      )
      .eq("id", interviewId)
      .single();

    const country = (interview?.projects as Record<string, unknown>)?.country as
      | string
      | undefined;
    const normalizedTranscript = normalizeTranscriptDisplay(formattedTranscript, {
      intervieweeName: interview?.interviewee_name,
      intervieweeOrg: interview?.interviewee_org,
    });

    const sourceUtterances =
      transcription.utterances && transcription.utterances.length > 0
        ? transcription.utterances.map((u) => ({
            speaker: u.speaker,
            text: u.text,
            start: u.start,
            end: u.end,
          }))
        : null;

    await updateInterviewStatus(interviewId, "EXTRACTING", {
      transcript_full: formattedTranscript,
      transcript_display: normalizedTranscript.transcriptDisplay,
      speaker_map: speakerMap,
      audio_duration: transcription.audio_duration
        ? Math.round(transcription.audio_duration)
        : null,
      source_utterances: sourceUtterances,
    });

    if (normalizedTranscript.stats.replacementsApplied > 0) {
      console.log(
        `Transcript display normalized for ${interviewId}: ${normalizedTranscript.stats.replacementsApplied} replacements`
      );
    }

    if (!interview?.project_id) {
      throw new Error(`Missing project_id for interview ${interviewId}`);
    }

    const chunkUtterances: TranscriptUtterance[] = transcription.utterances
      ? transcription.utterances.map((u) => ({
          speaker: u.speaker,
          text: u.text,
          start: u.start,
          end: u.end,
        }))
      : [];

    await runIntelPipelineFromCanonicalSource({
      supabase,
      interviewId,
      interview: {
        title: interview.title,
        project_id: interview.project_id,
        interviewee_name: interview.interviewee_name,
        interviewee_org: interview.interviewee_org,
        interviewee_entity_id: interview.interviewee_entity_id,
        interviewee_org_entity_id: interview.interviewee_org_entity_id,
      },
      country,
      speakerMap,
      extractionTranscript: transcription.text,
      chunkUtterances,
      clearDerivedBeforeInsert: false,
      lastIntelSource: "assemblyai_auto",
    });
  } catch (error) {
    console.error(`Pipeline failed for interview ${interviewId}:`, error);
    await updateInterviewStatus(interviewId, "FAILED", {
      error_message: toErrorMessage(error),
    });
  }
}

/**
 * Rebuild chunks, mentions, relationships, and snippets from `reviewed_utterances` only.
 * Triggered when an editor POSTs `/api/interviews/[id]/reprocess-review` (after `transcript_review_status = ready`).
 *
 * Failure safety: LLM + embeddings run **before** `clear_source_derived_data`.
 * If the RPC or inserts fail after clear, the interview can be left without derived rows — surface FAILED + `transcript_review_status: ready` for retry.
 * Full delete+insert in one DB transaction is deferred (see docs).
 */
export async function reprocessInterviewFromReview(interviewId: string): Promise<void> {
  const supabase = createAdminClient();

  try {
    const { data: interview, error: fetchError } = await supabase
      .from("interviews")
      .select(
        "title, project_id, interviewee_name, interviewee_org, interviewee_entity_id, interviewee_org_entity_id, speaker_map, reviewed_utterances, transcript_review_status, audio_duration, projects(country)"
      )
      .eq("id", interviewId)
      .single();

    if (fetchError || !interview) {
      throw new Error(fetchError?.message ?? "Interview not found");
    }

    if (interview.transcript_review_status !== "ready") {
      throw new Error(
        `Review reprocessing requires transcript_review_status=ready (current: ${interview.transcript_review_status})`
      );
    }

    const utterances = parseReviewedUtterancesJson(
      interview.reviewed_utterances,
      interview.audio_duration
    );
    if (!utterances) {
      throw new Error("reviewed_utterances is missing or invalid");
    }

    const extractionTranscript = utterances.map((u) => u.text).join("\n");

    const { data: seedRows, error: seedsError } = await supabase
      .from("interview_review_entities")
      .select("display_name, entity_type, entity_id")
      .eq("interview_id", interviewId);

    if (seedsError) {
      throw new Error(`Failed to load review seeds: ${seedsError.message}`);
    }

    const seeds =
      seedRows?.map((r) => ({
        display_name: r.display_name,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
      })) ?? [];

    const reviewerSeedsForExtraction = seeds.map((s) => ({
      displayName: s.display_name,
      type: s.entity_type,
    }));

    await supabase
      .from("sources")
      .update({
        status: "EXTRACTING",
        transcript_review_status: "reprocessing",
        error_message: null,
      })
      .eq("id", interviewId);

    const country = (interview.projects as Record<string, unknown>)?.country as string | undefined;

    if (!interview.project_id) {
      throw new Error(`Missing project_id for interview ${interviewId}`);
    }

    await runIntelPipelineFromCanonicalSource({
      supabase,
      interviewId,
      interview: {
        title: interview.title,
        project_id: interview.project_id,
        interviewee_name: interview.interviewee_name,
        interviewee_org: interview.interviewee_org,
        interviewee_entity_id: interview.interviewee_entity_id,
        interviewee_org_entity_id: interview.interviewee_org_entity_id,
      },
      country,
      speakerMap: (interview.speaker_map as SpeakerMap) ?? {},
      extractionTranscript,
      chunkUtterances: utterances,
      reviewerSeedsForExtraction,
      reviewerSeedsForMerge: seeds,
      clearDerivedBeforeInsert: true,
      lastIntelSource: "human_review",
      // Single COMPLETED write so Realtime + refresh see draft, not stuck "reprocessing"
      completedInterviewExtra: { transcript_review_status: "draft" },
    });
  } catch (error) {
    console.error(`Review reprocess failed for interview ${interviewId}:`, error);
    await supabase
      .from("sources")
      .update({
        status: "FAILED",
        transcript_review_status: "ready",
        error_message: toErrorMessage(error),
      })
      .eq("id", interviewId);
  }
}
