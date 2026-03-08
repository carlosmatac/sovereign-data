// ============================================
// ETL Pipeline Orchestrator
// ============================================
// Runs after AssemblyAI webhook: Extract -> Chunk -> Embed -> Persist

import { createAdminClient } from "@/lib/supabase/admin";
import { getTranscription } from "./assemblyai";
import { extractIntelligence } from "./extraction";
import { chunkTranscript, chunkPlainText } from "./chunking";
import { generateEmbeddings } from "./embeddings";
import { generateContentSnippets } from "./content-generation";
import type { ChunkMetadata, InterviewStatus } from "@/types/database";
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
  supabase: ReturnType<typeof createAdminClient>,
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

/**
 * Process a completed transcription through the full ETL pipeline.
 *
 * Flow:
 * 1. Fetch transcription from AssemblyAI
 * 2. Save raw transcript
 * 3. Extract structured intelligence (GPT-4o-mini)
 * 4. Chunk transcript (speaker-aware)
 * 5. Generate embeddings
 * 6. Persist chunks + entities to database
 */
export async function processTranscription(
  interviewId: string,
  assemblyaiId: string
): Promise<void> {
  const supabase = createAdminClient();

  try {
    // ── Step 1: Fetch transcription ──────────────────────────────
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

    // Build speaker map and speaker-labeled transcript from utterances
    const speakerMap: Record<string, string> = {};
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

    // Fetch interview metadata for extraction context + transcript display anchors
    const { data: interview } = await supabase
      .from("interviews")
      .select("title, project_id, interviewee_name, interviewee_org, projects(country)")
      .eq("id", interviewId)
      .single();

    const country = (interview?.projects as Record<string, unknown>)?.country as string | undefined;
    const normalizedTranscript = normalizeTranscriptDisplay(formattedTranscript, {
      intervieweeName: interview?.interviewee_name,
      intervieweeOrg: interview?.interviewee_org,
    });

    // Save speaker-formatted raw transcript + cleaned display transcript
    await updateInterviewStatus(interviewId, "EXTRACTING", {
      transcript_full: formattedTranscript,
      transcript_display: normalizedTranscript.transcriptDisplay,
      speaker_map: speakerMap,
      audio_duration: transcription.audio_duration
        ? Math.round(transcription.audio_duration / 1000)
        : null,
    });

    if (normalizedTranscript.stats.replacementsApplied > 0) {
      console.log(
        `Transcript display normalized for ${interviewId}: ${normalizedTranscript.stats.replacementsApplied} replacements`
      );
    }

    // ── Step 2: Extract intelligence ─────────────────────────────

    const extraction = await extractIntelligence({
      transcript: transcription.text,
      interviewTitle: interview?.title ?? "Unknown Interview",
      country,
      speakerMap,
      primaryPerson: interview?.interviewee_name ?? null,
      primaryOrg: interview?.interviewee_org ?? null,
    });

    // Save extraction results
    await updateInterviewStatus(interviewId, "EMBEDDING", {
      summary: extraction.summary,
      sentiment: extraction.sentiment,
      topics: extraction.topics,
    });

    // ── Step 3: Chunk transcript ─────────────────────────────────
    const chunks = transcription.utterances
      ? chunkTranscript(
          transcription.utterances.map((u) => ({
            speaker: u.speaker,
            text: u.text,
            start: u.start,
            end: u.end,
          }))
        )
      : chunkPlainText(transcription.text);

    // ── Step 3b: Anchor-aware chunk normalization ────────────────
    // Prefer anchor enrichment over speculative text replacement.
    // Raw evidence stays in interview_chunks.content (immutable).
    // content_for_embedding carries the anchor-enriched text for
    // embedding generation — raw/normalized text + primary anchors.
    const chunkAnchors = {
      intervieweeName: interview?.interviewee_name ?? null,
      intervieweeOrg: interview?.interviewee_org ?? null,
    };

    const baseMetadata: Partial<ChunkMetadata> = {
      country,
      topics: extraction.topics,
      entities: extraction.entities.map((e) => e.canonical_name),
    };

    const enrichedChunks = chunks.map((chunk) => {
      const normResult = normalizeChunkWithAnchors(chunk.content, chunkAnchors);
      const metadata = buildNormalizedChunkMetadata(
        baseMetadata,
        normResult,
        chunkAnchors
      );
      return { chunk, metadata, normResult };
    });

    // ── Step 4: Generate embeddings ──────────────────────────────
    // Prefer anchor enrichment over speculative text replacement.
    // content_for_embedding = (high-confidence normalized text OR raw text)
    // + structured anchor context (primary interviewee, primary institution).
    const embeddingTexts = enrichedChunks.map((ec) =>
      ec.metadata.content_for_embedding ?? ec.chunk.content
    );
    const embeddings = await generateEmbeddings(embeddingTexts);

    // ── Step 5: Persist chunks ───────────────────────────────────
    const chunkRows = enrichedChunks.map((ec, i) => ({
      interview_id: interviewId,
      chunk_index: ec.chunk.chunkIndex,
      content: ec.chunk.content, // raw evidence — never mutated
      speaker: ec.chunk.speaker,
      start_time: ec.chunk.startTime,
      end_time: ec.chunk.endTime,
      embedding: JSON.stringify(embeddings[i]),
      metadata: ec.metadata,
    }));

    let normAppliedCount = 0;
    for (const ec of enrichedChunks) {
      if (ec.normResult.normalizationApplied) normAppliedCount++;
    }
    if (normAppliedCount > 0) {
      console.log(
        `Anchor normalization applied to ${normAppliedCount}/${enrichedChunks.length} chunks for interview ${interviewId}`
      );
    }

    // Insert in batches of 50 to avoid payload limits
    for (let i = 0; i < chunkRows.length; i += 50) {
      const batch = chunkRows.slice(i, i + 50);
      const { error: chunkError } = await supabase
        .from("interview_chunks")
        .insert(batch);

      if (chunkError) {
        console.error("Failed to insert chunks batch:", chunkError);
        throw chunkError;
      }
    }

    // ── Step 6: Entity resolution (Stage 2 of extraction pipeline) ──
    // Raw entities from GPT carry raw_name + canonical_name.
    // This stage resolves them against interview anchors, existing
    // entities, and aliases — with confidence/method tracking.
    const entityIdMap = new Map<string, string>();
    const projectId = interview?.project_id;

    if (!projectId) {
      throw new Error(`Missing project_id for interview ${interviewId}`);
    }

    const rawEntities: RawExtractedEntity[] = extraction.entities.map((e) => ({
      raw_name: e.raw_name,
      canonical_name: e.canonical_name,
      type: e.type,
      description: e.description,
      sentiment: e.sentiment ?? null,
    }));

    const resolvedEntities = await resolveExtractedEntities({
      rawEntities,
      anchors: {
        intervieweeName: interview?.interviewee_name ?? null,
        intervieweeOrg: interview?.interviewee_org ?? null,
      },
      projectId,
      supabaseClient: supabase,
    });

    const entitiesForGrounding: EntityForGrounding[] = [];

    for (const resolved of resolvedEntities) {
      entityIdMap.set(resolved.resolvedName, resolved.entityId);
      entityIdMap.set(normalizeEntityName(resolved.resolvedName), resolved.entityId);
      // Also register raw_name so relationship lookup works
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

    console.log(
      `Entity resolution: ${resolvedEntities.length} unique entities from ${rawEntities.length} raw mentions (interview ${interviewId})`
    );

    // ── Step 6a: Ground entity mentions to chunks ─────────────────
    // Hybrid strategy: exact → alias → anchor_context → fuzzy.
    // Grounded mentions carry chunk_id + context evidence so chat
    // and reports can surface exact transcript provenance.
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
        intervieweeName: interview?.interviewee_name ?? null,
        intervieweeOrg: interview?.interviewee_org ?? null,
      },
      entityIdMap,
      supabaseClient: supabase,
    });

    // Persist grounded mentions (with chunk_id + context)
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

    // Fallback: interview-level mention for entities with no chunk grounding
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

    // Batch-upsert mentions (ignore duplicates from re-processing)
    for (let i = 0; i < mentionRows.length; i += 50) {
      const batch = mentionRows.slice(i, i + 50);
      const { error: mentionError } = await supabase
        .from("entity_mentions")
        .upsert(batch, { onConflict: "entity_id,interview_id,chunk_id" });

      if (mentionError) {
        console.error("Failed to upsert entity mentions batch:", mentionError);
      }
    }

    if (groundedEntityIds.size > 0) {
      const totalGrounded = mentionRows.filter((r) => r.chunk_id).length;
      console.log(
        `Entity grounding: ${groundedEntityIds.size}/${entitiesForGrounding.length} entities grounded to ${totalGrounded} chunk mentions for interview ${interviewId}`
      );
    }

    // ── Step 6b: Backfill anchor entity IDs into chunk metadata ──
    // Now that entity matching is done, resolve the primary person
    // and org anchors to their canonical entity IDs so chunks carry
    // full provenance for downstream intelligence consumers.
    const personName = interview?.interviewee_name ?? "";
    const orgName = interview?.interviewee_org ?? "";
    const personEntityId =
      entityIdMap.get(personName) ??
      entityIdMap.get(normalizeEntityName(personName)) ??
      null;
    const orgEntityId =
      entityIdMap.get(orgName) ??
      entityIdMap.get(normalizeEntityName(orgName)) ??
      null;

    if (personEntityId || orgEntityId) {
      for (let i = 0; i < chunkRows.length; i += 50) {
        const batch = chunkRows.slice(i, i + 50);
        for (const row of batch) {
          const meta = row.metadata as ChunkMetadata;
          if (personEntityId) meta.primary_person_entity_id = personEntityId;
          if (orgEntityId) meta.primary_org_entity_id = orgEntityId;
        }
      }

      // Batch-update metadata with entity IDs (non-critical — log and continue)
      for (let i = 0; i < chunkRows.length; i += 50) {
        const batch = chunkRows.slice(i, i + 50);
        for (const row of batch) {
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
    }

    // ── Step 7: Persist relationships ────────────────────────────
    for (const rel of extraction.relationships) {
      const sourceId =
        entityIdMap.get(rel.source_name) ??
        entityIdMap.get(normalizeEntityName(rel.source_name));
      const targetId =
        entityIdMap.get(rel.target_name) ??
        entityIdMap.get(normalizeEntityName(rel.target_name));

      if (sourceId && targetId) {
        const { error: relError } = await supabase
          .from("entity_relationships")
          .upsert(
            {
              source_entity_id: sourceId,
              target_entity_id: targetId,
              relation_type: rel.relation_type,
              confidence: rel.confidence,
              evidence_text: rel.evidence_text ?? null,
              interview_id: interviewId,
            },
            {
              onConflict:
                "source_entity_id,target_entity_id,relation_type,interview_id",
            }
          );

        if (relError) {
          console.error("Failed to upsert relationship:", relError);
        }
      }
    }

    // ── Done ─────────────────────────────────────────────────────
    await updateInterviewStatus(interviewId, "COMPLETED");

    console.log(
      `Pipeline completed for interview ${interviewId}: ${chunks.length} chunks, ${resolvedEntities.length} entities (from ${extraction.entities.length} raw), ${extraction.relationships.length} relationships`
    );

    // ── Step 8: Content generation (non-critical) ────────────────
    try {
      const keyQuotes = extraction.sentiment.highlights.map((h) => h.text);
      await generateContentSnippets({
        interviewId,
        title: interview?.title ?? "Unknown Interview",
        summary: extraction.summary,
        topics: extraction.topics,
        country,
        keyQuotes,
      });
    } catch (contentErr) {
      console.error(
        `Content generation failed for ${interviewId} (non-critical):`,
        contentErr
      );
    }
  } catch (error) {
    console.error(`Pipeline failed for interview ${interviewId}:`, error);
    await updateInterviewStatus(interviewId, "FAILED", {
      error_message:
        error instanceof Error ? error.message : "Unknown pipeline error",
    });
  }
}
