import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTranscription } from "@/lib/ai/assemblyai";

/**
 * POST /api/interviews/backfill-duration
 *
 * One-time admin utility: re-fetches audio_duration from AssemblyAI for all
 * COMPLETED interviews that have an assemblyai_id but an incorrect duration
 * (stored with the old /1000 bug).
 *
 * Only project owners can trigger this. Runs sequentially to respect rate limits.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Fetch all completed interviews with an assemblyai_id
  const { data: interviews, error } = await admin
    .from("interviews")
    .select("id, assemblyai_id, audio_duration")
    .eq("status", "COMPLETED")
    .not("assemblyai_id", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!interviews || interviews.length === 0) {
    return NextResponse.json({ updated: 0, message: "No interviews to backfill" });
  }

  let updated = 0;
  let failed = 0;
  const results: Array<{ id: string; old: number | null; new: number | null; error?: string }> = [];

  for (const interview of interviews) {
    if (!interview.assemblyai_id) continue;

    try {
      const transcription = await getTranscription(interview.assemblyai_id);

      if (transcription.audio_duration && transcription.audio_duration > 0) {
        const correctDuration = Math.round(transcription.audio_duration);

        await admin
          .from("sources")
          .update({ audio_duration: correctDuration })
          .eq("id", interview.id);

        results.push({ id: interview.id, old: interview.audio_duration, new: correctDuration });
        updated++;
      }
    } catch (err) {
      failed++;
      results.push({
        id: interview.id,
        old: interview.audio_duration,
        new: null,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    updated,
    failed,
    total: interviews.length,
    results,
  });
}
