"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  memo,
  startTransition,
} from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, MessageSquare, Shield, Plus, X, BookOpen, Briefcase, ArrowUp } from "lucide-react";
import { IntelligenceActivityStatus } from "@/components/chat/intelligence-activity-status";
import { IntelligenceBriefMarkdown } from "@/components/chat/intelligence-brief-markdown";
import { uiMessageFromDbRow } from "@/lib/chat/uimessage-from-db";
import {
  stashChatHydrateSeed,
  takeChatHydrateSeed,
} from "@/lib/chat/hydrate-seed-storage";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CopilotMode } from "@/lib/chat/prompt-builder";
import {
  SourceCitationCard,
  type SourceCard,
} from "@/components/chat/source-citation-card";

const COPILOT_MODE_LABELS: Record<CopilotMode, string> = {
  general_context: "General Context",
  sales: "Sales",
};

const MAX_MESSAGES_CLIENT = 200;
const INITIAL_MESSAGE_LIMIT = 40;

type EvidenceSourceRow = {
  id: string;
  title: string;
  source_type: string;
  summary: string | null;
  interviewee_name: string | null;
  interviewee_org: string | null;
  project_id: string;
};

type EvidenceChip = {
  id: string;
  chunk_id: string;
  position: number;
  similarity: number;
  used_in_text: boolean;
  source_chunks: {
    id: string;
    source_id: string;
    speaker: string | null;
    start_time: number | null;
    content: string | null;
    sources: EvidenceSourceRow | null;
  } | null;
};

type ApiChatMessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sequence: number;
  client_message_id: string | null;
  chat_message_evidence?: EvidenceChip[] | null;
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
      <div
        className="max-w-md rounded-[10px] px-4 py-3 text-[12.5px] font-medium leading-[1.55] text-foreground/88"
        style={{
          background: "rgba(91,156,246,0.09)",
          border: "1px solid rgba(91,156,246,0.22)",
          letterSpacing: "-0.011em",
        }}
      >
        {text}
      </div>
    </div>
  );
});

/**
 * Aggregates flat evidence rows into one SourceCard per source_id,
 * then renders a row of citation cards.
 */
const SourceCitationCards = memo(function SourceCitationCards({
  evidence,
}: {
  evidence: EvidenceChip[];
}) {
  const bySource = new Map<string, SourceCard>();

  for (const e of evidence) {
    const chunk = e.source_chunks;
    if (!chunk?.source_id) continue;
    const sid = chunk.source_id;
    const src = chunk.sources;

    if (!bySource.has(sid)) {
      bySource.set(sid, {
        sourceId: sid,
        title: src?.title ?? sid,
        sourceType: src?.source_type ?? "text",
        summary: src?.summary ?? null,
        intervieweeName: src?.interviewee_name ?? null,
        intervieweeOrg: src?.interviewee_org ?? null,
        citedPositions: [],
        totalChunks: 0,
        usedInText: false,
        excerpts: [],
      });
    }

    const card = bySource.get(sid)!;
    card.totalChunks += 1;
    if (e.used_in_text) {
      card.usedInText = true;
      // Deduplicate: position values must be unique per card
      if (!card.citedPositions.includes(e.position)) {
        card.citedPositions.push(e.position);
      }
    }
    if (chunk.content) {
      card.excerpts.push({
        content: chunk.content,
        speaker: chunk.speaker,
        startTime: chunk.start_time,
        position: e.position,
        usedInText: e.used_in_text,
      });
    }
  }

  if (bySource.size === 0) return null;

  // Sort each card's cited positions ascending
  for (const card of bySource.values()) {
    card.citedPositions.sort((a, b) => a - b);
  }

  // Sort cards: cited sources first, then by lowest cited position (or totalChunks)
  const cards = [...bySource.values()].sort((a, b) => {
    if (a.usedInText !== b.usedInText) return a.usedInText ? -1 : 1;
    const aMin = a.citedPositions[0] ?? Infinity;
    const bMin = b.citedPositions[0] ?? Infinity;
    return aMin - bMin;
  });

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {cards.map((card) => (
        <SourceCitationCard key={card.sourceId} card={card} />
      ))}
    </div>
  );
});

/**
 * Strip the LLM-generated "Sources" section from assistant text.
 * The prompt instructs the model to append a "Sources" heading + citations,
 * but that content is now replaced by citation cards — rendering both is
 * redundant and visually noisy.
 *
 * Matches any markdown heading form on its own line:
 *   ## Sources  /  **Sources**  /  Sources
 */
