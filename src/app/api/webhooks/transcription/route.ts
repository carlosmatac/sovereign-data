import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processTranscription } from "@/lib/ai/pipeline";

/**
 * POST /api/webhooks/transcription
 *
 * Webhook endpoint called by AssemblyAI when transcription completes.
 * This triggers the full ETL pipeline (extract -> chunk -> embed -> persist).
 *
 * Security: Verified via x-webhook-secret header.
 */
export async function POST(request: NextRequest) {
  // ── Verify webhook secret ──────────────────────────────────────
  const webhookSecret = request.headers.get("x-webhook-secret");
  if (webhookSecret !== process.env.WEBHOOK_SECRET) {
    console.error("Webhook auth failed: invalid secret");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse payload ──────────────────────────────────────────────
  const body = await request.json();
  const { transcript_id, status } = body as {
    transcript_id: string;
    status: "completed" | "error";
  };

  if (!transcript_id) {
    return NextResponse.json(
      { error: "Missing transcript_id" },
      { status: 400 }
    );
  }

  // ── Find the associated interview ──────────────────────────────
  const supabase = createAdminClient();
  const { data: interview, error } = await supabase
    .from("interviews")
    .select("id")
    .eq("assemblyai_id", transcript_id)
    .single();

  if (error || !interview) {
    console.error(
      `No interview found for AssemblyAI ID ${transcript_id}:`,
      error
    );
    return NextResponse.json(
      { error: "Interview not found" },
      { status: 404 }
    );
  }

  // ── Handle error status ────────────────────────────────────────
  if (status === "error") {
    await supabase
      .from("sources")
      .update({
        status: "FAILED",
        error_message: "AssemblyAI transcription failed",
      })
      .eq("id", interview.id);

    return NextResponse.json({ received: true });
  }

  // ── Trigger async ETL pipeline ─────────────────────────────────
  // Fire and forget — the pipeline handles its own error states.
  // In production, this should be pushed to a job queue (e.g., Inngest, QStash).
  processTranscription(interview.id, transcript_id).catch((err) => {
    console.error("Pipeline fire-and-forget error:", err);
  });

  return NextResponse.json({ received: true });
}
