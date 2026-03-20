// ============================================
// ETL Pipeline Orchestrator
// ============================================
// Runs after AssemblyAI webhook: Extract -> Chunk -> Embed -> Persist
// Reviewed reprocessing: same intel path from reviewed_utterances only.

import { createAdminClient } from "@/lib/supabase/admin";
import { getTranscription } from "./assemblyai";
import { extractIntelligence, type ExtractionResult } from "./extraction";
import { chunkTranscript, chunkPlainText, type TranscriptUtterance } from "./chunking";
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
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

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
    .from("interviews")
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

function parseReviewedUtterancesJson(json: unknown): TranscriptUtterance[] | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const out: TranscriptUtterance[] = [];
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
 * Shared path: extraction → chunk → embed → persist chunks → resolve → ground → relationships → snippets.
 * @param clearDerivedBeforeInsert — when true, RPC-wipes chunks/mentions/relationships/snippets after embeddings are computed and before chunk insert (reviewed reprocess).
 */
async function runIntelPipelineFromTranscriptInput(params: {
  supabase: SupabaseClient<Database>;
  interviewId: string;
  interview: {
    title: string;
    project_id: string;
    interviewee_name: string | null;
    interviewee_org: string | null;
  };
  country?: string;
  speakerMap: SpeakerMap;
  /** Plain transcript for GPT only. Reviewed pass: derive only from reviewed utterances. */
  extractionTranscript: string;
  chunkUtterances: TranscriptUtterance[];
  reviewerSeedsForExtraction?: Array<{ displayName: string; type: EntityType }>;
  reviewerSeedsForMerge?: Array<{
    display_name: string;
    entity_type: EntityType;
    entity_id: string | null;
  }>;
  clearDerivedBeforeInsert: boolean;
  lastIntelSource: "assemblyai_auto" | "human_review";
}): Promise<void> {
  const {
    supabase,
    interviewId,
    interview,
    country,
    speakerMap,
    extractionTranscript,
    chunkUtterances,
    reviewerSeedsForExtraction,
    reviewerSeedsForMerge,
    clearDerivedBeforeInsert,
    lastIntelSource,
  } = params;

  const extraction = await extractIntelligence({
    transcript: extractionTranscript,
    interviewTitle: interview.title ?? "Unknown Interview",
    country,
    speakerMap,
    primaryPerson: interview.interviewee_name ?? null,
    primaryOrg: interview.interviewee_org ?? null,
    reviewerSeedEntities: reviewerSeedsForExtraction,
  });

  await updateInterviewStatus(interviewId, "EMBEDDING", {
    summary: extraction.summary,
    sentiment: extraction.sentiment,
    topics: extraction.topics,
  });

  const chunks =
    chunkUtterances.length > 0
      ? chunkTranscript(chunkUtterances)
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
    const { error: rpcError } = await supabase.rpc("clear_interview_derived_data", {
      p_interview_id: interviewId,
    });
    if (rpcError) {
      throw new Error(`clear_interview_derived_data failed: ${rpcError.message}`);
    }
  }

  const chunkRows = enrichedChunks.map((ec, i) => ({
    interview_id: interviewId,
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
    const { error: chunkError } = await supabase.from("interview_chunks").insert(batch);
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

  const groundedEntityIds = new Set<string>();
  const mentionRows: Array<{
    entity_id: string;
    interview_id: string;
    chunk_id: string | null;
    context: string | null;
    sentiment: string | null;
  }> = [];

  for (const [entityId, mentions] of groundedMap.entries()) {
    groundedEntityIds.add(entityId);
    for (const gm of mentions) {
      mentionRows.push({
        entity_id: gm.entityId,
        interview_id: interviewId,
        chunk_id: gm.chunkId,
        context: gm.context,
        sentiment: gm.sentiment,
      });
    }
  }

  for (const entity of entitiesForGrounding) {
    if (!groundedEntityIds.has(entity.entityId)) {
      mentionRows.push({
        entity_id: entity.entityId,
        interview_id: interviewId,
        chunk_id: null,
        context: null,
        sentiment: entity.sentiment,
      });
    }
  }

  for (let i = 0; i < mentionRows.length; i += 50) {
    const batch = mentionRows.slice(i, i + 50);
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
    entityIdMap.get(personName) ?? entityIdMap.get(normalizeEntityName(personName)) ?? null;
  const orgEntityId =
    entityIdMap.get(orgName) ?? entityIdMap.get(normalizeEntityName(orgName)) ?? null;

  if (personEntityId || orgEntityId) {
    for (const row of chunkRows) {
      const meta = row.metadata as ChunkMetadata;
      if (personEntityId) meta.primary_person_entity_id = personEntityId;
      if (orgEntityId) meta.primary_org_entity_id = orgEntityId;
    }
    for (const row of chunkRows) {
      const { error: metaError } = await supabase
        .from("interview_chunks")
        .update({ metadata: row.metadata })
        .eq("interview_id", interviewId)
        .eq("chunk_index", row.chunk_index);
      if (metaError) {
        console.error("Failed to backfill anchor entity ID in chunk metadata:", metaError);
      }
    }
  }

  for (const rel of extraction.relationships) {
    const sourceId =
      entityIdMap.get(rel.source_name) ??
      entityIdMap.get(normalizeEntityName(rel.source_name));
    const targetId =
      entityIdMap.get(rel.target_name) ??
      entityIdMap.get(normalizeEntityName(rel.target_name));
    if (sourceId && targetId) {
      const { error: relError } = await supabase.from("entity_relationships").upsert(
        {
          source_entity_id: sourceId,
          target_entity_id: targetId,
          relation_type: rel.relation_type,
          confidence: rel.confidence,
          evidence_text: rel.evidence_text ?? null,
          interview_id: interviewId,
        },
        {
          onConflict: "source_entity_id,target_entity_id,relation_type,interview_id",
        }
      );
      if (relError) {
        console.error("Failed to upsert relationship:", relError);
      }
    }
  }

  await updateInterviewStatus(interviewId, "COMPLETED", {
    last_intel_source: lastIntelSource,
  });

  console.log(
    `Pipeline completed for interview ${interviewId}: ${chunks.length} chunks, ${resolvedEntities.length} entities (from ${rawEntities.length} raw), ${extraction.relationships.length} relationships`
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
      .select("title, project_id, interviewee_name, interviewee_org, projects(country)")
      .eq("id", interviewId)
      .single();

    const country = (interview?.projects as Record<string, unknown>)?.country as
      | string
      | undefined;
    const normalizedTranscript = normalizeTranscriptDisplay(formattedTranscript, {
      intervieweeName: interview?.interviewee_name,
      intervieweeOrg: interview?.interviewee_org,
    });

    await updateInterviewStatus(interviewId, "EXTRACTING", {
      transcript_full: formattedTranscript,
      transcript_display: normalizedTranscript.transcriptDisplay,
      speaker_map: speakerMap,
      audio_duration: transcription.audio_duration
        ? Math.round(transcription.audio_duration)
        : null,
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

    await runIntelPipelineFromTranscriptInput({
      supabase,
      interviewId,
      interview: {
        title: interview.title,
        project_id: interview.project_id,
        interviewee_name: interview.interviewee_name,
        interviewee_org: interview.interviewee_org,
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
 * Failure safety: LLM + embeddings run **before** `clear_interview_derived_data`.
 * If the RPC or inserts fail after clear, the interview can be left without derived rows — surface FAILED + `transcript_review_status: ready` for retry.
 * Full delete+insert in one DB transaction is deferred (see docs).
 */
export async function reprocessInterviewFromReview(interviewId: string): Promise<void> {
  const supabase = createAdminClient();

  try {
    const { data: interview, error: fetchError } = await supabase
      .from("interviews")
      .select(
        "title, project_id, interviewee_name, interviewee_org, speaker_map, reviewed_utterances, transcript_review_status, projects(country)"
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

    const utterances = parseReviewedUtterancesJson(interview.reviewed_utterances);
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
      .from("interviews")
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

    await runIntelPipelineFromTranscriptInput({
      supabase,
      interviewId,
      interview: {
        title: interview.title,
        project_id: interview.project_id,
        interviewee_name: interview.interviewee_name,
        interviewee_org: interview.interviewee_org,
      },
      country,
      speakerMap: (interview.speaker_map as SpeakerMap) ?? {},
      extractionTranscript,
      chunkUtterances: utterances,
      reviewerSeedsForExtraction,
      reviewerSeedsForMerge: seeds,
      clearDerivedBeforeInsert: true,
      lastIntelSource: "human_review",
    });

    await supabase
      .from("interviews")
      .update({ transcript_review_status: "draft" })
      .eq("id", interviewId);
  } catch (error) {
    console.error(`Review reprocess failed for interview ${interviewId}:`, error);
    await supabase
      .from("interviews")
      .update({
        status: "FAILED",
        transcript_review_status: "ready",
        error_message: toErrorMessage(error),
      })
      .eq("id", interviewId);
  }
}
