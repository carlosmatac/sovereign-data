import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTranscription } from "@/lib/ai/assemblyai";
import { processTranscription } from "@/lib/ai/pipeline";

/**
 * GET /api/interviews/[id]/poll
 *
 * Polling endpoint for interview status. Solves two problems:
 * 1. AssemblyAI webhooks can't reach localhost during development
 * 2. Supabase Realtime may fail to deliver status updates
 *
 * If the interview is stuck in TRANSCRIBING, checks AssemblyAI directly
 * and triggers the ETL pipeline if transcription is complete.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Verify user is authenticated
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch current interview status
  const admin = createAdminClient();
  const { data: interview, error } = await admin
    .from("interviews")
    .select("id, status, assemblyai_id, error_message")
    .eq("id", id)
    .single();

  if (error || !interview) {
    return NextResponse.json(
      { error: "Interview not found" },
      { status: 404 }
    );
  }

  // If stuck in TRANSCRIBING, check AssemblyAI directly
  if (
    interview.status === "TRANSCRIBING" &&
    interview.assemblyai_id
  ) {
    try {
      const transcription = await getTranscription(interview.assemblyai_id);

      if (transcription.status === "completed") {
        // Atomically claim this transcription to prevent double-triggering.
        // Only proceed if the row is still in TRANSCRIBING status.
        const { data: claimed } = await admin
          .from("interviews")
          .update({ status: "EXTRACTING" as const })
          .eq("id", id)
          .eq("status", "TRANSCRIBING")
          .select("id")
          .single();

        if (claimed) {
          // We successfully claimed it — trigger the pipeline.
          console.log(
            `[poll] AssemblyAI transcription completed for interview ${id}, triggering pipeline`
          );
          processTranscription(interview.id, interview.assemblyai_id!).catch(
            (err) => {
              console.error("[poll] Pipeline fire-and-forget error:", err);
            }
          );
        }

        return NextResponse.json({
          status: "EXTRACTING",
          message: "Transcription complete, pipeline triggered",
        });
      }

      if (transcription.status === "error") {
        // AssemblyAI failed — update our record
        await admin
          .from("interviews")
          .update({
            status: "FAILED",
            error_message:
              transcription.error ?? "AssemblyAI transcription failed",
          })
          .eq("id", id);

        return NextResponse.json({
          status: "FAILED",
          error_message:
            transcription.error ?? "AssemblyAI transcription failed",
        });
      }

      // Still processing on AssemblyAI's side
      return NextResponse.json({
        status: interview.status,
        assemblyai_status: transcription.status,
        message: "Transcription still in progress",
      });
    } catch (err) {
      console.error("[poll] Error checking AssemblyAI status:", err);
      // Don't fail the poll — just return current DB status
      return NextResponse.json({
        status: interview.status,
        message: "Could not reach AssemblyAI, returning cached status",
      });
    }
  }

  // For all other statuses, just return the current DB state
  return NextResponse.json({
    status: interview.status,
    error_message: interview.error_message,
  });
}
