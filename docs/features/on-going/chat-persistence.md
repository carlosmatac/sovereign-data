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
- Sidebar threads (nested under Intelligence Chat): `src/components/dashboard/intelligence-chat-nav-threads.tsx`, `app-sidebar.tsx`
- Helpers: `src/lib/chat/resolve-conversation.ts`, `persist-messages.ts`, `uimessage-from-db.ts`
- Architecture: [`docs/architecture/chat-persistence.md`](../../architecture/chat-persistence.md)

## How to test

1. Apply migration locally (`supabase db reset` or `supabase migration up`).
2. Open `/chat` → **New chat** → send a message → URL should become `/chat/<uuid>`; refresh and history should reload.
3. Optional: `/chat/new?project=<uuid>&interview=<uuid>` — first POST should persist scope; reopening the thread should keep scope from DB even if URL query is omitted.

## UX note (Intelligence Chat + sidebar)

- **Thread list** is nested **under the Intelligence Chat row** in the global sidebar (`SidebarMenuSub`), ChatGPT-style: chevron toggles expand/collapse; **New chat** + **Recent** + conversation links with ⋯ → Rename (inline). Sidebar icon/collapsed mode hides the nested list (icon still links to `/chat`).
- **Chat layout** is content-only (no second column rail).
- **Rename / delete:** ⋯ menu — **Rename** (PATCH) or **Delete chat** (`window.confirm` then `DELETE`); if the open thread is deleted, redirect to `/chat`; list updates locally + `router.refresh()`.

## Implementation note — automatic vs manual title

| Situation | Behaviour |
|-----------|-----------|
| New thread, first user message | If title is still `New chat` and `title_user_set` is false → auto title from first message text (~80 chars). |
| User renames via sidebar | `title` updated, `title_user_set = true` → **no future auto title** for that conversation. |
| Auto title already applied (title ≠ `New chat`, flag still false) | Unchanged; auto path only matches `title = 'New chat'`. |

## Open questions

- None tracked here; product can add project-scoped list in a later version.