function stripSourcesSection(text: string): string {
  const idx = text.search(/\n(?:#{1,6} +|\*{1,2})?Sources\*{0,2} *(\n|$)/m);
  if (idx === -1) return text;
  return text.slice(0, idx).trimEnd();
}

const AssistantBlock = memo(function AssistantBlock({
  text,
  evidence,
}: {
  text: string;
  evidence?: EvidenceChip[] | null;
}) {
  const hasCards = evidence && evidence.length > 0;
  const displayText = hasCards ? stripSourcesSection(text) : text;

  return (
    <article className="w-full max-w-[40rem] text-foreground">
      <IntelligenceBriefMarkdown>{displayText}</IntelligenceBriefMarkdown>
      {hasCards && <SourceCitationCards evidence={evidence} />}
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
  /** Skip initial GET /messages when we just navigated from /chat/new with in-memory seed. */
  const hydratedFromSeedRef = useRef(false);
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
  /**
   * Explicitly selected copilot mode. null = no chip shown; effective mode is
   * always "general_context" when null (sent to the backend that way too).
   */
  const [selectedMode, setSelectedMode] = useState<CopilotMode | null>(null);
  const effectiveCopilotMode: CopilotMode = selectedMode ?? "general_context";
  const [evidenceByMessageId, setEvidenceByMessageId] = useState<
    Record<string, EvidenceChip[]>
  >({});

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
          copilotMode: effectiveCopilotMode,
        },
      }),
    [
      conversationId,
      effectiveConversationId,
      projectIdFromUrl,
      interviewIdFromUrl,
      effectiveCopilotMode,
    ]
  );

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport,
    experimental_throttle: 50,
    onFinish: ({ messages: latestMessages }) => {
      const cid = pendingConversationIdRef.current;
      if (cid && !conversationId) {
        stashChatHydrateSeed(cid, latestMessages);
        pendingConversationIdRef.current = null;
        startTransition(() => {
          router.replace(`/chat/${cid}`, { scroll: false });
        });
      }
    },
  });

  useEffect(() => {
    if (conversationId) {
      setBootstrapConversationId(null);
    }
  }, [conversationId]);

  useLayoutEffect(() => {
    hydratedFromSeedRef.current = false;
    if (!conversationId || hydrateSuspended) {
      return;
    }
    const seeded = takeChatHydrateSeed(conversationId);
    if (seeded && seeded.length > 0) {
      setMessages(seeded);
      setOldestSequence(null);
      setHasMoreOlder(false);
      setHydrateError(null);
      setHydrated(true);
      hydratedFromSeedRef.current = true;
    }
  }, [conversationId, hydrateSuspended, setMessages]);

  useEffect(() => {
    if (!conversationId || hydrateSuspended) {
      setHydrated(true);
      return;
    }

    if (hydratedFromSeedRef.current) {
      hydratedFromSeedRef.current = false;
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
        const evidenceMap: Record<string, EvidenceChip[]> = {};
        for (const row of data.messages) {
          if (row.role === "assistant" && row.chat_message_evidence?.length) {
            evidenceMap[row.id] = row.chat_message_evidence;
          }
        }
        setEvidenceByMessageId(evidenceMap);
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
      const olderEvidence: Record<string, EvidenceChip[]> = {};
      for (const row of data.messages) {
        if (row.role === "assistant" && row.chat_message_evidence?.length) {
          olderEvidence[row.id] = row.chat_message_evidence;
        }
      }
      setEvidenceByMessageId((prev) => ({ ...prev, ...olderEvidence }));
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

                return (
                  <AssistantBlock
                    key={message.id}
                    text={text}
                    evidence={evidenceByMessageId[message.id] ?? null}
                  />
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
            className="mx-auto max-w-3xl"
          >
            {/* Single composer box — textarea + inner controls */}
            <div className="flex flex-col rounded-2xl border border-sidebar-border/55 bg-sidebar transition-[color,background-color,border-color,box-shadow] focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-ring/15">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about your interviews…"
                className="min-h-[5.5rem] max-h-[min(40vh,260px)] resize-none rounded-t-2xl rounded-b-none border-0 bg-transparent px-4 pb-2 pt-4 text-[15px] leading-relaxed shadow-none outline-none ring-0 placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:outline-none"
                disabled={isLoading}
                aria-busy={isLoading}
              />

              {/* Inner bottom bar */}
              <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-1">
                {/* Left: mode selector + active chip */}
                <div className="flex min-w-0 items-center gap-1.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        disabled={isLoading}
                        aria-label="Select copilot mode"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted/60 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-44">
                      <DropdownMenuItem
                        onSelect={() => setSelectedMode("general_context")}
                        className="gap-2"
                      >
                        <BookOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        General Context
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setSelectedMode("sales")}
                        className="gap-2"
                      >
                        <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        Sales
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {selectedMode !== null && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                      {selectedMode === "sales" ? (
                        <Briefcase className="h-3 w-3 shrink-0" aria-hidden />
                      ) : (
                        <BookOpen className="h-3 w-3 shrink-0" aria-hidden />
                      )}
                      {COPILOT_MODE_LABELS[selectedMode]}
                      <button
                        type="button"
                        onClick={() => setSelectedMode(null)}
                        aria-label={`Remove ${COPILOT_MODE_LABELS[selectedMode]} mode`}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  )}
                </div>

                {/* Right: send button */}
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  aria-label="Send message"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </div>
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
          Aksum
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
                <img src="/ak.svg" alt="" className={className} aria-hidden />
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
