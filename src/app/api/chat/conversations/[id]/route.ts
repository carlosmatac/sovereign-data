import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const TITLE_MIN = 1;
const TITLE_MAX = 200;

async function assertCanAccessConversation(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  conversationId: string
): Promise<
  | { ok: true }
  | { ok: false; status: number; message: string }
> {
  const { data: conv, error } = await admin
    .from("chat_conversations")
    .select("id, user_id, project_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (error || !conv) {
    return { ok: false, status: 404, message: "Conversation not found" };
  }

  if (conv.user_id !== userId) {
    return { ok: false, status: 404, message: "Conversation not found" };
  }

  if (conv.project_id) {
    const { data: mem } = await admin
      .from("project_members")
      .select("user_id")
      .eq("project_id", conv.project_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!mem) {
      return { ok: false, status: 403, message: "Forbidden" };
    }
  }

  return { ok: true };
}

/**
 * PATCH /api/chat/conversations/[id]
 * Body: { title: string } — manual rename; sets title_user_set so auto-titling never overwrites.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id: conversationId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const rawTitle =
    typeof body === "object" &&
    body !== null &&
    "title" in body &&
    typeof (body as { title: unknown }).title === "string"
      ? (body as { title: string }).title
      : null;

  if (rawTitle === null) {
    return new Response("Missing title", { status: 400 });
  }

  const title = rawTitle.trim();
  if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
    return new Response(
      `Title must be between ${TITLE_MIN} and ${TITLE_MAX} characters`,
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const access = await assertCanAccessConversation(
    admin,
    user.id,
    conversationId
  );
  if (!access.ok) {
    return new Response(access.message, { status: access.status });
  }

  const { error } = await admin
    .from("chat_conversations")
    .update({ title, title_user_set: true })
    .eq("id", conversationId);

  if (error) {
    console.error("[chat-conversations] PATCH", error);
    return new Response("Failed to update title", { status: 500 });
  }

  return Response.json({
    id: conversationId,
    title,
    title_user_set: true,
  });
}

/**
 * DELETE /api/chat/conversations/[id]
 * Removes the conversation row; `chat_messages` and `chat_conversation_seq` cascade from DB FKs.
 */
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id: conversationId } = await context.params;
  const admin = createAdminClient();
  const access = await assertCanAccessConversation(
    admin,
    user.id,
    conversationId
  );
  if (!access.ok) {
    return new Response(access.message, { status: access.status });
  }

  const { error } = await admin
    .from("chat_conversations")
    .delete()
    .eq("id", conversationId);

  if (error) {
    console.error("[chat-conversations] DELETE", error);
    return new Response("Failed to delete conversation", { status: 500 });
  }

  return new Response(null, { status: 204 });
}
