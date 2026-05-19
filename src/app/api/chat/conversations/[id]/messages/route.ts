import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/chat/conversations/:id/messages?limit=40&beforeSequence=
 * Paginated messages in chronological order (ascending sequence).
 */
export async function GET(
  request: Request,
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

  const { data: conv, error: convErr } = await supabase
    .from("chat_conversations")
    .select("id")
    .eq("id", conversationId)
    .maybeSingle();

  if (convErr || !conv) {
    return new Response("Not found", { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const rawLimit = Number(searchParams.get("limit") ?? "40");
  const limit = Number.isFinite(rawLimit)
    ? Math.min(100, Math.max(1, Math.floor(rawLimit)))
    : 40;

  const beforeRaw = searchParams.get("beforeSequence");
  const beforeSequence =
    beforeRaw !== null && beforeRaw !== "" ? Number(beforeRaw) : null;
  const beforeOk =
    beforeSequence !== null &&
    Number.isFinite(beforeSequence) &&
    beforeSequence > 0;

  const fetchLimit = limit + 1;

  let q = supabase
    .from("chat_messages")
    .select(
      `id, role, content, sequence, client_message_id, user_message_id, created_at,
       chat_message_evidence(id, chunk_id, position, similarity, used_in_text,
         source_chunks(id, source_id, speaker, start_time, content,
           sources(id, title, source_type, summary, interviewee_name, interviewee_org, project_id)))`
    )
    .eq("conversation_id", conversationId)
    .order("sequence", { ascending: false })
    .limit(fetchLimit);

  if (beforeOk) {
    q = q.lt("sequence", beforeSequence!);
  }

  const { data: rows, error } = await q;

  if (error) {
    console.error("[chat-messages] list", error);
    return new Response("Failed to load messages", { status: 500 });
  }

  const batch = rows ?? [];
  const hasMore = batch.length > limit;
  const trimmed = hasMore ? batch.slice(0, limit) : batch;
  const chronological = [...trimmed].reverse();

  return Response.json({
    messages: chronological,
    hasMore,
  });
}
