import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProjectRole } from "@/lib/auth/project-role";
import { reprocessInterviewFromReview } from "@/lib/ai/pipeline";

/**
 * POST /api/interviews/[id]/reprocess-review
 *
 * Editors only. Requires transcript_review_status = ready.
 * Runs the reviewed intel pipeline in the background (fire-and-forget), same pattern as the AssemblyAI webhook.
 */
export async function POST(
  _request: Request,
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
  const { data: interview, error } = await admin
    .from("interviews")
    .select("project_id, transcript_review_status")
    .eq("id", interviewId)
    .single();

  if (error || !interview) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  const role = await getUserProjectRole(interview.project_id);
  if (!role || role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (interview.transcript_review_status === "reprocessing") {
    return NextResponse.json(
      { error: "This interview is already reprocessing." },
      { status: 409 }
    );
  }

  if (interview.transcript_review_status !== "ready") {
    return NextResponse.json(
      {
        error:
          "Mark the interview ready for reprocessing first (transcript review page).",
      },
      { status: 400 }
    );
  }

  void reprocessInterviewFromReview(interviewId).catch((err) => {
    console.error("reprocessInterviewFromReview fire-and-forget error:", err);
  });

  return NextResponse.json({ started: true });
}
