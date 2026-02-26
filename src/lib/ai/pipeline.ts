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
import type { InterviewStatus } from "@/types/database";

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

    // Save speaker-formatted transcript
    await updateInterviewStatus(interviewId, "EXTRACTING", {
      transcript_full: formattedTranscript,
      speaker_map: speakerMap,
      audio_duration: transcription.audio_duration
        ? Math.round(transcription.audio_duration / 1000)
        : null,
    });

    // ── Step 2: Extract intelligence ─────────────────────────────
    // Fetch interview metadata for extraction context
    const { data: interview } = await supabase
      .from("interviews")
      .select("title, project_id, projects(country)")
      .eq("id", interviewId)
      .single();

    const country = (interview?.projects as Record<string, unknown>)?.country as string | undefined;

    const extraction = await extractIntelligence({
      transcript: transcription.text,
      interviewTitle: interview?.title ?? "Unknown Interview",
      country,
      speakerMap,
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

    // ── Step 4: Generate embeddings ──────────────────────────────
    const chunkTexts = chunks.map((c) => c.content);
    const embeddings = await generateEmbeddings(chunkTexts);

    // ── Step 5: Persist chunks ───────────────────────────────────
    const chunkRows = chunks.map((chunk, i) => ({
      interview_id: interviewId,
      chunk_index: chunk.chunkIndex,
      content: chunk.content,
      speaker: chunk.speaker,
      start_time: chunk.startTime,
      end_time: chunk.endTime,
      embedding: JSON.stringify(embeddings[i]),
      metadata: {
        country,
        topics: extraction.topics,
        entities: extraction.entities.map((e) => e.name),
      },
    }));

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

    // ── Step 6: Persist entities ─────────────────────────────────
    const entityIdMap = new Map<string, string>();

    for (const entity of extraction.entities) {
      const { data: entityRow } = await supabase
        .from("entities")
        .upsert(
          {
            name: entity.name,
            type: entity.type,
            description: entity.description ?? null,
          },
          { onConflict: "name,type" }
        )
        .select("id")
        .single();

      if (entityRow) {
        entityIdMap.set(entity.name, entityRow.id);
        await supabase.from("entity_mentions").insert({
          entity_id: entityRow.id,
          interview_id: interviewId,
          sentiment: entity.sentiment ?? null,
        });
      }
    }

    // ── Step 7: Persist relationships ────────────────────────────
    for (const rel of extraction.relationships) {
      const sourceId = entityIdMap.get(rel.source_name);
      const targetId = entityIdMap.get(rel.target_name);

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
      `Pipeline completed for interview ${interviewId}: ${chunks.length} chunks, ${extraction.entities.length} entities, ${extraction.relationships.length} relationships`
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
