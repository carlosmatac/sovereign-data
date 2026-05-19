---
title: "Chat source citation cards"
status: done
owner: team
priority: medium
last_updated: 2026-05-13
related_features:
  - docs/features/done/chat-message-evidence.md
  - docs/features/to-do/chat-citation-routing.md
---

# Chat source citation cards

## Problem

When the Copilot surfaces source citations at the end of an assistant message
(via the `chat_message_evidence` feature), they are rendered as plain pill links.
The presentation is functional but not engaging:

- No visual distinction between source types (audio interview, PDF document, text note).
- No hover preview or summary text — the user cannot tell what a source is about
  without clicking through to a new page.
- No visual hierarchy between "used in text" citations and supporting context chunks.
- Clicking navigates away from the chat, breaking the flow.

## Goals

- Source citation **cards** below assistant messages: title, source type badge,
  primary entity name, citation position markers, and a "Cited" badge when
  `used_in_text = true`.
- Clicking a card opens a **right-side drawer** (not navigation) — contextual
  preview with source summary, entity, cited excerpts, and an "Open full source" link.
- Entity chips: keep any existing entity rendering; do not rebuild a full entity
  explorer. If there is an entity drawer, reuse it.
- Consistent interaction model: click = open right drawer; full page nav is a
  secondary action via a link inside the drawer.

## Non-goals

- Changing how citations are written or persisted (`chat_message_evidence` unchanged).
- Inline popover previews during streaming (cards appear only after evidence
  is persisted and the thread is reloaded).
- Full entity explorer from scratch.

## Approach

### Data layer
Extend the messages API (`GET /api/chat/conversations/:id/messages`) join to
include:
- `source_chunks.content` — for the excerpt display in the drawer
- `source_chunks → sources(id, title, source_type, summary, interviewee_name,
  interviewee_org, project_id)` — source metadata for the card and drawer

### Card component (`SourceCitationCard`)
- Compact card (~200px), shows: type badge, title (2-line clamp), primary entity,
  citation positions
- "Cited" badge + blue border tint when `used_in_text = true`; neutral border for
  supporting context
- Click opens `SourceDetailDrawer`

### Drawer component (`SourceDetailDrawer`) — inside `source-citation-card.tsx`
Uses shadcn `Sheet` (right side). Shows:
- Source title + type badge
- Interviewee / organization if available
- Source summary paragraph
- Cited excerpts (primary) or context chunks (fallback), up to 3, with speaker/time
- "Open full source" link to `/interviews/{sourceId}`

### Source type mapping
Defined in `src/lib/ui/source-type.ts`:
| `source_type` | Label | Color |
|---|---|---|
| `audio` | Interview | Indigo |
| `document` | Document | Amber |
| `video` | Video | Purple |
| `text` | Note | Slate |

### Chat view integration
Replace `SourceChips` in `intelligence-chat-view.tsx` with `SourceCitationCards`,
a layout that groups evidence by `source_id` and renders one card per source.

## Constraints

- Do not change citation persistence logic.
- All drawer data comes from the initial message load — no re-fetch on click.
- Streaming behavior preserved: cards appear only after evidence exists post-reload.
- The card layout is `flex-wrap` — handles 1–N cards cleanly.

## Acceptance / how to validate

- [ ] Copilot response with citations renders source cards instead of plain chips.
- [ ] Each card shows title, colored type badge, primary entity name.
- [ ] Cards with `used_in_text = true` have blue border + "Cited" badge.
- [ ] Clicking a card opens a right-side drawer (no navigation away).
- [ ] Drawer shows: title, type, interviewee/org, summary, cited excerpts,
      "Open full source" link.
- [ ] Drawer closes on X or clicking outside.
- [ ] No regression in streaming behavior — cards appear only after thread reload.
- [ ] Works for audio, document, and text source types.

## Implementation notes (2026-05-13)

### Files created / changed

| File | Change |
|------|--------|
| `src/lib/ui/source-type.ts` | **New.** `getSourceTypeMeta(sourceType)` returns `{ label, badgeClass, Icon }` for audio/document/video/text |
| `src/components/chat/source-citation-card.tsx` | **New.** `SourceCitationCard` (compact card, opens drawer) + `SourceDetailDrawer` (shadcn `Sheet`, right side) + `SourceCard` / `SourceCardExcerpt` types |
| `src/app/api/chat/conversations/[id]/messages/route.ts` | Extended `chat_message_evidence` select to include `source_chunks.content` and nested `sources(id, title, source_type, summary, interviewee_name, interviewee_org, project_id)` |
| `src/components/chat/intelligence-chat-view.tsx` | Added `EvidenceSourceRow` type; extended `EvidenceChip` with `content` and `sources`; replaced `SourceChips` + `formatMinSec` with `SourceCitationCards` (aggregates evidence rows per source_id → `SourceCard[]`, sorts cited first); added import of `SourceCitationCard` |

### Card behavior
- One card per unique `source_id` in the evidence set
- Sorted: cited sources (`used_in_text = true` for any chunk) first, then by lowest citation position
- Card border: blue tint for cited, neutral for context-only
- 200px width, `flex-wrap` layout — handles 1–N cards cleanly

### Drawer behavior
- Uses shadcn `Sheet` (right side, 420–480px)
- Each card manages its own open/close state (no global state needed)
- Excerpts: cited chunks shown first; if none, up to 3 context chunks shown
- All data comes from the message load — no re-fetch on click

### Streaming preservation
Cards only render when `evidenceByMessageId[message.id]` is populated, which
happens during the DB-load path (after `onFinish` and thread reload), never
during the live stream. This is unchanged behavior from `SourceChips`.
