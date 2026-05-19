---
title: "Copilot — Richer Answers and Full Context Utilisation"
status: to-do
owner: team
priority: high
last_updated: 2026-05-18
related_architecture:
  - docs/architecture/agentic-rag.md
related_infrastructure:
  - docs/infrastructure/database-schema.md
---

# Copilot — Richer Answers and Full Context Utilisation

## Problem

Copilot answers are too short and appear to underuse the available knowledge. Users get brief summaries when they expect rich, synthesised intelligence grounded in the company's interview and document library.

Suspected gaps (requires investigation before implementation):

- Entity descriptions and metadata may not be included in the context window.
- `source_entities.context` (the entity-in-source context blob) may not be passed to the LLM.
- Source summaries may not be retrieved or included alongside chunks.
- Relationship context (who knows whom, with what sentiment) may not feed the evidence pack.
- Project-level context (description, goals) may not be prepended to the system prompt.
- The model may be instructed to summarise briefly rather than synthesise deeply.
- Retrieval ranking may be returning the wrong or too few chunks.
- Evidence pack formatting may be lossy — important signals dropped between retrieval and generation.

## Goals

- Copilot answers are noticeably longer and more analytically rich for questions that have sufficient knowledge in the database.
- Every answer is traceable to specific sources, chunks, or entities (provenance maintained).
- Entity descriptions, source summaries, relationship context, and project context are all represented in the LLM's context window when relevant.
- The model is explicitly instructed to synthesise and reason, not just quote briefly.
- Retrieval returns enough chunks (tuned k) without flooding the context window with noise.

## Non-goals

- Changing the Copilot's persona (TBY persona and Second-Order Thinking framing are out of scope here).
- Web search via Tavily is already in place — improving it is out of scope.
- Chat scope selection (letting users pick which sources to query) is a separate spec (`chat-scope-selection.md`).
- Report generation quality is separate from Copilot answer quality.

## Approach

This is primarily an **investigation and tuning** task. The correct implementation path depends on what the audit uncovers.

### Phase 1 — Audit the retrieval and context pipeline

Read `docs/architecture/agentic-rag.md` thoroughly, then trace the full execution path for a sample question:

1. What does the vector similarity search return? How many chunks? What is the score distribution?
2. Are entity descriptions fetched and injected for the top-N entities mentioned in retrieved chunks?
3. Is `source_entities.context` fetched for relevant source-entity pairs?
4. Are source summaries included alongside chunks?
5. Are relationships between retrieved entities included?
6. What does the final evidence pack object look like before it reaches the LLM?
7. What does the system prompt say about answer depth and synthesis?

Document findings in the Implementation log below before writing any code.

### Phase 2 — Context window improvements

Based on the audit, implement fixes. Likely candidates:

- Increase retrieved chunk count `k` if current value is too low (balance with context window cost).
- Add entity description blocks to the evidence pack for entities referenced in retrieved chunks.
- Add `source_entities.context` for each (source, entity) pair in the retrieved set.
- Add source summary as a top-level context item per retrieved source.
- Add relationship rows between retrieved entities (filtered to relevant types).
- Prepend project description/goals to the system prompt.

### Phase 3 — Prompt improvements

- Revise the generation system prompt to explicitly instruct the model to:
  - Synthesise across multiple sources rather than summarise each one.
  - Provide a structured answer with an analytical narrative, supporting evidence, and caveats.
  - Use entity and relationship context when relevant.
  - Cite specific sources by name.
- Add a minimum-length soft instruction for complex questions (e.g. "provide a comprehensive answer, at least 3 paragraphs").

### Constraints

- AI SDK v6: `useChat` returns `{ messages, sendMessage, status, error }`; messages use `.parts` array; server uses `toUIMessageStreamResponse()`. Do not revert to v5 patterns (HANDOVER.md §3 gotcha #5).
- `stopWhen: stepCountIs(5)` is the current max steps setting — do not increase without considering cost.
- Similarity threshold is `0.25` (configured in `AI_CONFIG` in `src/lib/constants.ts`) — this is intentional, not a bug (HANDOVER.md §3 gotcha #4).
- Admin client pattern for any DB reads that bypass RLS.

## Technical notes

- The agentic RAG flow lives in the chat API route — see `docs/architecture/agentic-rag.md` for the exact file paths.
- `source_entities` table has a `context` column that stores entity-in-source context; verify it is actually populated for processed sources.
- The evidence pack is constructed before the final generation call — this is the most impactful place to add context.
- Track token usage if expanding context — context window costs can increase significantly.

## Dependencies & related docs

- `docs/architecture/agentic-rag.md` — full Copilot architecture; read this first.
- `docs/infrastructure/database-schema.md` — `source_entities`, `entity_relationships`, `interviews` schemas.
- `docs/features/to-do/chat-scope-selection.md` — related: letting users control retrieval scope.
- `docs/features/to-do/entity-relationship-extraction.md` — better relationships feed richer Copilot context.

## Risks & open questions

- If entity descriptions and source summaries are already being passed to the LLM, the issue may be in the generation prompt rather than retrieval — confirm before changing retrieval logic.
- Expanding the context window increases OpenAI costs per query. Measure before and after.
- Is there a latency budget for the Copilot? Richer context = longer TTFB. Establish acceptable range.
- Should the richer context mode be gated behind a setting ("deep research" vs "quick answer")? Defer unless cost is prohibitive.

## Acceptance / how to validate

- Ask the Copilot a question about a project with 5+ processed sources. The answer is multiple paragraphs long, cites specific sources, and includes entity context (e.g. role, organisation).
- Ask about a relationship between two known entities. The answer references the relationship type and the source(s) that evidence it.
- Ask a cross-project question (if supported). The answer draws on sources from more than one project.
- Answers remain grounded — no hallucination of entities or sources not in the database. Verify by checking cited sources actually contain the referenced information.
- Token usage per query is logged and within an acceptable range (define threshold before testing).

## Implementation log

- _To be filled in during Phase 1 audit._
