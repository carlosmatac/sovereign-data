import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type AdminClient = SupabaseClient<Database>;

const DEFAULT_TITLE_MAX = 80;

export function titleFromFirstUserText(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? text;
  const t = line.trim();
  if (!t) return "New chat";
  return t.length <= DEFAULT_TITLE_MAX
    ? t
    : `${t.slice(0, DEFAULT_TITLE_MAX - 1)}…`;
}

async function nextSequence(
  admin: AdminClient,
  conversationId: string
): Promise<number | null> {
  const { data, error } = await admin.rpc("next_chat_message_sequence", {
    p_conversation_id: conversationId,
  });
  if (error) {
    console.error("[chat-persist] next_chat_message_sequence", error);
    return null;
  }
  if (typeof data !== "number") return null;
  return data;
}

export async function findUserMessageByClientId(
  admin: AdminClient,
  conversationId: string,
  clientMessageId: string
): Promise<string | null> {
  const { data } = await admin
    .from("chat_messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("client_message_id", clientMessageId)
    .maybeSingle();
  return data?.id ?? null;
}

export async function persistUserTurn(params: {
  admin: AdminClient;
  conversationId: string;
  tenantId: string;
  clientMessageId: string;
  content: string;
}): Promise<
  | { ok: true; userMessageDbId: string }
  | { ok: false; response: Response }
> {
  const { admin, conversationId, tenantId, clientMessageId, content } = params;

  const existing = await findUserMessageByClientId(
    admin,
    conversationId,
    clientMessageId
  );
  if (existing) {
    return {
      ok: false,
      response: new Response("Duplicate message", { status: 409 }),
    };
  }

  const seq = await nextSequence(admin, conversationId);
  if (seq === null) {
    return {
      ok: false,
      response: new Response("Failed to allocate message sequence", {
        status: 500,
      }),
    };
  }

  const { data: inserted, error } = await admin
    .from("chat_messages")
    .insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      role: "user",
      content,
      sequence: seq,
      client_message_id: clientMessageId,
      user_message_id: null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    if (error?.code === "23505") {
      return {
        ok: false,
        response: new Response("Duplicate message", { status: 409 }),
      };
    }
    console.error("[chat-persist] insert user message", error);
    return {
      ok: false,
      response: new Response("Failed to save message", { status: 500 }),
    };
  }

  if (content.trim().length > 0) {
    const newTitle = titleFromFirstUserText(content);
    if (newTitle !== "New chat") {
      await admin
        .from("chat_conversations")
        .update({ title: newTitle })
        .eq("id", conversationId)
        .eq("title", "New chat")
        .eq("title_user_set", false);
    }
  }

  return { ok: true, userMessageDbId: inserted.id };
}

export async function persistAssistantTurn(params: {
  admin: AdminClient;
  conversationId: string;
  tenantId: string;
  userMessageDbId: string;
  text: string;
}): Promise<string | null> {
  const { admin, conversationId, tenantId, userMessageDbId, text } = params;

  const seq = await nextSequence(admin, conversationId);
  if (seq === null) return null;

  const { data: inserted, error } = await admin
    .from("chat_messages")
    .insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      role: "assistant",
      content: text,
      sequence: seq,
      client_message_id: null,
      user_message_id: userMessageDbId,
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    return null;
  }
  if (error || !inserted) {
    console.error("[chat-persist] insert assistant message", error);
    return null;
  }

  return inserted.id;
}

export async function persistChatEvidence(params: {
  admin: AdminClient;
  messageId: string;
  tenantId: string;
  ragChunks: Array<{ chunk_id: string; similarity: number }>;
  text: string;
}): Promise<void> {
  const { admin, messageId, tenantId, ragChunks, text } = params;
  if (ragChunks.length === 0) return;

  const citedPositions = new Set(
    [...(text.match(/\[(\d+)\]/g) ?? [])].map((m) =>
      parseInt(m.slice(1, -1), 10)
    )
  );

  const rows = ragChunks.map((chunk, i) => ({
    message_id: messageId,
    tenant_id: tenantId,
    chunk_id: chunk.chunk_id,
    similarity: chunk.similarity,
    position: i + 1,
    used_in_text: citedPositions.has(i + 1),
  }));

  const { error } = await admin.from("chat_message_evidence").insert(rows);
  if (error) {
    console.error("[chat-persist] insert evidence", error);
  }
}
