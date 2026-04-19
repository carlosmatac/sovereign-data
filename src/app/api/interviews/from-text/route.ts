import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateInterviewAnchorEntityId } from "@/lib/entities/validate-interview-anchor";
import { sanitizeIntervieweeTitle } from "@/lib/interviews/upload-metadata";
import type { TextStructureType } from "@/lib/ai/chunking-text-interview";

export const runtime = "nodejs";

const MAX_TEXT_LENGTH = 200_000;
const MIN_TEXT_LENGTH = 100;
const MAX_ANCHOR_LENGTH = 120;

const VALID_STRUCTURE_HINTS = new Set<TextStructureType>([
  "qa_structured",
  "speaker_transcript",
  "article_style",
  "freeform",
]);

function parseOptionalUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s))
    return null;
  return s;
}

function sanitizeOptionalAnchor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  if (!cleaned) return null;
  return cleaned.length > MAX_ANCHOR_LENGTH
    ? cleaned.slice(0, MAX_ANCHOR_LENGTH)
    : cleaned;
}

/**
 * POST /api/interviews/from-text
 *
 * Create a text-based interview from pasted or uploaded plain text.
 * Accepts JSON body:
 *   - title: string (required)
 *   - project_id: string (required)
 *   - text: string (required, 100–200,000 chars)
 *   - language?: string (default "en")
 *   - semantic_source_type?: string (default "interview")
 *   - structure_hint?: 'qa_structured' | 'speaker_transcript' | 'article_style' | 'freeform'
 *   - interviewee_name?: string
 *   - interviewee_org?: string
 *   - interviewee_title?: string
 *   - interviewee_entity_id?: UUID string
 *   - interviewee_org_entity_id?: UUID string
 *
 * Uses admin client for DB writes (auth verified via getUser first).
 */
export async function POST(request: NextRequest) {
  // 1. Verify user identity
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse JSON body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    title,
    project_id,
    text,
    language,
    semantic_source_type,
    structure_hint,
    interviewee_name,
    interviewee_org,
    interviewee_title,
    interviewee_entity_id,
    interviewee_org_entity_id,
  } = body as Record<string, unknown>;

  // 3. Validate required fields
  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }
  if (!project_id || typeof project_id !== "string" || !project_id.trim()) {
    return NextResponse.json({ error: "Missing project_id" }, { status: 400 });
  }
  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }
  if (text.length < MIN_TEXT_LENGTH) {
    return NextResponse.json(
      { error: `Text must be at least ${MIN_TEXT_LENGTH} characters.` },
      { status: 400 }
    );
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: `Text must not exceed ${MAX_TEXT_LENGTH} characters.` },
      { status: 400 }
    );
  }

  // 4. Validate optional structure hint
  const structureHint =
    typeof structure_hint === "string" &&
    VALID_STRUCTURE_HINTS.has(structure_hint as TextStructureType)
      ? (structure_hint as TextStructureType)
      : null;

  // 5. Sanitize anchors
  let intervieweeName = sanitizeOptionalAnchor(interviewee_name);
  let intervieweeOrg = sanitizeOptionalAnchor(interviewee_org);
  const intervieweeTitle = sanitizeIntervieweeTitle(interviewee_title);
  const intervieweeEntityId = parseOptionalUuid(interviewee_entity_id);
  const intervieweeOrgEntityId = parseOptionalUuid(interviewee_org_entity_id);
  const lang =
    typeof language === "string" && language.trim() ? language.trim() : "en";
  const semanticSourceType =
    typeof semantic_source_type === "string" && semantic_source_type.trim()
      ? semantic_source_type.trim()
      : "interview";

  // 6. Admin client for DB operations
  const admin = createAdminClient();
  const projectIdTrim = (project_id as string).trim();

  if (intervieweeEntityId) {
    const v = await validateInterviewAnchorEntityId(admin, {
      entityId: intervieweeEntityId,
      projectId: projectIdTrim,
      role: "person",
    });
    if (!v.ok) {
      return NextResponse.json(
        { error: "Invalid interviewee entity selection" },
        { status: 400 }
      );
    }
    intervieweeName = v.name;
  }

  if (intervieweeOrgEntityId) {
    const v = await validateInterviewAnchorEntityId(admin, {
      entityId: intervieweeOrgEntityId,
      projectId: projectIdTrim,
      role: "organization",
    });
    if (!v.ok) {
      return NextResponse.json(
        { error: "Invalid organization entity selection" },
        { status: 400 }
      );
    }
    intervieweeOrg = v.name;
  }

  // 7. Create interview record
  const { data: interview, error: insertError } = await admin
    .from("interviews")
    .insert({
      title: (title as string).trim(),
      project_id: projectIdTrim,
      language: lang,
      status: "PROCESSING",
      source_type: "text",
      semantic_source_type: semanticSourceType,
      source_metadata: { structure_type: structureHint ?? null },
      created_by: user.id,
      interviewee_name: intervieweeName,
      interviewee_org: intervieweeOrg,
      interviewee_title: intervieweeTitle,
      interviewee_entity_id: intervieweeEntityId,
      interviewee_org_entity_id: intervieweeOrgEntityId,
    })
    .select()
    .single();

  if (insertError || !interview) {
    console.error("Failed to create interview record:", insertError);
    return NextResponse.json(
      { error: "Failed to create interview" },
      { status: 500 }
    );
  }

  // 8. Fire-and-forget: run text intelligence pipeline
  import("@/lib/ai/document-pipeline")
    .then(({ processTextInterview }) =>
      processTextInterview(interview.id, text as string, structureHint ?? undefined)
    )
    .catch((err) => {
      console.error(`Text pipeline fire-and-forget failed for ${interview.id}:`, err);
    });

  return NextResponse.json({
    id: interview.id,
    status: "PROCESSING",
  });
}
