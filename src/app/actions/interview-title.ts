"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type ActionResult = { success: true } | { error: string };

const MAX_TITLE_LEN = 255;

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

/**
 * Update the title of an interview.
 * Only owners and editors of the project may rename an interview.
 */
export async function updateInterviewTitle(
  interviewId: string,
  newTitle: string
): Promise<ActionResult> {
  try {
    const { admin } = await requireInterviewEditor(interviewId);

    const title = newTitle.trim();

    if (!title) {
      return { error: "Interview title cannot be empty." };
    }

    if (title.length > MAX_TITLE_LEN) {
      return { error: `Title is too long (max ${MAX_TITLE_LEN} characters).` };
    }

    const { error: updateError } = await admin
      .from("interviews")
      .update({ title })
      .eq("id", interviewId);

    if (updateError) {
      return { error: updateError.message };
    }

    revalidatePath(`/interviews/${interviewId}`);
    revalidatePath("/interviews");

    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Update failed" };
  }
}
