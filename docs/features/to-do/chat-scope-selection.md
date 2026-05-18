---
title: "Copilot — Chat Scope Selection"
status: to-do
owner: team
priority: medium
last_updated: 2026-05-18
related_architecture:
  - docs/architecture/agentic-rag.md
related_infrastructure:
  - docs/infrastructure/database-schema.md
---

# Copilot — Chat Scope Selection

## Problem

The Copilot currently queries all knowledge the user has access to when answering a question. Users have no way to limit retrieval to a specific project, source, entity, or source type.

This creates several problems:

- Cross-project noise: a question about Project A may surface irrelevant results from Project B.
- Lack of precision: users preparing for a specific meeting cannot restrict the Copilot to one interview or one account.
- Reduced trust: users do not know which knowledge pool was searched, making answers harder to verify.
- Poor explainability: there is no signal to the user about what the Copilot was "looking at" when it answered.

## Goals

- Users can select a scope before asking a question (e.g. one project, several sources, or one entity).
- The selected scope is visually prominent and persists within the chat session.
- The Copilot uses only the scoped knowledge for retrieval; it does not silently fall back to the full corpus.
- Scope selection improves precision without degrading answer quality for well-scoped questions.
- Users can clear the scope at any time to return to full-corpus retrieval.

## Non-goals

- Saved/named scopes or collections are not in scope for this iteration.
- Semantic views (dynamically computed scopes based on topic or relevance) are not in scope.
- Sharing a scoped chat session with another user is not in scope.
- Changing the Copilot persona or system prompt per scope is not in scope.

## Approach

### Phase 1 — Project scope

The simplest and highest-value scope: let users choose which project(s) the Copilot searches.

1. Add a scope selector to the chat UI — a compact multi-select above or beside the message input.
2. "All projects" is the default (current behaviour).
3. When one or more projects are selected, the retrieval query adds a `project_id IN (...)` filter to the vector similarity search and any entity/source lookups.
4. The active scope is displayed as a pill/badge near the input so users always see what is active.
5. A "Clear scope" action resets to "All projects".

### Phase 2 — Source scope

Let users further narrow to one or more specific sources within the selected project(s):

1. After selecting a project, a secondary selector lists sources within that project.
2. When sources are selected, retrieval filters chunks to only those `interview_id`s.
3. Scope pill updates to show source names (truncated if many).

### Phase 3 — Entity scope

Let users scope to a specific entity:

1. Entity autocomplete in the scope selector.
2. Retrieval filters to chunks where the entity is mentioned (`entity_mentions` join or `source_entities`).
3. Useful for "Tell me everything we know about [Minister X]" workflows.

### Phase 4 — Source type scope

Let users filter by source type (e.g. only interviews, only documents):

1. A source type multi-select chip group (compact, not a full dropdown).
2. Applied as an additional filter on top of project/source scope.

### Constraints

- Retrieval changes must not alter the existing full-corpus path (used when no scope is set) — scoping is additive.
- AI SDK v6 patterns must be preserved: `useChat`, `.parts` array, `toUIMessageStreamResponse()` (HANDOVER.md §3).
- Admin client pattern for DB reads in the chat API route.
- Scope state must be passed from the client to the server-side retrieval route — decide on transport (query param, request body, or chat metadata field).

## User experience

- Scope selector is placed prominently but compactly above the chat input — not buried in a settings panel.
- Default state: "Searching all knowledge" (no badge, no selection).
- Active scope state: one or more scope pills clearly labelled (e.g. "Project: Angola Energy" + "Source: Interview — Minister Doe").
- Each pill has an ×  to remove just that scope item.
- "Clear all" removes all scope selections.
- Scope persists across messages in the same session; it does not reset on each send.

## Technical notes

- The chat API route constructs the retrieval query — this is where scope filters must be injected.
- Scope is passed from the client as part of the chat request body (alongside messages).
- The Copilot system prompt should mention the active scope so the model is aware it is working with restricted knowledge: "You are answering based on knowledge from [Project X] only."
- For Phase 1, project IDs are available on the client from the existing project context/store.
- For Phase 2+, source and entity lists need to be fetched based on the selected project — these can be fetched lazily when the user opens the scope selector.

## Dependencies & related docs

- `docs/architecture/agentic-rag.md` — Copilot retrieval architecture; read before implementing.
- `docs/features/to-do/copilot-richer-answers.md` — retrieval improvements; complementary to scope selection.
- `docs/features/to-do/knowledge-library-organization.md` — related concept of browsing sources; scopes could eventually be derived from saved library filters.
- `docs/infrastructure/database-schema.md` — `interviews`, `chunks`, `entity_mentions`, `source_entities` schemas for filter construction.

## Risks & open questions

- If the user scopes to a single small source and asks a broad question, the answer will be thin. Should the Copilot warn the user when the scoped knowledge is insufficient, rather than silently returning a low-quality answer?
- Should scope state be URL-encoded so a scoped session can be shared or bookmarked? Adds complexity — defer unless there is a clear use case.
- Phase 3 (entity scope): is filtering by `entity_mentions` sufficient, or should it also retrieve relationship context involving that entity? Needs architecture review.
- How is scope handled in the agentic tools (web search, etc.)? Scope should apply to internal knowledge retrieval only, not to external Tavily searches.

## Acceptance / how to validate

- Open the Copilot. By default, no scope is set and the selector shows "All knowledge".
- Select a project. Ask a question about a topic only present in a different project. The answer should acknowledge the topic is not found (not hallucinate from out-of-scope sources).
- Select a specific source. Ask a question about content in that source. The answer is grounded in that source.
- Ask a question about content in a different source (not scoped). The answer should acknowledge it is not available in the current scope.
- Clear the scope. Ask the same question — now the answer draws from the full corpus.
- Scope pills are visible and correctly reflect the active selection throughout the session.
