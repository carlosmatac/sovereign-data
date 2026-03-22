import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type AdminClient = SupabaseClient<Database>;

export type ResolvedConversation =
  | {
      ok: true;
      conversationId: string;
      projectId: string | null;
      interviewId: string | null;
      isNew: boolean;
    }
  | { ok: false; response: Response };

async function assertProjectMember(
  admin: AdminClient,
  userId: string,
  projectId: string
): Promise<boolean> {
  const { data } = await admin
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

/**
 * Validates interview exists; if projectId is set it must match the interview's project.
 * When only interviewId is provided, returns the interview's project_id for persistence.
 */
export async function normalizeInterviewProjectScope(
  admin: AdminClient,
  interviewId: string,
  projectId: string | null
): Promise<
  | { ok: true; projectId: string | null; interviewId: string }
  | { ok: false; response: Response }
> {
  const { data: row, error } = await admin
    .from("interviews")
    .select("id, project_id")
    .eq("id", interviewId)
    .maybeSingle();

  if (error || !row) {
    return {
      ok: false,
      response: new Response("Interview not found", { status: 400 }),
    };
  }

  if (projectId && row.project_id !== projectId) {
    return {
      ok: false,
      response: new Response(
        "interviewId does not belong to the given projectId",
        { status: 400 }
      ),
    };
  }

  return {
    ok: true,
    projectId: projectId ?? row.project_id,
    interviewId: row.id,
  };
}

export async function resolveChatConversation(params: {
  admin: AdminClient;
  userId: string;
  conversationId: string | null | undefined;
  bodyProjectId: string | null;
  bodyInterviewId: string | null;
}): Promise<ResolvedConversation> {
  const { admin, userId, conversationId, bodyProjectId, bodyInterviewId } =
    params;

  if (conversationId) {
    const { data: conv, error } = await admin
      .from("chat_conversations")
      .select("id, user_id, project_id, interview_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (error || !conv) {
      return {
        ok: false,
        response: new Response("Conversation not found", { status: 404 }),
      };
    }

    if (conv.user_id !== userId) {
      return { ok: false, response: new Response("Forbidden", { status: 403 }) };
    }

    if (conv.project_id) {
      const member = await assertProjectMember(admin, userId, conv.project_id);
      if (!member) {
        return {
          ok: false,
          response: new Response("Forbidden", { status: 403 }),
        };
      }
    }

    return {
      ok: true,
      conversationId: conv.id,
      projectId: conv.project_id,
      interviewId: conv.interview_id,
      isNew: false,
    };
  }

  let projectId = bodyProjectId;
  let interviewId = bodyInterviewId;

  if (interviewId) {
    const norm = await normalizeInterviewProjectScope(
      admin,
      interviewId,
      projectId
    );
    if (!norm.ok) return norm;
    projectId = norm.projectId;
    interviewId = norm.interviewId;
  }

  if (projectId) {
    const member = await assertProjectMember(admin, userId, projectId);
    if (!member) {
      return {
        ok: false,
        response: new Response("Forbidden", { status: 403 }),
      };
    }
  }

  const { data: created, error: insertErr } = await admin
    .from("chat_conversations")
    .insert({
      user_id: userId,
      project_id: projectId,
      interview_id: interviewId,
      title: "New chat",
    })
    .select("id")
    .single();

  if (insertErr || !created) {
    console.error("[chat-persist] create conversation", insertErr);
    return {
      ok: false,
      response: new Response("Failed to create conversation", { status: 500 }),
    };
  }

  const { error: seqErr } = await admin.from("chat_conversation_seq").insert({
    conversation_id: created.id,
    next_val: 0,
  });

  if (seqErr) {
    console.error("[chat-persist] create sequence row", seqErr);
    return {
      ok: false,
      response: new Response("Failed to initialize conversation", {
        status: 500,
      }),
    };
  }

  return {
    ok: true,
    conversationId: created.id,
    projectId,
    interviewId,
    isNew: true,
  };
}
