---
title: Chat persistence V1
status: on-going
last_updated: 2026-03-22
---

# Chat persistence V1

**Spec / plan:** aligned with the internal delivery plan (DB, 6+1 slice, `X-Conversation-Id`, list of 50 threads, lazy row on first send).

## Key files

- Migrations: `supabase/migrations/00019_chat_persistence.sql`, `00020_chat_conversation_title_user_set.sql`
- POST: `src/app/api/chat/route.ts`
- List / rename / delete / messages: `src/app/api/chat/conversations/route.ts`, `src/app/api/chat/conversations/[id]/route.ts` (PATCH + DELETE), `src/app/api/chat/conversations/[id]/messages/route.ts`
- UI: `src/app/(dashboard)/chat/layout.tsx`, `page.tsx`, `new/page.tsx`, `[conversationId]/page.tsx`, `src/components/chat/intelligence-chat-view.tsx`
- Sidebar threads (nested under Copilot): `src/components/dashboard/intelligence-chat-nav-threads.tsx`, `app-sidebar.tsx`
- Helpers: `src/lib/chat/resolve-conversation.ts`, `persist-messages.ts`, `uimessage-from-db.ts`
- Architecture: [`docs/architecture/chat-persistence.md`](../../architecture/chat-persistence.md)

## How to test

1. Apply migration locally (`supabase db reset` or `supabase migration up`).
2. Open `/chat` → **New chat** → send a message → URL should become `/chat/<uuid>`; refresh and history should reload.
3. Optional: `/chat/new?project=<uuid>&interview=<uuid>` — first POST should persist scope; reopening the thread should keep scope from DB even if URL query is omitted.

## UX note (Copilot + sidebar)

- **Thread list** is nested under **Copilot** only while the route is under `/chat/**` (no chevron; same row alignment as other Platform links). Submenu uses `SidebarMenuSub` (New chat, Recent, threads, ⋯ rename/delete). Collapsed sidebar hides the sub list via existing shadcn rules.
- **`/chat` landing** shows **ChatInboxLanding**: recent conversations in the main pane + **New chat**, same API as the sidebar list.
- **First message from `/chat/new`:** latest `UIMessage[]` is stashed in `sessionStorage` before `router.replace(/chat/[id], { scroll: false })` inside `startTransition`; the thread view applies the seed in `useLayoutEffect` and skips the initial GET to avoid a full reload spinner while keeping messages visible.
- **Rename / delete:** unchanged (PATCH / DELETE + confirm + redirect if needed).

## Implementation note — automatic vs manual title

| Situation | Behaviour |
|-----------|-----------|
| New thread, first user message | If title is still `New chat` and `title_user_set` is false → auto title from first message text (~80 chars). |
| User renames via sidebar | `title` updated, `title_user_set = true` → **no future auto title** for that conversation. |
| Auto title already applied (title ≠ `New chat`, flag still false) | Unchanged; auto path only matches `title = 'New chat'`. |

## Open questions

- None tracked here; product can add project-scoped list in a later version.
