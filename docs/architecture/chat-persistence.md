# Chat persistence (Intelligence Chat) — V1

Server-side storage for Intelligence Chat threads and text messages, with RLS and a short context window for the model.

## Schema

- **`chat_conversations`**: `id`, `user_id` → `profiles`, optional `project_id` / `interview_id`, `title` (default `New chat`), **`title_user_set`** (boolean, default false), timestamps. `updated_at` is bumped when messages are inserted (trigger) and via the standard `update_updated_at` trigger on row updates.
- **`chat_messages`**: `id`, `conversation_id`, `role` (`user` | `assistant`), `content` (plain text only in V1), `sequence` (monotonic per conversation), optional `client_message_id` (client `UIMessage.id` for user rows), optional `user_message_id` (assistant rows → parent user row `id`).
- **`chat_conversation_seq`**: one row per conversation, `next_val` advanced atomically via **`next_chat_message_sequence(uuid)`** (plpgsql, `SECURITY DEFINER`, **execute granted only to `service_role`**). Inserts use the admin client after `getUser()`; clients never call this RPC directly.

### Ordering and dedupe

- **Sequence**: never `max(sequence)+1` without locking; always allocate through `next_chat_message_sequence` in the same persistence flow as the insert.
- **User dedupe**: partial unique index on `(conversation_id, client_message_id)` where `client_message_id` is not null. Duplicate POST → **409**.
- **Assistant dedupe**: partial unique index on `(conversation_id, user_message_id)` for `role = assistant`. Second insert (e.g. retry) hits **23505**; server treats as no-op.

## Model context (6 + 1)

For `streamText`, the server sends at most **six** prior UI messages plus the **latest** user message:

`prior = messages.slice(0, -1).slice(-6)`, `last = messages.at(-1)`, `forModel = [...prior, last]`.

Full client history may be larger; persistence stores **each turn** (last user message in the POST body).

## Title (automatic vs manual)

- **Automatic (cheap):** on the first user message, if `title` is still **`New chat`** and **`title_user_set` is false**, set `title` from that message (trim, first line, max ~80 chars). No LLM.
- **Manual rename:** `PATCH /api/chat/conversations/[id]` with `{ "title": "…" }` updates `title` and sets **`title_user_set: true`**. After that, **automatic titling never runs** for that row (the auto-update filters on `title_user_set = false`).
- If the user never renames, behaviour matches the original V1 rule: once auto-title replaces `New chat`, later messages do not change the title (the auto path only matches `title = 'New chat'`).

## `X-Conversation-Id`

On every `POST /api/chat`, the streamed response includes header **`X-Conversation-Id`** (the active conversation UUID). On the **first** turn of `/chat/new`, the client reads this header (custom `fetch` on `DefaultChatTransport`) so the next request includes `conversationId` in the JSON body **before** navigation completes. After the assistant finishes, the client runs **`router.replace(/chat/[id])`** so the URL matches the thread without tearing down the stream early.

## API

| Method | Path | Role |
|--------|------|------|
| GET | `/api/chat/conversations?limit=50` | User session; RLS. Last **50** threads for `auth.uid()`, `updated_at DESC`. **No project filter in V1.** |
| GET | `/api/chat/conversations/[id]/messages?limit=&beforeSequence=` | User session; RLS. Newest-first fetch then returned **chronological**; `limit+1` used to compute `hasMore`. |
| PATCH | `/api/chat/conversations/[id]` | After `getUser()`, **admin client**; body `{ title }` (1–200 chars). Verifies `user_id` and project membership when `project_id` is set; sets `title_user_set`. |
| DELETE | `/api/chat/conversations/[id]` | After `getUser()`, **admin client**; same access checks as PATCH. Deletes the conversation row; **`chat_messages`** and **`chat_conversation_seq`** removed via **`ON DELETE CASCADE`**. |
| POST | `/api/chat` | After `getUser()`, admin client for writes and RAG. Body: `messages`, optional `conversationId`, optional `projectId` / `interviewId` (bootstrap only). If `conversationId` is set, **project/interview scope comes from the row**, not the URL/body. |

## UI shell

- Conversation list is **nested under “Intelligence Chat”** in the dashboard **`AppSidebar`** (`SidebarMenuSub`: New chat, Recent, thread links). The `/chat` layout is **content-only** (full-width transcript next to the global sidebar), similar in spirit to ChatGPT’s sidebar hierarchy.

## Client caps

- Initial hydrate: **~40** messages; **“Load older messages”** uses `beforeSequence`.
- **~200** messages max in memory: stop prepending / loading more when reached; no standing user-facing warning unless you hit an edge case worth explaining.

## Rehydration (AI SDK v6)

DB rows map to `UIMessage` with a single text part. **Tool / reasoning parts are not restored** in V1.

## Limitations (V1)

- History is **text-only**; tool traces are not replayed.
- Regenerate / advanced SDK flows may need extra rules later.
- If reading `X-Conversation-Id` ever failed in a given environment, the fallback would be a minimal protocol extension (document here); current implementation relies on the header + body `conversationId`.
