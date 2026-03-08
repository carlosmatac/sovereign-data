import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { backfillInterviewMentions } from "@/lib/entities/ground-mentions";

/**
 * POST /api/interviews/[id]/backfill-mentions
 *
 * Backfill chunk grounding for existing ungrounded entity_mentions.
 * Finds mentions with null chunk_id and runs hybrid grounding
 * (exact → alias → anchor_context → fuzzy) to link them to chunks.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: interviewId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: interview } = await admin
    .from("interviews")
    .select("id, project_id, status")
    .eq("id", interviewId)
    .single();

  if (!interview) {
    return NextResponse.json(
      { error: "Interview not found" },
      { status: 404 }
    );
  }

  if (interview.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "Interview must be COMPLETED to backfill mentions" },
      { status: 400 }
    );
  }

  // Verify user has access to this project
  const { data: membership } = await admin
    .from("project_members")
    .select("role")
    .eq("project_id", interview.project_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await backfillInterviewMentions(admin, interviewId);
    return NextResponse.json({
      message: `Backfill complete: ${result.grounded} entities grounded, ${result.skipped} skipped`,
      ...result,
    });
  } catch (error) {
    console.error(`Backfill failed for interview ${interviewId}:`, error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Backfill failed",
      },
      { status: 500 }
    );
  }
}
