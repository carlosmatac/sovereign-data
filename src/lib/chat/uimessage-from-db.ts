import type { UIMessage } from "ai";
import type { ChatMessageRole } from "@/types/database";

export function uiMessageFromDbRow(row: {
  id: string;
  role: ChatMessageRole;
  content: string;
  client_message_id: string | null;
}): UIMessage {
  const id =
    row.role === "user" && row.client_message_id
      ? row.client_message_id
      : row.id;

  return {
    id,
    role: row.role,
    parts: [{ type: "text", text: row.content }],
  };
}
