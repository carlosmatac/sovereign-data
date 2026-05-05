---
title: "Copilot mode selector — General Context & Sales"
status: on-going
owner: team
priority: medium
last_updated: 2026-03-24
related_architecture: ["docs/architecture/agentic-rag.md"]
related_infrastructure: []
---

# Copilot mode selector — General Context & Sales

## Problem

Copilot had a single monolithic system prompt with no way for the user to tell the assistant what kind of help they needed. Sales-focused users wanted commercially actionable outputs; research/analysis users wanted synthesis and context. The single prompt tried to do both and did neither well.

## Goals

- User can manually pick a copilot mode from the composer.
- The assistant behavior changes meaningfully based on the selected mode.
- Default (no selection) is always General Context — no inference required.
- The implementation must be extensible: adding a third mode must not require rewriting the whole route.

## Non-goals

- Automatic mode inference as the primary path.
- Modes beyond `general_context` and `sales` in this increment.
- New backend storage / persistence for the mode (stateless per-request).

## Approach

### Frontend (composer)

`src/components/chat/intelligence-chat-view.tsx`:
- `useState<CopilotMode | null>` for `selectedMode`; `null` = no chip, effective mode = `general_context`.
- A `+` (Plus) icon button next to the textarea opens a `DropdownMenu` with two items: **General Context** and **Sales**.
- Selecting an item sets `selectedMode` and renders a removable chip/tag (icon + label + × button).
- Removing the chip sets `selectedMode` back to `null` (effective mode returns to `general_context`).
- `effectiveCopilotMode = selectedMode ?? "general_context"` is always included in the `DefaultChatTransport` body as `copilotMode`.
- The transport is memoized with `effectiveCopilotMode` as a dependency so the backend receives the current mode on every send.

### Backend (route + modular builder)

`src/lib/chat/prompt-builder.ts` (new):
- Exports `CopilotMode`, `COPILOT_MODES`, `parseCopilotMode`, `buildSystemPrompt`.
- `buildSystemPrompt()` assembles five layers: core → mode overlay → grounding rules → scope/db/positions → RAG context.
- `buildModeOverlay(mode)` returns the mode-specific block (a `switch`; easy to extend).

`src/app/api/chat/route.ts`:
- Parses `body.copilotMode` via `parseCopilotMode()` (invalid/missing → `"general_context"`; client wins).
- Calls `buildSystemPrompt({ mode: copilotMode, ... })` instead of the previous inline string.
- All existing behavior (grounding, validated positions, RAG, tool calling, persistence) is unchanged.

## Mode behavior summary

| Mode | Key emphasis |
|------|-------------|
| `general_context` | Understanding, explanation, synthesis, clarity. Does not push answers toward commercial angles. |
| `sales` | Commercially actionable: account intelligence, stakeholder motivations, pitch angles, commercial signals. Same grounding discipline — no invented opportunities. |

## Key files changed

| File | Change |
|------|--------|
| `src/lib/chat/prompt-builder.ts` | New — modular prompt builder |
| `src/app/api/chat/route.ts` | Parse `copilotMode`; use `buildSystemPrompt()` |
| `src/components/chat/intelligence-chat-view.tsx` | Mode selector, chip, transport wiring |
| `docs/architecture/agentic-rag.md` | Document copilot modes + modular layers |

## Acceptance checklist

- [x] Composer has a `+` mode trigger.
- [x] Dropdown shows General Context and Sales.
- [x] Active mode shows as removable chip.
- [x] Removing chip returns effective mode to general_context.
- [x] Client always sends `copilotMode` explicitly.
- [x] Backend parses and routes through modular builder.
- [x] Prompt is layered — not a duplicated monolith.
- [x] Grounding / RAG / validated positions / persistence unchanged.
- [x] Docs updated.

## Status

Implemented on branch `ventura/feature-systems-prompts`. Move to `done/` after product sign-off.
