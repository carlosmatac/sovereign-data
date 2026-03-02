"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTranscriptDisplay } from "@/lib/transcript/normalizeDisplay";

type RecomputeResult = {
  success?: true;
  replacementsApplied?: number;
  error?: string;
};

export async function recomputeCleanedTranscript(
  interviewId: string
): Promise<RecomputeResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Not authenticated" };

    const admin = createAdminClient();
    const { data: interview, error: interviewError } = await admin
      .from("interviews")
      .select("id, project_id, transcript_full, interviewee_name, interviewee_org")
      .eq("id", interviewId)
      .maybeSingle();

    if (interviewError) return { error: interviewError.message };
    if (!interview) return { error: "Interview not found" };
    if (!interview.transcript_full) return { error: "No transcript available yet" };

    const { data: membership, error: membershipError } = await admin
      .from("project_members")
      .select("role")
      .eq("project_id", interview.project_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) return { error: membershipError.message };
    if (!membership || membership.role !== "owner") {
      return { error: "Only project owners can recompute cleaned transcript" };
    }

    const normalized = normalizeTranscriptDisplay(interview.transcript_full, {
      intervieweeName: interview.interviewee_name,
      intervieweeOrg: interview.interviewee_org,
    });

    const { error: updateError } = await admin
      .from("interviews")
      .update({
        transcript_display: normalized.transcriptDisplay,
      })
      .eq("id", interview.id);

    if (updateError) return { error: updateError.message };

    revalidatePath(`/interviews/${interview.id}`);
    revalidatePath("/interviews");

    return {
      success: true,
      replacementsApplied: normalized.stats.replacementsApplied,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
