import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * DELETE /api/interviews/[id]
 *
 * Deletes an interview and all associated data.
 * CASCADE handles: interview_chunks, entity_mentions,
 * entity_relationships, content_snippets.
 * Audio file is removed from Storage separately.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Fetch interview to get audio_url and verify it exists
  const { data: interview, error: fetchError } = await admin
    .from("interviews")
    .select("id, audio_url, project_id")
    .eq("id", id)
    .single();

  if (fetchError || !interview) {
    return NextResponse.json(
      { error: "Interview not found" },
      { status: 404 }
    );
  }

  // Delete audio file from Storage if it exists
  if (interview.audio_url) {
    const bucketName = "interview-audio";
    const urlParts = interview.audio_url.split(`${bucketName}/`);
    const filePath = urlParts[1];

    if (filePath) {
      const { error: storageError } = await admin.storage
        .from(bucketName)
        .remove([filePath]);

      if (storageError) {
        console.error("Failed to delete audio file:", storageError);
        // Continue with interview deletion even if storage cleanup fails
      }
    }
  }

  // Delete interview record (CASCADE handles all related tables)
  const { error: deleteError } = await admin
    .from("sources")
    .delete()
    .eq("id", id);

  if (deleteError) {
    console.error("Failed to delete interview:", deleteError);
    return NextResponse.json(
      { error: "Failed to delete interview" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
