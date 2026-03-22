"use client";

import { useSearchParams } from "next/navigation";
import { IntelligenceChatView } from "@/components/chat/intelligence-chat-view";

export default function NewChatPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");
  const interviewId = searchParams.get("interview");

  return (
    <IntelligenceChatView
      conversationId={null}
      projectIdFromUrl={projectId}
      interviewIdFromUrl={interviewId}
    />
  );
}
