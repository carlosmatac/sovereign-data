"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchOrCreateEntity } from "@/lib/entities/match";
import { reprocessInterviewFromReview } from "@/lib/ai/pipeline";
import type { EntityType, ReviewedUtterance } from "@/types/database";

type ActionResult = { success: true } | { error: string };

function isReviewedUtteranceArray(v: unknown): v is ReviewedUtterance[] {
  if (!Array.isArray(v) || v.length === 0) return false;
  for (const row of v) {
    if (typeof row !== "object" || row === null) return false;
    const o = row as Record<string, unknown>;
    if (
      typeof o.speaker !== "string" ||
      typeof o.text !== "string" ||
      typeof o.start !== "number" ||
      typeof o.end !== "number"
    ) {
      return false;
    }
  }
  return true;
}

async function requireInterviewEditor(interviewId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();
  const { data: interview, error } = await admin
    .from("interviews")
    .select("id, tenant_id, project_id, status, transcript_review_status")
    .eq("id", interviewId)
    .single();

  if (error || !interview) throw new Error("Interview not found");

  const { data: membership } = await admin
    .from("project_members")
    .select("role")
    .eq("project_id", interview.project_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || membership.role === "viewer") {
    throw new Error("Insufficient permissions");
  }

  return { admin, userId: user.id, interview };
}

export async function saveTranscriptReviewDraft(
  interviewId: string,
  reviewedUtterances: ReviewedUtterance[]
): Promise<ActionResult> {
  try {
    const { admin, interview } = await requireInterviewEditor(interviewId);

    if (interview.transcript_review_status === "reprocessing") {
      return { error: "Cannot edit while reprocessing." };
    }

    if (!isReviewedUtteranceArray(reviewedUtterances)) {
      return { error: "Invalid utterance payload." };
    }

    if (reviewedUtterances.length === 0) {
      return { error: "At least one utterance is required to save a draft." };
    }

    if (interview.status !== "COMPLETED" && interview.status !== "FAILED") {
      return {
        error: "Save draft is only available when the interview is completed or failed with a transcript.",
      };
    }

    const { error } = await admin
      .from("sources")
      .update({
        reviewed_utterances: reviewedUtterances,
        transcript_review_status: "draft",
      })
      .eq("id", interviewId);

    if (error) return { error: error.message };

    revalidatePath(`/interviews/${interviewId}`);
    revalidatePath(`/interviews/${interviewId}/review`);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Save failed" };
  }
}

export async function markInterviewReviewReady(interviewId: string): Promise<ActionResult> {
  try {
    const { admin, interview } = await requireInterviewEditor(interviewId);

    if (interview.transcript_review_status === "reprocessing") {
      return { error: "Already reprocessing." };
    }

    const { data: row } = await admin
      .from("interviews")
      .select("reviewed_utterances")
      .eq("id", interviewId)
      .single();

    if (!isReviewedUtteranceArray(row?.reviewed_utterances)) {
      return { error: "Save a draft with at least one utterance before marking ready." };
    }

    const { error } = await admin
      .from("sources")
      .update({ transcript_review_status: "ready" })
      .eq("id", interviewId);

    if (error) return { error: error.message };

    revalidatePath(`/interviews/${interviewId}`);
    revalidatePath(`/interviews/${interviewId}/review`);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Update failed" };
  }
}

export async function addReviewSeedFromEntity(
  interviewId: string,
  entityId: string
): Promise<ActionResult> {
  try {
    const { admin, userId, interview } = await requireInterviewEditor(interviewId);

    if (interview.transcript_review_status === "reprocessing") {
      return { error: "Cannot edit while reprocessing." };
    }

    const { data: entity, error: entErr } = await admin
      .from("entities")
      .select("id, name, type, project_id")
      .eq("id", entityId)
      .maybeSingle();

    if (entErr || !entity) return { error: "Entity not found" };

    if (
      entity.project_id != null &&
      entity.project_id !== interview.project_id
    ) {
      return { error: "Entity must belong to this project or be global." };
    }

    const { data: existing } = await admin
      .from("interview_review_entities")
      .select("id")
      .eq("interview_id", interviewId)
      .eq("entity_id", entityId)
      .maybeSingle();

    if (existing) return { error: "This entity is already in the review list." };

    const { error } = await admin.from("interview_review_entities").insert({
      tenant_id: interview.tenant_id,
      interview_id: interviewId,
      entity_id: entity.id,
      display_name: entity.name,
      entity_type: entity.type,
      created_by: userId,
    });

    if (error) return { error: error.message };

    revalidatePath(`/interviews/${interviewId}/review`);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Add failed" };
  }
}

