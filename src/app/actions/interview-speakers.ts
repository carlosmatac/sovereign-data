"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SpeakerMap } from "@/types/database";

type ActionResult = { success: true } | { error: string };

async function requireInterviewEditor(interviewId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();
  const { data: interview, error } = await admin
    .from("interviews")
    .select("id, project_id")
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

  return { admin, interview };
}

const MAX_NAME_LEN = 120;

/**
 * Update display names in speaker_map. Stable keys (diarization ids) must match the
 * existing map; only values may change.
 */
export async function updateInterviewSpeakerMap(
  interviewId: string,
  nextMap: Record<string, string>
): Promise<ActionResult> {
  try {
    const { admin } = await requireInterviewEditor(interviewId);

    const { data: row, error: fetchError } = await admin
      .from("interviews")
      .select("speaker_map")
      .eq("id", interviewId)
      .single();

    if (fetchError || !row) {
      return { error: "Interview not found" };
    }

    const prev = (row.speaker_map as SpeakerMap) ?? {};
    const prevKeys = Object.keys(prev).sort();
    const nextKeys = Object.keys(nextMap).sort();

    if (
      prevKeys.length !== nextKeys.length ||
      prevKeys.some((k, i) => k !== nextKeys[i])
    ) {
      return {
        error: "Speaker identifiers cannot be added or removed; rename display names only.",
      };
    }

    const sanitized: SpeakerMap = {};
    for (const k of prevKeys) {
      const raw = nextMap[k];
      if (typeof raw !== "string") {
        return { error: "Invalid speaker name." };
      }
      const v = raw.trim();
      if (!v) {
        return { error: `Display name for speaker ${k} cannot be empty.` };
      }
      if (v.length > MAX_NAME_LEN) {
        return { error: `Display name for speaker ${k} is too long.` };
      }
      sanitized[k] = v;
    }

    const { error: updateError } = await admin
      .from("sources")
      .update({ speaker_map: sanitized })
      .eq("id", interviewId);

    if (updateError) {
      return { error: updateError.message };
    }

    revalidatePath(`/interviews/${interviewId}`);
    revalidatePath(`/interviews/${interviewId}/review`);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Update failed" };
  }
}
