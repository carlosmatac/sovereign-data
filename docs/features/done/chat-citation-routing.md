---
title: "Chat citation routing — internal interview links"
status: done
owner: team
priority: medium
last_updated: 2026-05-17
related_architecture:
  - docs/architecture/agentic-rag.md
  - docs/architecture/chat-persistence.md
related_infrastructure: []
---

# Chat citation routing — internal interview links

## Problem

When the chat returns sources, the rendered link sometimes points to
`example.com/...`. Replacing the host with `aksum.ai/...` returns
`404 Not Found`. The user reported this during Phase 1 manual testing
(see [`chat-entity-retrieval-rpc.md` finding #4](../on-going/chat-entity-retrieval-rpc.md)).

The chat code itself emits **relative** paths only:

- [`src/app/api/chat/route.ts:349`](../../../src/app/api/chat/route.ts) —
  `const interviewUrl = ` followed by a relative `/interviews/${chunk.interview_id}` template,
  rendered as `[View Interview](/interviews/...)`.
- [`src/lib/chat/prompt-builder.ts:128`](../../../src/lib/chat/prompt-builder.ts) —
  the system prompt explicitly says "use the `/interviews/{uuid}` path
  as-is. NEVER generate external publication, client, or guessed web
  URLs for interviews".

So the `example.com` host is **not** coming from server code; it is
either:

1. **An LLM hallucination** — when the model invents a "Source"
   section for an answer that didn't actually surface RAG chunks (e.g.
   the answer is built entirely from `lookupEntity` output, not from
   transcript chunks), it sometimes fabricates a citation URL despite
   the prompt rule.
2. **A markdown renderer fallback**. The
   [`intelligence-brief-markdown.tsx`](../../../src/components/chat/intelligence-brief-markdown.tsx)
   component does rewrite anchors with embedded UUIDs to internal
   `/interviews/{uuid}` paths, but the **main chat message stream**
   may not. If the LLM emits an absolute URL with a UUID in it, the
   chat surface can render it as-is, externally.

The 404 on `aksum.ai/interviews/...` is a separate symptom: those
routes only exist behind authentication on the dashboard host
(`localhost:3000` in dev, `app.aksum.ai/...` or similar in
production), not on the marketing root.

## Goals

- **No external host** ever appears in a chat citation. All citation
  URLs are relative `/interviews/{uuid}` (or `/projects/...` /
  `/admin/...`) and resolve inside the dashboard.
- The LLM cannot inject an absolute URL into the answer's "Sources"
  section: a post-hoc validator strips / rewrites disallowed hosts
  before the message is persisted.
- When the answer has no RAG chunks (entity-only answer), the
  "Sources" line is either omitted or labelled clearly (e.g. "Based
  on internal entity record — no transcript citation").

## Non-goals

- Production dashboard URL routing changes (separate ops concern).
- Web-search Tavily citations (those are expected to be external).

## Approach

1. **Server-side validator** in `route.ts` (or a small
   `sanitizeCitations` step before `persistAssistantTurn`):
   - parse markdown link nodes,
   - for any `View Interview` / "Sources" link, accept only
     `/^\/interviews\/[0-9a-f-]{36}/` paths,
   - rewrite anything with a UUID match in the URL or label to the
     correct internal path,
   - drop links that cannot be rewritten + log a structured warning
     for telemetry.
2. **Strengthen the prompt rule** with a *negative example* (e.g.
   `// Wrong: [View Interview](https://example.com/interviews/...)`)
   to reduce the hallucination rate at the source.
3. **Empty-source rendering** — the chat result panel should detect
   answers that returned no chunks and render a neutral
   "Internal entity / network knowledge — no transcript citation"
   instead of a broken `[View Interview]`.
4. **Dashboard 404 handling** — confirm the `/interviews/{uuid}`
   route 404s gracefully when the user is unauthenticated or the
   id does not exist, and surface a clear message.

## Dependencies & related docs

- Audit: [`database-retrieval-architecture-audit.md`](../../audits/database-retrieval-architecture-audit.md)
  §9.6, §9.8, §9.9 (citation pointers and source-traceability).
- Existing copy: [`prompt-builder.ts`](../../../src/lib/chat/prompt-builder.ts)
  CITATION RULES.
- Existing RAG citation builder:
  [`src/app/api/chat/route.ts`](../../../src/app/api/chat/route.ts)
  (`citationsSummary`).
- Existing markdown component:
  [`src/components/chat/intelligence-brief-markdown.tsx`](../../../src/components/chat/intelligence-brief-markdown.tsx).

## Risks & open questions

- Stripping disallowed hosts changes the literal content of the
  persisted assistant message. Acceptable, but worth flagging in the
  changelog for chat-history consumers (e.g. exports).
- Open question: do we want a "broken-citation" warning rendered to
  the user when the validator drops a link, or a silent rewrite?
  Default proposal: silent rewrite if a UUID is recoverable, visible
  warning otherwise.
- Open question: should the "Sources" section be model-generated at
  all? The audit notes that citation pointers are not persisted
  (§9.9). A more robust model is to render Sources from server-side
  metadata, not from text.

## Acceptance / how to validate

- Reproduce the failing test (entity-only chat question that
  previously emitted `example.com/...`) and confirm the rendered
  link is now an internal `/interviews/{uuid}` (or omitted).
- Click the link — must resolve to the existing interview detail
  page when the user is authenticated.
- New test in `src/__tests__/` (or extension of the chat tests) that
  feeds a fake LLM response containing
  `[View Interview](https://example.com/foo)` through
  `sanitizeCitations` and asserts it is rewritten / dropped.

## Implementation log

- 2026-05-06 — Spec drafted from Phase 1 manual-chat-test findings.
