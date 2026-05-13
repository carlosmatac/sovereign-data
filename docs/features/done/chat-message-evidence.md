---
id: chat-message-evidence
title: "Phase 4a — Persisted chat message evidence"
status: done
owner: carlos
last_updated: 2026-05-10
phase: 4a
migrations:
  - supabase/migrations/00039_chat_message_evidence.sql
related:
  - docs/roadmaps/database-refactor-plan.md § Phase 4a
  - docs/architecture/tenant-model-adr.md § 3.8a (Tier A — chat_message_evidence)
  - docs/features/on-going/reprocess-transactional-swap.md
---

# Phase 4a — Persisted chat message evidence

## Problem

Every Copilot response cites RAG chunks inline with `[1]`, `[2]`, … markers. The
chunks are known at stream time (`ragChunks` array in the route closure) but
they are never persisted. After the page reloads or the conversation is viewed
in a new session, the citations are still present as text in the message
content, but there is no structured data linking them to the actual
`source_chunks` rows. A user cannot click through from `[1]` to the source
interview.

## Goal

1. **Write:** at the end of every assistant turn, persist one `chat_message_evidence`
   row per RAG chunk that was surfaced, noting whether the LLM actually cited it
   (`used_in_text`).
2. **Read:** when a conversation thread is loaded/reloaded, return the evidence
   rows alongside the messages so the UI can render citation chips linking back
   to the source interview.

## Non-goals (Phase 4a)

- Rendering citation popups or inline chunk previews (deferred to Phase 5+).
- Writing evidence for tool-call results (entity mentions, relationships) — only
  RAG chunks are evidenced here.
- Backfilling evidence for messages that were already persisted before this
  phase shipped (data is disposable test data).

---

## Schema

### New table: `public.chat_message_evidence`

```sql
CREATE TABLE chat_message_evidence (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id   UUID NOT NULL,
  tenant_id    UUID NOT NULL,
  chunk_id     UUID NOT NULL REFERENCES source_chunks(id) ON DELETE CASCADE,
  similarity   FLOAT NOT NULL,
  position     INT  NOT NULL,   -- 1-based: [1] = position 1
  used_in_text BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Compound FK enforces tenant boundary without a join (Phase 3a forward-compat)
  CONSTRAINT chat_message_evidence_message_tenant_fkey
    FOREIGN KEY (message_id, tenant_id)
    REFERENCES chat_messages(id, tenant_id)
    ON DELETE CASCADE
);
```

**Prerequisite:** `chat_messages` must have `UNIQUE (id, tenant_id)` so the
compound FK above is valid. Migration 00039 adds this constraint.

**Indexes:**
- `(message_id)` — primary evidence lookup by message
- `(tenant_id)` — RLS + potential future tenant-scoped audit

**RLS:** `is_tenant_member(tenant_id)` (same pattern as every Tier A table).

### Why compound FK?

Carrying `tenant_id` on every evidence row and referencing
`chat_messages(id, tenant_id)` via compound FK gives us:
1. Direct `is_tenant_member(tenant_id)` enforcement without a multi-hop join.
2. Structural impossibility of inserting an evidence row whose tenant differs
   from its parent message's tenant.

---

## Write path

**Files:** `src/lib/chat/persist-messages.ts`, `src/app/api/chat/route.ts`

### `persistAssistantTurn` — returns inserted message ID

`persistAssistantTurn` now returns `string | null` (the UUID of the inserted
`chat_messages` row) instead of `Promise<void>`. The caller (`onFinish`) uses
this ID to write evidence rows.

### `persistChatEvidence` — new helper

```typescript
export async function persistChatEvidence(params: {
  admin: AdminClient;
  messageId: string;
  tenantId: string;
  ragChunks: { chunk_id: string; similarity: number }[];
  text: string;
}): Promise<void>
```

- Parses citation markers `[1]`, `[2]`, … from `text` to build a set of
  cited 1-based positions.
