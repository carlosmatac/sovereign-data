"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { Check, MoreHorizontal, Pencil, SquarePen, Trash2, X } from "lucide-react";
import { toast } from "sonner";

type ConversationRow = {
  id: string;
  title: string;
  updated_at: string;
};

const TITLE_MAX = 200;

/**
 * Nested thread list under Intelligence Chat in the app sidebar (ChatGPT-style).
 */
export function IntelligenceChatNavThreads() {
  const pathname = usePathname();
  const router = useRouter();
  const [items, setItems] = useState<ConversationRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/conversations?limit=50");
      if (!res.ok) return;
      const data = (await res.json()) as { conversations: ConversationRow[] };
      setItems(data.conversations ?? []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [pathname, loadList]);

  useEffect(() => {
    if (!editingId) return;
    const el = document.getElementById(
      `chat-sidebar-rename-${editingId}`
    ) as HTMLInputElement | null;
    el?.focus();
    el?.select();
  }, [editingId]);

  const beginRename = useCallback((c: ConversationRow) => {
    setEditingId(c.id);
    setEditValue(c.title);
  }, []);

  const cancelRename = useCallback(() => {
    setEditingId(null);
    setEditValue("");
  }, []);

  const commitRename = useCallback(
    async (id: string) => {
      const next = editValue.trim();
      if (!next) {
        toast.error("Title cannot be empty");
        return;
      }
      if (next.length > TITLE_MAX) {
        toast.error(`Title must be at most ${TITLE_MAX} characters`);
        return;
      }

      setSavingId(id);
      try {
        const res = await fetch(`/api/chat/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: next }),
        });
        if (!res.ok) {
          toast.error(
            res.status === 400
              ? "Invalid title"
              : "Could not rename conversation"
          );
          return;
        }
        const data = (await res.json()) as { title: string };
        setItems((prev) =>
          prev.map((row) =>
            row.id === id ? { ...row, title: data.title } : row
          )
        );
        setEditingId(null);
        setEditValue("");
        toast.success("Chat renamed");
      } catch {
        toast.error("Could not rename conversation");
      } finally {
        setSavingId(null);
      }
    },
    [editValue]
  );

  const deleteConversation = useCallback(
    async (c: ConversationRow) => {
      const label =
        c.title.length > 60 ? `${c.title.slice(0, 60)}…` : c.title;
      if (
        !confirm(
          `Delete “${label}”?\n\nThis removes the conversation and all its messages. This cannot be undone.`
        )
      ) {
        return;
      }

      setDeletingId(c.id);
      try {
        const res = await fetch(`/api/chat/conversations/${c.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          toast.error("Could not delete chat");
          return;
        }
        setItems((prev) => prev.filter((row) => row.id !== c.id));
        if (pathname === `/chat/${c.id}`) {
          router.replace("/chat");
        }
        router.refresh();
        toast.success("Chat deleted");
      } catch {
        toast.error("Could not delete chat");
      } finally {
        setDeletingId(null);
      }
    },
    [pathname, router]
  );

  return (
    <SidebarMenuSub className="max-h-[min(50vh,22rem)] overflow-y-auto overflow-x-hidden border-sidebar-border">
      <SidebarMenuSubItem>
        <SidebarMenuSubButton asChild size="sm">
          <Link href="/chat/new" className="gap-2">
            <SquarePen className="size-3.5 shrink-0" />
            <span>New chat</span>
          </Link>
        </SidebarMenuSubButton>
      </SidebarMenuSubItem>

      <SidebarMenuSubItem className="pointer-events-none select-none py-1.5">
        <span className="text-sidebar-foreground/50 px-2 text-[10px] font-medium tracking-wide uppercase">
          Recent
        </span>
      </SidebarMenuSubItem>

      {items.length === 0 ? (
        <SidebarMenuSubItem className="pointer-events-none">
          <span className="text-sidebar-foreground/60 px-2 text-xs">
            No conversations yet.
          </span>
        </SidebarMenuSubItem>
      ) : (
        items.map((c) => {
          const active = pathname === `/chat/${c.id}`;
          const editing = editingId === c.id;

          if (editing) {
            return (
              <SidebarMenuSubItem key={c.id}>
                <div className="border-sidebar-border bg-sidebar-accent/20 w-full rounded-md border px-2 py-1.5">
                  <Input
                    id={`chat-sidebar-rename-${c.id}`}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    maxLength={TITLE_MAX}
                    disabled={savingId === c.id}
                    className="h-7 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void commitRename(c.id);
                      }
                      if (e.key === "Escape") cancelRename();
                    }}
                  />
                  <div className="mt-1.5 flex justify-end gap-0.5">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      disabled={savingId === c.id}
                      onClick={cancelRename}
                      aria-label="Cancel rename"
                    >
                      <X className="size-3" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="h-6 w-6"
                      disabled={savingId === c.id}
                      onClick={() => void commitRename(c.id)}
                      aria-label="Save title"
                    >
                      <Check className="size-3" />
                    </Button>
                  </div>
                </div>
              </SidebarMenuSubItem>
            );
          }

          return (
            <SidebarMenuSubItem key={c.id}>
              <div
                className={cn(
                  "group/subthread flex w-full min-w-0 items-center gap-0.5 rounded-md",
                  active && "bg-sidebar-accent"
                )}
              >
                <SidebarMenuSubButton
                  asChild
                  size="sm"
                  isActive={active}
                  className="min-w-0 flex-1 pr-1"
                >
                  <Link href={`/chat/${c.id}`} title={c.title}>
                    <span className="truncate">{c.title}</span>
                  </Link>
                </SidebarMenuSubButton>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={deletingId === c.id}
                      className="text-sidebar-foreground/80 hover:text-sidebar-accent-foreground mr-0.5 h-6 w-6 shrink-0 opacity-0 group-hover/subthread:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                      aria-label={`Options for ${c.title}`}
                    >
                      <MoreHorizontal className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem
                      onSelect={() => beginRename(c)}
                      className="gap-2"
                    >
                      <Pencil className="size-3.5" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      className="gap-2"
                      onSelect={() => {
                        void deleteConversation(c);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                      Delete chat
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </SidebarMenuSubItem>
          );
        })
      )}
    </SidebarMenuSub>
  );
}
