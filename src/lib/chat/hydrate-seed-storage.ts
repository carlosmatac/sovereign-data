import type { UIMessage } from "ai";

const PREFIX = "sovereign-chat-hydrate-";

export function stashChatHydrateSeed(
  conversationId: string,
  messages: UIMessage[]
): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      `${PREFIX}${conversationId}`,
      JSON.stringify(messages)
    );
  } catch {
    // quota / private mode — navigation still works without seed
  }
}

export function takeChatHydrateSeed(conversationId: string): UIMessage[] | null {
  if (typeof window === "undefined") return null;
  const key = `${PREFIX}${conversationId}`;
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  sessionStorage.removeItem(key);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed as UIMessage[];
  } catch {
    return null;
  }
}