- Builds one evidence row per `ragChunks[i]`:
  - `position = i + 1`
  - `used_in_text = citedPositions.has(i + 1)`
- Does a single `INSERT` (not N individual inserts) for efficiency.
- Logs and continues on error (evidence is additive — a failure here must
  not crash the response delivery).

### `onFinish` (in `route.ts`)

```typescript
async onFinish({ text }) {
  const assistantMessageId = await persistAssistantTurn({ ... });
  if (assistantMessageId && ragChunks.length > 0) {
    await persistChatEvidence({
      admin,
      messageId: assistantMessageId,
      tenantId: activeTenantId,
      ragChunks,
      text,
    });
  }
}
```

---

## Read path

**File:** `src/app/api/chat/conversations/[id]/messages/route.ts`

The messages API extends its select to include evidence for assistant messages:

```
chat_message_evidence(
  id, chunk_id, position, similarity, used_in_text,
  source_chunks(id, source_id, speaker, start_time)
)
```

(PostgREST resolves the FK from `chat_message_evidence.message_id` →
`chat_messages.id`.)

The response shape for each message becomes:
```typescript
{
  id: string;
  role: "user" | "assistant";
  content: string;
  sequence: number;
  client_message_id: string | null;
  user_message_id: string | null;
  created_at: string;
  chat_message_evidence: Array<{
    id: string;
    chunk_id: string;
    position: number;
    similarity: number;
    used_in_text: boolean;
    source_chunks: { id: string; source_id: string; speaker: string | null; start_time: number | null } | null;
  }> | null;
}
```

The UI converts the evidence array into citation chips rendered below each
assistant message.

---

## UI rendering

**File:** `src/components/chat/intelligence-chat-view.tsx`

`AssistantBlock` receives an optional `evidence` prop (the array above). If
the array has entries, a "Sources" row is rendered below the markdown text:
- One chip per unique source (deduplicated by `source_id`).
- Each chip links to `/interviews/{source_id}`.
- Chips show citation position(s) (e.g. `[1] [3]`) and speaker label if
  available.

During streaming (before `onFinish` has fired), `evidence` is `null` — no
sources row is shown until the message is fully persisted and the thread
reloads. This is intentional; citations in the text are still visible while
streaming.

---

## Key files touched

| File | Change |
|------|--------|
| `supabase/migrations/00039_chat_message_evidence.sql` | New migration |
| `src/lib/chat/persist-messages.ts` | `persistAssistantTurn` returns ID; new `persistChatEvidence` |
| `src/app/api/chat/route.ts` | `onFinish` calls `persistChatEvidence` |
| `src/app/api/chat/conversations/[id]/messages/route.ts` | Extended select + evidence in response |
| `src/types/database.ts` | `chat_message_evidence` table + relationships |
| `src/components/chat/intelligence-chat-view.tsx` | `AssistantBlock` + evidence chips; `ApiChatMessageRow` extended |

---

## Validation steps

1. `npx tsc --noEmit` — zero type errors.
2. `npm test` — all existing tests pass.
3. `supabase db push --dry-run` then `supabase db push`.
4. Post-push DB check: `SELECT COUNT(*) FROM chat_message_evidence;` → 0 (empty).
5. Open the app, send a question, let the stream complete, then reload the
   page. The evidence chips should appear below the assistant message.
6. DB check: `SELECT * FROM chat_message_evidence LIMIT 5;` → rows present.

---

## Remaining risks

| # | Risk | Severity | Mitigation |
|---|------|----------|-----------|
| R1 | `persistChatEvidence` fails silently | Low | Logged to console; doesn't block response delivery. |
| R2 | `chunk_id` references a deleted source chunk | Low | `ON DELETE CASCADE` removes orphan evidence rows automatically. |
| R3 | Large context windows (30 chunks) insert many evidence rows | Low | Single bulk `INSERT`; negligible storage. |
| R4 | PostgREST ambiguity on `chat_message_evidence → chat_messages` compound FK | Low | Compound FK is the only FK; no single-column FK added, so no ambiguity. |
