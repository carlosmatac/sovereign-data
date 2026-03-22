"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, MessageSquare, Shield } from "lucide-react";
import { IntelligenceActivityStatus } from "@/components/chat/intelligence-activity-status";
import { IntelligenceBriefMarkdown } from "@/components/chat/intelligence-brief-markdown";
import { uiMessageFromDbRow } from "@/lib/chat/uimessage-from-db";
import { Button } from "@/components/ui/button";

const MAX_MESSAGES_CLIENT = 200;
const INITIAL_MESSAGE_LIMIT = 40;

type ApiChatMessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sequence: number;
  client_message_id: string | null;
};

function getMessageText(
  parts: Array<{ type: string; text?: string; [key: string]: unknown }>
): string {
  return parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("");
}

const UserBubble = memo(function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-md rounded-3xl border border-border/80 bg-primary px-5 py-4 text-[14px] leading-relaxed text-primary-foreground shadow-md md:px-6 md:py-[1.125rem]">
        {text}
      </div>
    </div>
  );
});

const AssistantBlock = memo(function AssistantBlock({ text }: { text: string }) {
  return (
    <article className="w-full max-w-[40rem] text-foreground">
      <IntelligenceBriefMarkdown>{text}</IntelligenceBriefMarkdown>
    </article>
  );
});

export type IntelligenceChatViewProps = {
  /** null = lazy-create conversation on first POST */
  conversationId: string | null;
  projectIdFromUrl?: string | null;
  interviewIdFromUrl?: string | null;
  /** When set, skip client fetch (e.g. still loading thread) */
  hydrateSuspended?: boolean;
};

export function IntelligenceChatView({
  conversationId,
  projectIdFromUrl = null,
  interviewIdFromUrl = null,
  hydrateSuspended = false,
}: IntelligenceChatViewProps) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingConversationIdRef = useRef<string | null>(null);
  /** Set from X-Conversation-Id as soon as the first bootstrap response arrives (before stream ends). */
  const [bootstrapConversationId, setBootstrapConversationId] = useState<
    string | null
  >(null);
  const [input, setInput] = useState("");
  const [hydrated, setHydrated] = useState(!conversationId);
  const [hydrateError, setHydrateError] = useState<string | null>(null);
  const [oldestSequence, setOldestSequence] = useState<number | null>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const effectiveConversationId = conversationId ?? bootstrapConversationId;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          const cid = res.headers.get("X-Conversation-Id");
          if (cid) {
            pendingConversationIdRef.current = cid;
            if (!conversationId) {
              setBootstrapConversationId(cid);
            }
          }
          return res;
        },
        body: {
          ...(effectiveConversationId
            ? { conversationId: effectiveConversationId }
            : {}),
          ...(projectIdFromUrl ? { projectId: projectIdFromUrl } : {}),
          ...(interviewIdFromUrl ? { interviewId: interviewIdFromUrl } : {}),
        },
      }),
    [
      conversationId,
      effectiveConversationId,
      projectIdFromUrl,
      interviewIdFromUrl,
    ]
  );

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport,
    experimental_throttle: 50,
    onFinish: () => {
      const cid = pendingConversationIdRef.current;
      if (cid && !conversationId) {
        pendingConversationIdRef.current = null;
        router.replace(`/chat/${cid}`);
      }
    },
  });

  useEffect(() => {
    if (conversationId) {
      setBootstrapConversationId(null);
    }
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || hydrateSuspended) {
      setHydrated(true);
      return;
    }

    let cancelled = false;
    setHydrated(false);
    setHydrateError(null);

    async function load() {
      try {
        const res = await fetch(
          `/api/chat/conversations/${conversationId}/messages?limit=${INITIAL_MESSAGE_LIMIT}`
        );
        if (!res.ok) {
          throw new Error(
            res.status === 404 ? "Conversation not found" : "Failed to load"
          );
        }
        const data = (await res.json()) as {
          messages: ApiChatMessageRow[];
          hasMore: boolean;
        };
        if (cancelled) return;
        const ui = data.messages.map((row) => uiMessageFromDbRow(row));
        setMessages(ui);
        const seqs = data.messages.map((m) => m.sequence);
        setOldestSequence(seqs.length ? Math.min(...seqs) : null);
        setHasMoreOlder(data.hasMore);
      } catch (e) {
        if (!cancelled) {
          setHydrateError(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [conversationId, hydrateSuspended, setMessages]);

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

  const loadOlder = useCallback(async () => {
    if (
      !conversationId ||
      !hasMoreOlder ||
      loadingOlder ||
      oldestSequence === null ||
      messages.length >= MAX_MESSAGES_CLIENT
    ) {
      return;
    }
    setLoadingOlder(true);
    try {
      const res = await fetch(
        `/api/chat/conversations/${conversationId}/messages?limit=${INITIAL_MESSAGE_LIMIT}&beforeSequence=${oldestSequence}`
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages: ApiChatMessageRow[];
        hasMore: boolean;
      };
      const olderUi = data.messages.map((row) => uiMessageFromDbRow(row));
      const prevLen = messages.length;
      const mergedLen = olderUi.length + prevLen;
      const needsTrim = mergedLen > MAX_MESSAGES_CLIENT;

      setMessages((prev) => {
        const merged = [...olderUi, ...prev] as UIMessage[];
        return needsTrim
          ? merged.slice(merged.length - MAX_MESSAGES_CLIENT)
          : merged;
      });

      if (data.messages.length) {
        const minSeq = Math.min(...data.messages.map((m) => m.sequence));
        setOldestSequence(minSeq);
      }
      setHasMoreOlder(data.hasMore && !needsTrim);
    } finally {
      setLoadingOlder(false);
    }
  }, [
    conversationId,
    hasMoreOlder,
    loadingOlder,
    oldestSequence,
    messages.length,
    setMessages,
  ]);

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

  const showLoadOlder =
    conversationId &&
    hasMoreOlder &&
    hydrated &&
    messages.length < MAX_MESSAGES_CLIENT;

  if (conversationId && !hydrated && !hydrateError) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
      </div>
    );
  }

  if (hydrateError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <p className="text-sm text-destructive">{hydrateError}</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/chat")}>
          Back to chats
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full max-h-full w-full min-w-0 flex-col overflow-hidden bg-background text-foreground">
      <div className="flex min-h-0 flex-1 flex-col bg-background">
        {showLoadOlder ? (
          <div className="flex shrink-0 justify-center border-b border-border/40 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              disabled={loadingOlder}
              onClick={() => void loadOlder()}
            >
              {loadingOlder ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Loading…
                </>
              ) : (
                "Load older messages"
              )}
            </Button>
          </div>
        ) : null}

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
                  return <UserBubble key={message.id} text={text} />;
                }

                return <AssistantBlock key={message.id} text={text} />;
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
