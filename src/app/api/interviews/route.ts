import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitTranscription } from "@/lib/ai/assemblyai";
import { parseExpectedSpeakers } from "@/lib/constants";
import { ensureUploadAnchorEntity } from "@/lib/entities/validate-interview-anchor";
import { sanitizeIntervieweeTitle } from "@/lib/interviews/upload-metadata";

const MAX_ANCHOR_LENGTH = 120;
const HONORIFIC_PREFIX_REGEX = /^\s*(mr|mrs|ms|dr|prof)\.?\s+/i;

function parseOptionalUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  ) {
    return null;
  }
  return s;
}

function sanitizeOptionalAnchor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  if (!cleaned) return null;
  if (cleaned.length > MAX_ANCHOR_LENGTH) {
    return cleaned.slice(0, MAX_ANCHOR_LENGTH);
  }
  return cleaned;
}

function buildAnchorKeyterms(anchor: string): string[] {
  const out = new Set<string>();
  const trimmed = anchor.trim();
  if (!trimmed) return [];

  out.add(trimmed);
  out.add(trimmed.replace(/\s+/g, " "));

  const withoutTitle = trimmed.replace(HONORIFIC_PREFIX_REGEX, "").trim();
  if (withoutTitle) out.add(withoutTitle);

  return [...out].filter(Boolean);
}

async function getKeytermsPrompt(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
  anchors: { intervieweeName: string | null; intervieweeOrg: string | null }
): Promise<string[]> {
  const [projectAliasesRes, globalAliasesRes] = await Promise.all([
    admin
      .from("entity_aliases")
      .select("alias_normalized")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("entity_aliases")
      .select("alias_normalized")
      .is("project_id", null)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (projectAliasesRes.error) {
    console.error("Failed to fetch project aliases for keyterms_prompt:", projectAliasesRes.error);
  }
  if (globalAliasesRes.error) {
    console.error("Failed to fetch global aliases for keyterms_prompt:", globalAliasesRes.error);
  }

  const out: string[] = [];
  const seen = new Set<string>();
  const MAX_KEYTERMS = 220;

  const anchorCandidates = [
    ...(anchors.intervieweeName ? buildAnchorKeyterms(anchors.intervieweeName) : []),
    ...(anchors.intervieweeOrg ? buildAnchorKeyterms(anchors.intervieweeOrg) : []),
  ];

  for (const term of anchorCandidates) {
    if (!term || seen.has(term)) continue;
    seen.add(term);
    out.push(term);
    if (out.length >= MAX_KEYTERMS) return out;
  }

  for (const alias of projectAliasesRes.data ?? []) {
    if (!alias.alias_normalized || seen.has(alias.alias_normalized)) continue;
    seen.add(alias.alias_normalized);
    out.push(alias.alias_normalized);
    if (out.length >= MAX_KEYTERMS) return out;
  }

  for (const alias of globalAliasesRes.data ?? []) {
    if (!alias.alias_normalized || seen.has(alias.alias_normalized)) continue;
    seen.add(alias.alias_normalized);
    out.push(alias.alias_normalized);
    if (out.length >= MAX_KEYTERMS) break;
  }

  return out;
}

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
  const {
    title,
    description,
    project_id,
    audio_url,
    language,
    expectedSpeakers: rawExpectedSpeakers,
    interviewee_name: rawIntervieweeName,
    interviewee_org: rawIntervieweeOrg,
    interviewee_title: rawIntervieweeTitle,
    interviewee_entity_id: rawIntervieweeEntityId,
    interviewee_org_entity_id: rawIntervieweeOrgEntityId,
  } = body as {
    title: string;
    project_id: string;
    audio_url: string;
    description?: string;
    language?: string;
    expectedSpeakers?: unknown;
    interviewee_name?: unknown;
    interviewee_org?: unknown;
    interviewee_title?: unknown;
    interviewee_entity_id?: unknown;
    interviewee_org_entity_id?: unknown;
  };

  // Validate required fields
  if (!title || !project_id || !audio_url) {
    return NextResponse.json(
      { error: "Missing required fields: title, project_id, audio_url" },
      { status: 400 }
    );
  }

  // Validate optional expectedSpeakers
  let expectedSpeakers: number | null;
  try {
    expectedSpeakers = parseExpectedSpeakers(rawExpectedSpeakers);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid expectedSpeakers value" },
      { status: 400 }
    );
  }

  let intervieweeName = sanitizeOptionalAnchor(rawIntervieweeName);
  let intervieweeOrg = sanitizeOptionalAnchor(rawIntervieweeOrg);
  const intervieweeTitle = sanitizeIntervieweeTitle(rawIntervieweeTitle);
  const rawIntervieweeEntityIdParsed = parseOptionalUuid(rawIntervieweeEntityId);
  const rawIntervieweeOrgEntityIdParsed = parseOptionalUuid(
    rawIntervieweeOrgEntityId
  );

  // 2. Use admin client for DB operations (bypasses RLS, safe after auth check)
  const admin = createAdminClient();

  // 3. Resolve user-provided anchors into deterministic entity IDs.
  // See ensureUploadAnchorEntity for the FK-or-text branching contract.
  const personAnchor = await ensureUploadAnchorEntity(admin, {
    entityId: rawIntervieweeEntityIdParsed,
    name: intervieweeName,
    projectId: project_id,
    role: "person",
  });
  if (!personAnchor.ok) {
    return NextResponse.json(
      { error: "Invalid interviewee entity selection" },
      { status: 400 }
    );
  }

  const orgAnchor = await ensureUploadAnchorEntity(admin, {
    entityId: rawIntervieweeOrgEntityIdParsed,
    name: intervieweeOrg,
    projectId: project_id,
    role: "organization",
  });
  if (!orgAnchor.ok) {
    return NextResponse.json(
      { error: "Invalid organization entity selection" },
      { status: 400 }
    );
  }

  intervieweeName = personAnchor.name;
  intervieweeOrg = orgAnchor.name;
  const intervieweeEntityId = personAnchor.entityId;
  const intervieweeOrgEntityId = orgAnchor.entityId;

  // ── Create interview record ────────────────────────────────────
  const { data: interview, error: insertError } = await admin
    .from("sources")
    .insert({
      title,
      description: description ?? null,
      project_id,
      audio_url,
      language: language ?? "en",
      status: "PROCESSING",
      created_by: user.id,
      expected_speakers: expectedSpeakers,
      interviewee_name: intervieweeName,
      interviewee_org: intervieweeOrg,
      interviewee_title: intervieweeTitle,
      interviewee_entity_id: intervieweeEntityId,
      interviewee_org_entity_id: intervieweeOrgEntityId,
      semantic_source_type: "interview",
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
    const keytermsPrompt = await getKeytermsPrompt(admin, project_id, {
      intervieweeName,
      intervieweeOrg,
    });

    const { transcriptId } = await submitTranscription({
      audioUrl: audio_url,
      webhookUrl,
      webhookSecret: process.env.WEBHOOK_SECRET!,
      languageCode: language,
      speakersExpected: expectedSpeakers,
      keytermsPrompt,
    });

    // Update with AssemblyAI ID
    await admin
      .from("sources")
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
      .from("sources")
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
