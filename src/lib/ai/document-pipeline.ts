// ============================================
// Document (PDF) + Text Pipeline — thin wrapper
// ============================================
// Delegates to the shared runIntelPipelineFromCanonicalSource runner.
// Enters at EXTRACTING — bypasses AssemblyAI transcription entirely.
//
// All entity resolution, grounding, and persistence (including the
// persistence gate that drops ungrounded entities + contaminated
// relationships) lives in the shared runner — see `pipeline.ts`.

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTranscriptDisplay } from "@/lib/transcript/normalizeDisplay";
import { runIntelPipelineFromCanonicalSource } from "./pipeline";
import type { TextStructureType } from "./chunking-text-interview";

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
 * Process a plain-text interview through the full intelligence pipeline.
 *
 * Same pattern as processDocument but uses source_type 'text' and
 * passes structureHint so the runner can use chunkTextInterview.
 */
export async function processTextInterview(
  interviewId: string,
  plainText: string,
  structureHint?: TextStructureType
): Promise<void> {
  const supabase = createAdminClient();

  try {
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

    await supabase
      .from("interviews")
      .update({
        status: "EXTRACTING",
        transcript_full: plainText,
        transcript_display: normalizedTranscript.transcriptDisplay,
        speaker_map: {},
        audio_duration: null,
      })
      .eq("id", interviewId);

    if (!interview?.project_id) {
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
      speakerMap: {},
      extractionTranscript: plainText,
      chunkUtterances: [],
      sourceType: "text",
      sourceMetadata: structureHint ? { structure_type: structureHint } : {},
      clearDerivedBeforeInsert: false,
      lastIntelSource: "direct_ingest",
    });
  } catch (error) {
    console.error(`Text pipeline failed for interview ${interviewId}:`, error);
    await supabase
      .from("interviews")
      .update({
        status: "FAILED",
        error_message: toErrorMessage(error),
      })
      .eq("id", interviewId);
  }
}

/**
 * Process a PDF/document interview through the full intelligence pipeline.
 *
 * Enters at EXTRACTING (skips TRANSCRIBING — no audio to process).
 * Delegates extraction, chunking, embedding, and persistence to the
 * shared runIntelPipelineFromCanonicalSource runner.
 */
export async function processDocument(
  interviewId: string,
  plainText: string
): Promise<void> {
  const supabase = createAdminClient();

  try {
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

    await supabase
      .from("interviews")
      .update({
        status: "EXTRACTING",
        transcript_full: plainText,
        transcript_display: normalizedTranscript.transcriptDisplay,
        speaker_map: {},
        audio_duration: null,
      })
      .eq("id", interviewId);

    if (normalizedTranscript.stats.replacementsApplied > 0) {
      console.log(
        `Transcript display normalized for ${interviewId}: ${normalizedTranscript.stats.replacementsApplied} replacements`
      );
    }

    if (!interview?.project_id) {
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
      speakerMap: {},
      extractionTranscript: plainText,
      chunkUtterances: [],
      clearDerivedBeforeInsert: false,
      lastIntelSource: "direct_ingest",
    });
  } catch (error) {
    console.error(`Document pipeline failed for interview ${interviewId}:`, error);
    await supabase
      .from("interviews")
      .update({
        status: "FAILED",
        error_message: toErrorMessage(error),
      })
      .eq("id", interviewId);
  }
}
