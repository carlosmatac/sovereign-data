"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send,
  Loader2,
  Bot,
  User,
  Sparkles,
  MessageSquare,
  Globe,
  Shield,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function ChatPage() {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: projectId ? { projectId } : undefined,
      }),
    [projectId]
  );

  const { messages, sendMessage, status, error } = useChat({ transport });

  const isLoading = status === "submitted" || status === "streaming";

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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

  /** Extract plain text from a UIMessage's parts */
  const getMessageText = (
    parts: Array<{ type: string; text?: string; [key: string]: unknown }>
  ): string => {
    return parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join("");
  };

  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col p-6">
      {/* Header */}
      <div className="mb-4 shrink-0">
        <h1 className="text-3xl font-bold tracking-tight">
          Intelligence Chat
        </h1>
        <p className="mt-1 text-muted-foreground">
          Conversational AI grounded in your interview transcripts. Every answer
          is sourced and verifiable.
        </p>
      </div>

      {/* Chat Area */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto rounded-lg border bg-muted/20 p-4"
        >
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-6">
              {messages.map((message) => {
                const text = getMessageText(message.parts);
                if (!text) return null;

                return (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.role === "user" ? "justify-end" : ""
                    }`}
                  >
                    {message.role === "assistant" && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Bot className="h-4 w-4" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-3 ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-background border shadow-sm"
                      }`}
                    >
                      {message.role === "assistant" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none [&_a]:text-primary [&_a]:underline">
                          <ReactMarkdown>{text}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-sm">{text}</p>
                      )}
                    </div>
                    {message.role === "user" && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                );
              })}
              {isLoading &&
                messages.length > 0 &&
                messages[messages.length - 1]?.role === "user" && (
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="rounded-lg border bg-background px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          Searching interviews & generating response...
                        </span>
                      </div>
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Input Area */}
        <form onSubmit={onSubmit} className="mt-3 flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your interviews... (Enter to send, Shift+Enter for new line)"
            className="min-h-[52px] max-h-[120px] resize-none"
            rows={1}
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            className="h-[52px] w-[52px] shrink-0"
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
          <p className="mt-2 text-sm text-destructive">
            Error: {error.message}
          </p>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <h2 className="mb-2 text-lg font-semibold">
          Intelligence at your fingertips
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Ask questions about your interviews and get AI-powered answers
          grounded in real transcript data. Every response includes citations you
          can verify.
        </p>
        <div className="grid gap-2 text-left">
          {[
            {
              icon: Globe,
              text: "What are the key risks in Mozambique's energy sector?",
            },
            {
              icon: Shield,
              text: "Which companies were mentioned as potential partners?",
            },
            {
              icon: MessageSquare,
              text: "Summarize the interview findings on infrastructure",
            },
          ].map((example) => (
            <div
              key={example.text}
              className="flex items-start gap-2 rounded-lg border p-3 text-xs text-muted-foreground"
            >
              <example.icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{example.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
