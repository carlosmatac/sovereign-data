"use client";

import { useParams } from "next/navigation";
import { IntelligenceChatView } from "@/components/chat/intelligence-chat-view";

export default function ConversationChatPage() {
  const params = useParams();
  const raw = params.conversationId;
  const conversationId = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";

  if (!conversationId) {
    return null;
  }

  return <IntelligenceChatView conversationId={conversationId} />;
}
