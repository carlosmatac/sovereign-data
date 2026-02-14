import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitTranscription } from "@/lib/ai/assemblyai";

/**
 * POST /api/interviews
 *
 * Create a new interview record and trigger transcription.
 * Called after the client uploads audio to Supabase Storage.
 *
 * Uses admin client for DB writes (auth verified via getUser first).
 */
export async function POST(request: NextRequest) {
  // 1. Verify user identity via cookie-based client
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { title, description, project_id, audio_url, language } = body as {
    title: string;
    project_id: string;
    audio_url: string;
    description?: string;
    language?: string;
  };

  // Validate required fields
  if (!title || !project_id || !audio_url) {
    return NextResponse.json(
      { error: "Missing required fields: title, project_id, audio_url" },
      { status: 400 }
    );
  }

  // 2. Use admin client for DB operations (bypasses RLS, safe after auth check)
  const admin = createAdminClient();

  // ── Create interview record ────────────────────────────────────
  const { data: interview, error: insertError } = await admin
    .from("interviews")
    .insert({
      title,
      description: description ?? null,
      project_id,
      audio_url,
      language: language ?? "en",
      status: "PROCESSING",
      created_by: user.id,
    })
    .select()
    .single();

  if (insertError || !interview) {
    console.error("Failed to create interview:", insertError);
    return NextResponse.json(
      { error: "Failed to create interview" },
      { status: 500 }
    );
  }

  // ── Submit to AssemblyAI ───────────────────────────────────────
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
    const webhookUrl = `${appUrl}/api/webhooks/transcription`;

    const { transcriptId } = await submitTranscription({
      audioUrl: audio_url,
      webhookUrl,
      webhookSecret: process.env.WEBHOOK_SECRET!,
      languageCode: language,
    });

    // Update with AssemblyAI ID
    await admin
      .from("interviews")
      .update({
        assemblyai_id: transcriptId,
        status: "TRANSCRIBING",
      })
      .eq("id", interview.id);

    return NextResponse.json({
      id: interview.id,
      status: "TRANSCRIBING",
      assemblyai_id: transcriptId,
    });
  } catch (error) {
    console.error("AssemblyAI submission failed:", error);

    // Mark as failed but still return the interview ID
    await admin
      .from("interviews")
      .update({
        status: "FAILED",
        error_message:
          error instanceof Error
            ? error.message
            : "Failed to submit for transcription",
      })
      .eq("id", interview.id);

    return NextResponse.json(
      {
        id: interview.id,
        status: "FAILED",
        error: "Transcription submission failed",
      },
      { status: 500 }
    );
  }
}