export async function createReviewSeedEntity(
  interviewId: string,
  projectId: string,
  name: string,
  type: EntityType
): Promise<ActionResult & { entityId?: string }> {
  try {
    const { admin, userId, interview } = await requireInterviewEditor(interviewId);

    if (interview.project_id !== projectId) {
      return { error: "Project mismatch" };
    }

    if (interview.transcript_review_status === "reprocessing") {
      return { error: "Cannot edit while reprocessing." };
    }

    const trimmed = name.trim();
    if (!trimmed) return { error: "Name is required" };

    const { entityId } = await matchOrCreateEntity({
      projectId,
      tenantId: interview.tenant_id,
      nameRaw: trimmed,
      type,
      supabaseClient: admin,
    });

    const { data: existing } = await admin
      .from("interview_review_entities")
      .select("id")
      .eq("interview_id", interviewId)
      .eq("entity_id", entityId)
      .maybeSingle();

    if (existing) {
      return { success: true, entityId };
    }

    const { error } = await admin.from("interview_review_entities").insert({
      tenant_id: interview.tenant_id,
      interview_id: interviewId,
      entity_id: entityId,
      display_name: trimmed,
      entity_type: type,
      created_by: userId,
    });

    if (error) return { error: error.message };

    revalidatePath(`/interviews/${interviewId}/review`);
    return { success: true, entityId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Create failed" };
  }
}

export async function removeReviewSeedEntity(seedId: string, interviewId: string): Promise<ActionResult> {
  try {
    await requireInterviewEditor(interviewId);

    const admin = createAdminClient();
    const { error } = await admin
      .from("interview_review_entities")
      .delete()
      .eq("id", seedId)
      .eq("interview_id", interviewId);

    if (error) return { error: error.message };

    revalidatePath(`/interviews/${interviewId}/review`);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Remove failed" };
  }
}

/**
 * Atomically saves the reviewed utterances and immediately triggers a pipeline
 * reprocess — collapsing the old "Save Draft → Mark Ready → Run Reprocessing"
 * three-step flow into a single user action.
 *
 * The pipeline function (`reprocessInterviewFromReview`) is fired as a
 * fire-and-forget, identical to the pattern used by the reprocess-review API
 * route. It sets `transcript_review_status = "reprocessing"` itself at the very
 * start, so the UI transitions to the in-progress state on the next refresh.
 */
export async function saveAndReprocess(
  interviewId: string,
  reviewedUtterances: ReviewedUtterance[]
): Promise<ActionResult> {
  try {
    const { admin, interview } = await requireInterviewEditor(interviewId);

    if (interview.transcript_review_status === "reprocessing") {
      return { error: "Already reprocessing." };
    }

    if (interview.status !== "COMPLETED" && interview.status !== "FAILED") {
      return {
        error:
          "Save & Reprocess is only available when the source is completed or failed.",
      };
    }

    if (!isReviewedUtteranceArray(reviewedUtterances)) {
      return { error: "Invalid utterance payload." };
    }

    // Persist utterances and mark as ready so the pipeline function can proceed.
    // error_message is cleared here so stale failure copy is not shown while
    // the new run is in flight.
    const { error: saveError } = await admin
      .from("sources")
      .update({
        reviewed_utterances: reviewedUtterances,
        transcript_review_status: "ready",
        error_message: null,
      })
      .eq("id", interviewId);

    if (saveError) return { error: saveError.message };

    // Fire-and-forget — pipeline immediately transitions to "reprocessing".
    void reprocessInterviewFromReview(interviewId).catch((err: unknown) => {
      console.error("[saveAndReprocess] pipeline fire-and-forget error:", err);
    });

    revalidatePath(`/interviews/${interviewId}`);
    revalidatePath(`/interviews/${interviewId}/review`);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Reprocess failed" };
  }
}
