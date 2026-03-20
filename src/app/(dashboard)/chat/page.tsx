"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Sparkles, MessageSquare, Shield } from "lucide-react";
import { IntelligenceActivityStatus } from "@/components/chat/intelligence-activity-status";
import { IntelligenceBriefMarkdown } from "@/components/chat/intelligence-brief-markdown";

export default function ChatPage() {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");
  const interviewId = searchParams.get("interview");

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: {
          ...(projectId ? { projectId } : {}),
          ...(interviewId ? { interviewId } : {}),
        },
      }),
    [projectId, interviewId]
  );

  const { messages, sendMessage, status, error } = useChat({ transport });

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, status]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const text = input;
    setInput("");
    await sendMessage({ text });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e);
    }
  };

  const getMessageText = (
    parts: Array<{ type: string; text?: string; [key: string]: unknown }>
  ): string => {
    return parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join("");
  };

  const lastMessage = messages[messages.length - 1];
  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === "user");
  const assistantPendingEmpty =
    lastMessage?.role === "assistant" &&
    getMessageText(lastMessage.parts).trim() === "";
  const showIntelligenceActivity =
    isLoading &&
    messages.length > 0 &&
    (lastMessage?.role === "user" || assistantPendingEmpty);

  return (
    <div className="flex min-h-[calc(100dvh-2.5rem)] w-full flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-border px-6 py-6 md:px-10 md:py-7">
        <div className="mx-auto max-w-3xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Intelligence workspace
          </p>
          <h1 className="mt-1.5 text-xl font-semibold tracking-tight md:text-2xl">
            Intelligence Chat
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Grounded answers from your interview corpus. Citations and sources
            are shown in the response — verify every claim against the record.
          </p>
          {(projectId || interviewId) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {projectId && (
                <span className="rounded-xl border border-border bg-card px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground shadow-sm">
                  Project scope
                </span>
              )}
              {interviewId && (
                <span className="rounded-xl border border-border bg-card px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground shadow-sm">
                  Single interview
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-6 py-9 md:px-10 md:py-11"
      >
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-16 md:gap-[4.5rem]">
            {messages.map((message) => {
              const text = getMessageText(message.parts);
              if (!text) return null;

              if (message.role === "user") {
                return (
                  <div key={message.id} className="flex justify-end">
                    <div className="max-w-md rounded-3xl border border-border/80 bg-primary px-5 py-4 text-[14px] leading-relaxed text-primary-foreground shadow-md md:px-6 md:py-[1.125rem]">
                      {text}
                    </div>
                  </div>
                );
              }

              return (
                <article
                  key={message.id}
                  className="w-full max-w-[40rem] text-foreground"
                >
                  <IntelligenceBriefMarkdown>{text}</IntelligenceBriefMarkdown>
                </article>
              );
            })}

            {showIntelligenceActivity && (
              <div className="w-full max-w-[40rem]">
                <IntelligenceActivityStatus
                  key={lastUserMessage?.id ?? "none"}
                  phase={
                    status === "streaming" ? "streaming" : "submitted"
                  }
                />
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="shrink-0 rounded-t-3xl border-t border-border bg-card/80 px-6 py-5 backdrop-blur-sm md:px-10 md:py-6">
        <form
          onSubmit={onSubmit}
          className="mx-auto flex max-w-3xl items-end gap-3 md:gap-4"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pose a question… (Enter to send, Shift+Enter for line break)"
            className="min-h-[56px] max-h-[160px] resize-none rounded-2xl border-[1.5px] border-input bg-background px-4 py-3.5 text-[15px] leading-snug shadow-sm placeholder:text-muted-foreground focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/20"
            rows={1}
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            className="h-14 w-14 shrink-0 rounded-2xl shadow-sm"
            disabled={!input.trim() || isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
        {error && (
          <p className="mx-auto mt-4 max-w-3xl rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error.message}
          </p>
        )}
      </footer>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[min(420px,50vh)] items-center justify-center px-2">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
          <Sparkles
            className="h-7 w-7 text-primary"
            strokeWidth={1.5}
          />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">
          Research copilot
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Ask analytical questions; responses read as structured briefs with
          transcript-backed context. Start with a focused question below.
        </p>
        <div className="mt-8 grid gap-2.5 text-left">
          {[
            {
              icon: ({ className }: { className?: string }) => (
                <img src="/SD.svg" alt="" className={className} aria-hidden />
              ),
              text: "What are the key risks in Mozambique's energy sector?",
            },
            {
              icon: Shield,
              text: "Which companies were mentioned as potential partners?",
            },
            {
              icon: MessageSquare,
              text: "Summarize interview findings on infrastructure investment.",
            },
          ].map((example) => (
            <div
              key={example.text}
              className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-[13px] leading-snug text-muted-foreground shadow-sm"
            >
              <example.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{example.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
