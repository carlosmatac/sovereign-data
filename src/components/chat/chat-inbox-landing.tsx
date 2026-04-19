"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Loader2, MessageSquare, Plus } from "lucide-react";
import {
  SectionSurface,
  IconWell,
  TonalActionButton,
} from "@/components/panels";

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
    <div className="flex min-h-0 flex-1 flex-col overflow-auto px-6 py-8 md:px-10 md:py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1
              className="text-[28px] font-semibold text-white"
              style={{ letterSpacing: "-0.020em", lineHeight: 1.05 }}
            >
              Copilot
            </h1>
            <p className="mt-1.5 text-[13px] text-white/62">
              Open a recent conversation or start a new one.
            </p>
          </div>
          <TonalActionButton
            href="/chat/new"
            icon={<Plus className="h-[12px] w-[12px]" strokeWidth={2} />}
          >
            New chat
          </TonalActionButton>
        </header>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-20 text-white/45">
            <Loader2 className="size-7 animate-spin" aria-hidden strokeWidth={1.5} />
          </div>
        ) : items.length === 0 ? (
          <SectionSurface bodyClassName="flex flex-col items-center px-6 py-14 text-center">
            <MessageSquare
              className="mb-4 size-9 text-white/28"
              strokeWidth={1.5}
            />
            <p className="text-[14px] font-semibold text-white/92">
              No conversations yet
            </p>
            <p className="mt-1.5 text-[12.5px] text-white/60">
              Start your first chat to explore your interview intelligence.
            </p>
            <div className="mt-6">
              <TonalActionButton
                href="/chat/new"
                icon={<Plus className="h-[12px] w-[12px]" strokeWidth={2} />}
              >
                New chat
              </TonalActionButton>
            </div>
          </SectionSurface>
        ) : (
          <SectionSurface
            header={{ title: "Recent conversations" }}
            bodyClassName="p-2"
          >
            <ul className="flex flex-col">
              {items.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/chat/${c.id}`}
                    className="group flex items-start gap-3 rounded-[5px] px-2.5 py-2.5 transition-colors duration-150 hover:bg-white/[0.025]"
                  >
                    <IconWell accent="#5B9CF6" size={30}>
                      <MessageSquare
                        className="h-[13px] w-[13px]"
                        style={{ color: "#5B9CF6" }}
                        strokeWidth={1.8}
                      />
                    </IconWell>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-[13px] font-medium text-white/92">
                        {c.title}
                      </p>
                      <p className="mt-[4px] text-[11px] text-white/45">
                        Updated{" "}
                        {formatDistanceToNow(new Date(c.updated_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </SectionSurface>
        )}
      </div>
    </div>
  );
}
