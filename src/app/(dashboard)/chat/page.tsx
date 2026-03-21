"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, MessageSquare, Shield } from "lucide-react";
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

  const sendCurrentInput = async () => {
    if (!input.trim() || isLoading) return;
    const text = input;
    setInput("");
    await sendMessage({ text });
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendCurrentInput();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendCurrentInput();
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
    <div className="flex h-[calc(100dvh-2.5rem)] max-h-[calc(100dvh-2.5rem)] w-full flex-col overflow-hidden bg-background text-foreground">
      {/* Single canvas: one background token end-to-end (no card-white band) */}
      <div className="flex min-h-0 flex-1 flex-col bg-background">
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-background px-6 pb-4 pt-8 md:px-10 md:pb-5 md:pt-10"
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

        <footer className="shrink-0 bg-background px-6 pb-6 pt-1 md:px-10 md:pb-8">
          <form
            onSubmit={handleFormSubmit}
            className="mx-auto max-w-3xl bg-background"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your interviews…"
              className="min-h-[7.5rem] max-h-[min(40vh,280px)] resize-y rounded-2xl border border-sidebar-border/55 bg-sidebar px-4 py-4 text-[15px] leading-relaxed shadow-none placeholder:text-muted-foreground transition-[color,background-color,border-color,box-shadow] focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/15"
              rows={5}
              disabled={isLoading}
              aria-busy={isLoading}
            />
            <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
              <span>
                <kbd className="rounded border border-border bg-muted/80 px-1.5 py-0.5 font-mono text-[10px] font-medium text-foreground/80">
                  Enter
                </kbd>{" "}
                to send ·{" "}
                <kbd className="rounded border border-border bg-muted/80 px-1.5 py-0.5 font-mono text-[10px] font-medium text-foreground/80">
                  Shift
                </kbd>
                +
                <kbd className="rounded border border-border bg-muted/80 px-1.5 py-0.5 font-mono text-[10px] font-medium text-foreground/80">
                  Enter
                </kbd>{" "}
                new line
              </span>
              {isLoading && (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Loader2
                    className="h-3.5 w-3.5 shrink-0 animate-spin"
                    aria-hidden
                  />
                  Working…
                </span>
              )}
            </div>
          </form>
          {error && (
            <p className="mx-auto mt-3 max-w-3xl rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error.message}
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[min(420px,50vh)] items-center justify-center px-2">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-muted/50 shadow-none">
          <Sparkles
            className="h-7 w-7 text-primary"
            strokeWidth={1.5}
          />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">
          Sovereign Data
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Ask analytical questions; responses read as structured briefs with
          transcript-backed context. Start with a focused question below.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Tip: for &ldquo;what do we know about project X?&rdquo;, open chat
          from that project&apos;s page so search is scoped, or ask here —
          project and summary data is included automatically.
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
              className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3.5 text-[13px] leading-snug text-muted-foreground shadow-none"
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
