import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/chat/conversations?limit=50
 * Last N conversations for the current user (updated_at desc). V1: no project filter.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawLimit = Number(searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(rawLimit)
    ? Math.min(50, Math.max(1, Math.floor(rawLimit)))
    : 50;

  const { data, error } = await supabase
    .from("chat_conversations")
    .select("id, title, updated_at, project_id, interview_id")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[chat-conversations] list", error);
    return new Response("Failed to load conversations", { status: 500 });
  }

  return Response.json({ conversations: data ?? [] });
}
