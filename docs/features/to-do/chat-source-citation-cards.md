---
title: "Chat source citation cards"
status: to-do
owner: team
priority: medium
last_updated: 2026-05-10
related_features:
  - docs/features/done/chat-message-evidence.md
  - docs/features/to-do/chat-citation-routing.md
---

# Chat source citation cards

## Problem

When the Copilot surfaces source citations at the end of an assistant message (via the Phase 4a `chat_message_evidence` feature), they are currently rendered as plain text chips or minimal inline links. The presentation is functional but not engaging:

- No visual distinction between source types (audio interview, PDF document, text note) — a key differentiator for a frontier-market intelligence platform.
- No hover preview or summary text — the user cannot tell what a source is about without clicking through.
- No visual hierarchy between "used in text" citations (directly referenced) and supporting context chunks (retrieved but not cited inline).

Claude and other modern chat products render cited sources as distinct, visually rich cards. This feature brings that presentation quality to the Copilot.

## Goals

- Each source citation in a Copilot response is rendered as a **card** with: source title, source type badge (colored label: "Interview", "Document", "Note"), primary entity name (interviewee or document subject if available), and a hover state that shows a brief excerpt or entity description.
- "Used in text" citations (where `used_in_text = true`) are visually distinct from supporting context chunks (e.g. different border color, a "Cited" badge).
- Clicking a card navigates to the source detail page.
- The cards are compact enough that 3–5 can appear below a single message without dominating the chat layout.

## Non-goals

- Inline popover previews of the transcript excerpt (the hover excerpt is a brief summary, not an interactive chunk viewer — that is a separate future feature).
- Changing how citations are written or persisted (`chat_message_evidence` is unchanged).
- Redesigning the overall chat message layout.

## Approach

### Phase 1 — Source type badge and color scheme

Define a source type → color label mapping:
- `audio` / `interview` → e.g. indigo badge — "Interview"
- `document` / `pdf` → e.g. amber badge — "Document"
- `text` → e.g. slate badge — "Note"

Add this mapping to `src/lib/constants.ts` or a new `src/lib/ui/source-type.ts` helper.

### Phase 2 — Card component

1. Create a `SourceCitationCard` component:
   - Shows: source title (truncated to 1 line), source type badge, primary entity name (from the linked `source_chunks.source_id → sources → source_entities`), citation position marker (`[1]`, `[2]`, …).
   - Hover state: shows a 1–2 sentence excerpt (the chunk's `content` field, truncated) or the entity description.
   - "Cited" badge when `used_in_text = true`.
   - Links to `/interviews/{source_id}`.
2. The card is styled with a subtle border, rounded corners, and a hover background shift — consistent with the existing dark theme and ready for the future light mode.

### Phase 3 — Integrate into chat message renderer

1. Update `AssistantBlock` in `src/components/chat/intelligence-chat-view.tsx` (already extended by Phase 4a) to render `SourceCitationCard` components instead of the current chip/link.
2. Group by `source_id` (deduplicate chunk-level evidence to source-level cards), keeping track of all citation positions for a given source.
3. Ordered by first citation position ascending.

## Technical notes

- The `chat_message_evidence` table already carries `chunk_id`, `position`, `similarity`, and `used_in_text`. The card needs the source title and type — join via `source_chunks.source_id → sources(title, source_type)` and the primary entity via `source_entities WHERE link_type = 'interviewee' AND origin = 'upload_anchor'`.
- The messages API (`/api/chat/conversations/[id]/messages`) already joins `source_chunks(id, source_id, speaker, start_time)`. Extend the join to include `sources(title, source_type)` and the interviewee name via `source_entities`.
- The card hover excerpt should come from `source_chunks.content` (already in the evidence payload after the join extension above) — no extra fetch needed on hover.

## Constraints

- The card must render correctly while the message is being streamed (before `onFinish` fires and evidence is persisted, no cards are shown — this is the existing behavior and must be preserved).
- Do not re-fetch evidence on hover — all data needed for the hover state must be in the initial message load.

## Risks & open questions

- **Join depth:** extending the messages API to join `sources` and `source_entities` for every evidence row increases response size. Benchmark with a 30-chunk message to ensure it stays acceptable.
- **Open question:** should the cards appear as a horizontal scrollable row (good for 3–5 cards) or a vertical stack (better for 6+ cards)?
- **Open question:** should "supporting context" chunks (not cited in text) be shown as secondary smaller cards, or hidden behind a "See also" toggle?

## Acceptance / how to validate

- [ ] Copilot response with citations renders source cards (not just text chips) below the assistant message.
- [ ] Each card shows the source title, a colored type badge, and the primary entity name.
- [ ] Cards with `used_in_text = true` are visually distinct from supporting context cards.
- [ ] Clicking a card navigates to the correct source detail page.
- [ ] Hovering a card shows a brief chunk excerpt.
- [ ] No regression in streaming behavior — cards appear only after `onFinish` and thread reload.
