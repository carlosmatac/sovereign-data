---
title: "Remove Tavily web search from Copilot"
status: to-do
owner: team
priority: medium
last_updated: 2026-05-10
related_architecture:
  - docs/architecture/agentic-rag.md
---

# Remove Tavily web search from Copilot

## Problem

The Copilot chat agent includes a Tavily web search tool (`searchWeb`) that lets the LLM fetch live internet results when the internal knowledge base is insufficient. For Aksum, this is the wrong default: the platform's entire value proposition is **internal, exclusive knowledge** — interviews with ministers, CEOs, and diplomats that exist nowhere else on the web. Falling back to a Tavily web search when the internal RAG doesn't have a good answer:

1. Dilutes the trustworthiness of answers (the user cannot tell whether a response came from an exclusive interview or a public web article).
2. Introduces external, unverified information into a platform designed to be an authoritative proprietary source.
3. Adds unnecessary external API cost and latency.
4. Creates a false impression that the platform "knows" things it has only sourced from the public internet.

## Goals

- Remove the Tavily `searchWeb` tool from the Copilot agent entirely.
- Remove the `TAVILY_API_KEY` dependency from the application.
- When the internal knowledge base has no relevant results, the Copilot should say so honestly rather than searching the web.

## Non-goals

- Replacing Tavily with another web search provider.
- Adding a "web search" toggle per project or per user (may be reconsidered later, but not in this spec).
- Changing any other Copilot tool (`lookupEntity`, `lookupMentions`, `lookupPositions`, etc.).

## Approach

1. Remove the `searchWeb` tool definition and its Tavily call from `src/app/api/chat/route.ts` (or wherever it is registered in the AI SDK `tools` object).
2. Remove the graceful-unavailable fallback code introduced when `TAVILY_API_KEY` is absent — the tool no longer exists.
3. Remove `TAVILY_API_KEY` from `.env.local.example`, `HANDOVER.md`, and any other doc that references it as optional.
4. Update the system prompt / tool description text if it instructs the LLM to fall back to web search.
5. Verify that `npm test` and `npx tsc --noEmit` pass cleanly after removal.

## Constraints

- `HANDOVER.md` §3.9 notes "`stopWhen: stepCountIs(5)` — Tavily is optional — if `TAVILY_API_KEY` is missing, tool returns graceful 'unavailable' message." After this change the gotcha is obsolete and should be removed.
- Do not break any other tool or the streaming response shape.

## Risks & open questions

- Low risk. The Tavily tool is already guarded by a missing-key graceful fallback, which means it effectively does nothing in production if the key is not set. Removing the tool outright is a clean deletion.
- **Open question:** should the Copilot be prompted to explicitly say "I only have access to Aksum's internal knowledge — I don't have information about that topic" when entity and chunk retrieval returns empty? That would be a small prompt change bundled with this removal.

## Acceptance / how to validate

- [ ] `grep -r "tavily\|searchWeb\|TAVILY" src/` returns no results.
- [ ] `npx tsc --noEmit` — zero errors.
- [ ] `npm test` — all tests pass.
- [ ] Open Copilot; ask a question with no internal answer; confirm it responds with an honest "I don't know" rather than returning web results or throwing an error.
- [ ] `.env.local.example` no longer lists `TAVILY_API_KEY`.
