"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
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
          {!projectId && !interviewId && (
            <p className="mt-3 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              For questions about a specific programme (e.g. &ldquo;Nigeria
              2026&rdquo;), open{" "}
              <Link
                href="/projects"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Projects
              </Link>{" "}
              and use{" "}
              <span className="font-medium text-foreground">
                Intelligence Chat
              </span>{" "}
              from that project — or stay here: workspace summaries are still
              loaded for all your projects.
            </p>
          )}
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

      {/* Scroll only the conversation; input stays fixed to bottom of this workspace */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 py-9 md:px-10 md:py-11"
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

        <footer className="shrink-0 rounded-t-3xl border-t border-border bg-card/90 px-6 py-4 backdrop-blur-md md:px-10 md:py-5">
          <form
            onSubmit={handleFormSubmit}
            className="mx-auto max-w-3xl"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your interviews…"
              className="min-h-[7.5rem] max-h-[min(40vh,280px)] resize-y rounded-2xl border-[1.5px] border-input bg-background px-4 py-4 text-[15px] leading-relaxed shadow-sm placeholder:text-muted-foreground focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/20"
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
