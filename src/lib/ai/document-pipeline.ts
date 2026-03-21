// ============================================
// Document (PDF) Pipeline Orchestrator
// ============================================
// Processes PDF/document interviews through the intelligence pipeline.
// Enters at EXTRACTING — bypasses AssemblyAI transcription entirely.
// Mirrors the audio pipeline structure but works on already-extracted text.

import { createAdminClient } from "@/lib/supabase/admin";
import { extractIntelligence } from "./extraction";
import { chunkPlainText } from "./chunking";
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
    console.error(
      `Failed to update interview ${interviewId} to ${status}:`,
      error
    );
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
    console.error(
      "Failed to fetch entity metadata for review flag:",
      fetchError
    );
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
    console.error(
      "Failed to update entity metadata with needs_review flag:",
      updateError
    );
  }
}

/**
 * Process a PDF/document interview through the full intelligence pipeline.
 *
 * Enters at EXTRACTING (skips TRANSCRIBING — no audio to process).
 *
 * Flow:
 * 1. Save extracted text as transcript
 * 2. Extract structured intelligence (GPT-4o-mini)
 * 3. Chunk plain text
 * 4. Anchor-aware normalization
 * 5. Generate embeddings
 * 6. Persist chunks + entities
 * 7. Entity grounding
 * 8. Persist relationships
 * 9. Content snippets (non-critical)
 */
export async function processDocument(
  interviewId: string,
  plainText: string
): Promise<void> {
  const supabase = createAdminClient();

  try {
    // Fetch interview metadata for extraction context + display normalization
    const { data: interview } = await supabase
      .from("interviews")
      .select(
        "title, project_id, interviewee_name, interviewee_org, interviewee_entity_id, interviewee_org_entity_id, projects(country)"
      )
      .eq("id", interviewId)
      .single();

    const country = (interview?.projects as Record<string, unknown>)
      ?.country as string | undefined;

    const normalizedTranscript = normalizeTranscriptDisplay(plainText, {
      intervieweeName: interview?.interviewee_name,
      intervieweeOrg: interview?.interviewee_org,
    });

    // Save transcript (no speaker map, no audio duration for document sources)
    await updateInterviewStatus(interviewId, "EXTRACTING", {
      transcript_full: plainText,
      transcript_display: normalizedTranscript.transcriptDisplay,
      speaker_map: {},
      audio_duration: null,
    });

    if (normalizedTranscript.stats.replacementsApplied > 0) {
      console.log(
        `Transcript display normalized for ${interviewId}: ${normalizedTranscript.stats.replacementsApplied} replacements`
      );
    }

    // ── Step 1: Extract intelligence ─────────────────────────────
    const extraction = await extractIntelligence({
      transcript: plainText,
      interviewTitle: interview?.title ?? "Unknown Interview",
      country,
      speakerMap: {},
      primaryPerson: interview?.interviewee_name ?? null,
      primaryOrg: interview?.interviewee_org ?? null,
    });

    await updateInterviewStatus(interviewId, "EMBEDDING", {
      summary: extraction.summary,
      sentiment: extraction.sentiment,
      topics: extraction.topics,
    });

    // ── Step 2: Chunk plain text ──────────────────────────────────
    const chunks = chunkPlainText(plainText);

    // ── Step 3: Anchor-aware chunk normalization ──────────────────
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
    const embeddingTexts = enrichedChunks.map(
      (ec) => ec.metadata.content_for_embedding ?? ec.chunk.content
    );
    const embeddings = await generateEmbeddings(embeddingTexts);

    // ── Step 5: Persist chunks ───────────────────────────────────
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
      const { error: chunkError } = await supabase
        .from("interview_chunks")
        .insert(batch);

      if (chunkError) {
        console.error("Failed to insert chunks batch:", chunkError);
        throw chunkError;
      }
    }

    // ── Step 6: Entity resolution ─────────────────────────────────
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
      entityIdMap.set(
        normalizeEntityName(resolved.resolvedName),
        resolved.entityId
      );
      if (resolved.rawName) {
        entityIdMap.set(resolved.rawName, resolved.entityId);
        entityIdMap.set(
          normalizeEntityName(resolved.rawName),
          resolved.entityId
        );
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

    if (interview?.interviewee_entity_id && interview.interviewee_name?.trim()) {
      const n = interview.interviewee_name.trim();
      entityIdMap.set(n, interview.interviewee_entity_id);
      entityIdMap.set(normalizeEntityName(n), interview.interviewee_entity_id);
    }
    if (interview?.interviewee_org_entity_id && interview.interviewee_org?.trim()) {
      const n = interview.interviewee_org.trim();
      entityIdMap.set(n, interview.interviewee_org_entity_id);
      entityIdMap.set(normalizeEntityName(n), interview.interviewee_org_entity_id);
    }

    console.log(
      `Document entity resolution: ${resolvedEntities.length} unique entities from ${rawEntities.length} raw mentions (interview ${interviewId})`
    );

    // ── Step 6a: Ground entity mentions to chunks ─────────────────
    const { data: persistedChunks } = await supabase
      .from("interview_chunks")
      .select("id, chunk_index, content, speaker")
      .eq("interview_id", interviewId)
      .order("chunk_index");

    const chunksForGrounding: ChunkForGrounding[] = (
      persistedChunks ?? []
    ).map((c) => ({
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

    // ── Step 6b: Backfill anchor entity IDs into chunk metadata ──
    const personName = interview?.interviewee_name ?? "";
    const orgName = interview?.interviewee_org ?? "";
    const personEntityId =
      interview?.interviewee_entity_id ??
      (personName
        ? entityIdMap.get(personName) ??
          entityIdMap.get(normalizeEntityName(personName)) ??
          null
        : null);
    const orgEntityId =
      interview?.interviewee_org_entity_id ??
      (orgName
        ? entityIdMap.get(orgName) ??
          entityIdMap.get(normalizeEntityName(orgName)) ??
          null
        : null);

    if (personEntityId || orgEntityId) {
      for (let i = 0; i < chunkRows.length; i += 50) {
        const batch = chunkRows.slice(i, i + 50);
        for (const row of batch) {
          const meta = row.metadata as ChunkMetadata;
          if (personEntityId) meta.primary_person_entity_id = personEntityId;
          if (orgEntityId) meta.primary_org_entity_id = orgEntityId;
        }
      }

      for (let i = 0; i < chunkRows.length; i += 50) {
        const batch = chunkRows.slice(i, i + 50);
        for (const row of batch) {
          const { error: metaError } = await supabase
            .from("interview_chunks")
            .update({ metadata: row.metadata })
            .eq("interview_id", interviewId)
            .eq("chunk_index", row.chunk_index);

          if (metaError) {
            console.error(
              "Failed to backfill anchor entity ID in chunk metadata:",
              metaError
            );
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
      `Document pipeline completed for interview ${interviewId}: ${chunks.length} chunks, ${resolvedEntities.length} entities (from ${extraction.entities.length} raw), ${extraction.relationships.length} relationships`
    );

    // ── Step 8: Content generation (non-critical) ─────────────────
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
    console.error(
      `Document pipeline failed for interview ${interviewId}:`,
      error
    );
    await updateInterviewStatus(interviewId, "FAILED", {
      error_message: toErrorMessage(error),
    });
  }
}
