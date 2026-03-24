"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Loader2, MessageSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

type ConversationRow = {
  id: string;
  title: string;
  updated_at: string;
};

export function ChatInboxLanding() {
  const [items, setItems] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/chat/conversations?limit=50");
      if (!res.ok) {
        setItems([]);
        return;
      }
      const data = (await res.json()) as { conversations: ConversationRow[] };
      setItems(data.conversations ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-background px-6 py-8 md:px-10 md:py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Intelligence Chat
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Open a recent conversation or start a new one.
            </p>
          </div>
          <Button asChild className="shrink-0 gap-2">
            <Link href="/chat/new">
              <Plus className="size-4" />
              New chat
            </Link>
          </Button>
        </header>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="size-8 animate-spin" aria-hidden />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-muted/20 px-6 py-12 text-center">
            <MessageSquare className="mx-auto size-10 text-muted-foreground/80" />
            <p className="mt-4 text-sm font-medium text-foreground">
              No conversations yet
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Start your first chat to explore your interview intelligence.
            </p>
            <Button asChild className="mt-6 gap-2">
              <Link href="/chat/new">
                <Plus className="size-4" />
                New chat
              </Link>
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {items.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/chat/${c.id}`}
                  className="hover:bg-muted/60 flex flex-col gap-0.5 rounded-xl border border-transparent px-4 py-3 transition-colors hover:border-border"
                >
                  <span className="line-clamp-2 text-sm font-medium text-foreground">
                    {c.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Updated{" "}
                    {formatDistanceToNow(new Date(c.updated_at), {
                      addSuffix: true,
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
