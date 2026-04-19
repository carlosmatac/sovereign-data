"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  RELATION_TYPE_VALUES,
  type RelationType,
} from "@/types/database";

/**
 * Server actions for editorial corrections on `entity_relationships`,
 * scoped to a single interview. See
 * docs/features/on-going/editable-relationship-governance.md.
 *
 * Permission model mirrors `interview-speakers.ts`:
 *   getUser() → admin client → project_members owner/editor only.
 */

type ActionResult = { success: true } | { error: string };

type EditorContext = {
  admin: ReturnType<typeof createAdminClient>;
  userId: string;
  relationship: {
    id: string;
    source_entity_id: string;
    target_entity_id: string;
    relation_type: RelationType;
    interview_id: string;
  };
  interviewId: string;
};

async function requireInterviewEditorForRelationship(
  relationshipId: string
): Promise<{ ok: true; ctx: EditorContext } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const admin = createAdminClient();

  const { data: rel, error: relError } = await admin
    .from("entity_relationships")
    .select("id, source_entity_id, target_entity_id, relation_type, interview_id")
    .eq("id", relationshipId)
    .maybeSingle();

  if (relError) return { ok: false, error: relError.message };
  if (!rel) return { ok: false, error: "Relationship not found" };

  const { data: interview, error: interviewError } = await admin
    .from("interviews")
    .select("id, project_id")
    .eq("id", rel.interview_id)
    .maybeSingle();

  if (interviewError) return { ok: false, error: interviewError.message };
  if (!interview) return { ok: false, error: "Interview not found" };

  const { data: membership } = await admin
    .from("project_members")
    .select("role")
    .eq("project_id", interview.project_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || membership.role === "viewer") {
    return { ok: false, error: "Insufficient permissions" };
  }

  return {
    ok: true,
    ctx: {
      admin,
      userId: user.id,
      relationship: {
        id: rel.id,
        source_entity_id: rel.source_entity_id,
        target_entity_id: rel.target_entity_id,
        relation_type: rel.relation_type as RelationType,
        interview_id: rel.interview_id,
      },
      interviewId: rel.interview_id,
    },
  };
}

function nowIso() {
  return new Date().toISOString();
}

function isValidRelationType(value: string): value is RelationType {
  return (RELATION_TYPE_VALUES as readonly string[]).includes(value);
}

/**
 * Reject a relationship. The row is preserved so reprocess (and the
 * persistence gate) know not to recreate this exact triple.
 */
export async function rejectRelationship(
  relationshipId: string
): Promise<ActionResult> {
  const gate = await requireInterviewEditorForRelationship(relationshipId);
  if (!gate.ok) return { error: gate.error };
  const { admin, userId, interviewId } = gate.ctx;

  const { error } = await admin
    .from("entity_relationships")
    .update({
      review_status: "rejected",
      reviewed_by: userId,
      reviewed_at: nowIso(),
    })
    .eq("id", relationshipId);

  if (error) return { error: error.message };

  revalidatePath(`/interviews/${interviewId}`);
  return { success: true };
}

/** Mark a relationship as approved. */
export async function approveRelationship(
  relationshipId: string
): Promise<ActionResult> {
  const gate = await requireInterviewEditorForRelationship(relationshipId);
  if (!gate.ok) return { error: gate.error };
  const { admin, userId, interviewId } = gate.ctx;

  const { error } = await admin
    .from("entity_relationships")
    .update({
      review_status: "approved",
      reviewed_by: userId,
      reviewed_at: nowIso(),
    })
    .eq("id", relationshipId);

  if (error) return { error: error.message };

  revalidatePath(`/interviews/${interviewId}`);
  return { success: true };
}

/** Reset editorial state back to `pending` (undo a reject/approve click). */
export async function restoreRelationship(
  relationshipId: string
): Promise<ActionResult> {
  const gate = await requireInterviewEditorForRelationship(relationshipId);
  if (!gate.ok) return { error: gate.error };
  const { admin, interviewId } = gate.ctx;

  const { error } = await admin
    .from("entity_relationships")
    .update({
      review_status: "pending",
      reviewed_by: null,
      reviewed_at: null,
    })
    .eq("id", relationshipId);

  if (error) return { error: error.message };

  revalidatePath(`/interviews/${interviewId}`);
  return { success: true };
}

/**
 * Change the relation type of an existing relationship.
 *
 * Editorial intent of an edit is "this exact triple is wrong, replace it":
 *   1. The original row is flipped to `review_status='rejected'` so the LLM
 *      cannot re-create it on the next reprocess.
 *   2. A new row carrying the new `relation_type` is inserted with
 *      `origin='human_edited'` and `review_status='approved'`. If a row for
 *      the new triple already exists (rare race), we approve it in place.
 */
export async function updateRelationshipType(
  relationshipId: string,
  newRelationType: RelationType
): Promise<ActionResult> {
  if (!isValidRelationType(newRelationType)) {
    return { error: "Invalid relation type" };
  }

  const gate = await requireInterviewEditorForRelationship(relationshipId);
  if (!gate.ok) return { error: gate.error };
  const { admin, userId, relationship, interviewId } = gate.ctx;

  if (relationship.relation_type === newRelationType) {
    return { success: true };
  }

  const reviewedAt = nowIso();

  // Step 1 — reject the original triple
  const { error: rejectError } = await admin
    .from("entity_relationships")
    .update({
      review_status: "rejected",
      reviewed_by: userId,
      reviewed_at: reviewedAt,
    })
    .eq("id", relationshipId);

  if (rejectError) return { error: rejectError.message };

  // Step 2 — does a row for the new triple already exist on this interview?
  const { data: existing, error: existingError } = await admin
    .from("entity_relationships")
    .select("id")
    .eq("interview_id", relationship.interview_id)
    .eq("source_entity_id", relationship.source_entity_id)
    .eq("target_entity_id", relationship.target_entity_id)
    .eq("relation_type", newRelationType)
    .maybeSingle();

  if (existingError) return { error: existingError.message };

  if (existing) {
    const { error: approveError } = await admin
      .from("entity_relationships")
      .update({
        review_status: "approved",
        origin: "human_edited",
        reviewed_by: userId,
        reviewed_at: reviewedAt,
      })
      .eq("id", existing.id);

    if (approveError) return { error: approveError.message };
  } else {
    const { error: insertError } = await admin
      .from("entity_relationships")
      .insert({
        source_entity_id: relationship.source_entity_id,
        target_entity_id: relationship.target_entity_id,
        relation_type: newRelationType,
        confidence: 1,
        evidence_text: null,
        interview_id: relationship.interview_id,
        origin: "human_edited",
        review_status: "approved",
        reviewed_by: userId,
        reviewed_at: reviewedAt,
      });

    if (insertError) return { error: insertError.message };
  }

  revalidatePath(`/interviews/${interviewId}`);
  return { success: true };
}
