---
title: "Transcript review — entity panel in sidebar with pre-existing entity list"
status: done
shipped: 2026-05-10
owner: team
priority: medium
last_updated: 2026-05-10
related_features:
  - docs/features/done/interview-transcript-review.md
  - docs/features/done/human-in-the-loop.md
  - docs/features/to-do/source-all-related-entities-panel.md
---

# Transcript review — entity panel in sidebar with pre-existing entity list

## Problem

The transcript review page has a panel for linking new entities and correcting extracted ones. Currently this panel is **below** the transcript content, which means:

1. The user must scroll down past the entire transcript to reach the entity linking section — a terrible experience for long 60-90 minute interviews.
2. When adding a new entity or correcting a link, the user cannot see the transcript excerpt and the entity panel at the same time.
3. The entity panel does not show which entities the LLM has **already extracted** from the source. The user must remember or scroll up to the entities mentioned section to see what was already found. This makes it nearly impossible to avoid creating duplicate corrections or redundant entity links.

## Goals

- Move the entity correction / new entity panel to a **right sidebar** that is sticky and always visible alongside the transcript content, without requiring scroll.
- The sidebar shows all entities already linked to this source (from `source_entities` and `entity_mentions`) so the user has the full picture before adding or correcting.
- Adding a new entity or making a correction does not require scrolling away from the transcript.
- The layout must work on typical laptop screens (1280px+); on smaller screens a collapsible drawer is acceptable.

## Non-goals

- Changing the underlying entity correction or governance data model (the panel is purely a layout / UX change).
- Inline entity highlighting in the transcript text (future enhancement).
- Mobile / narrow viewport optimization beyond a basic collapsible drawer.

## Approach

### Phase 1 — Layout change to two-column

1. Update the transcript review page layout to a two-column CSS Grid or Flexbox:
   - **Left (main):** transcript content, utterance cards, existing review controls.
   - **Right (sidebar, sticky):** entity panel (~320–380px wide).
2. The right sidebar scrolls independently if its content overflows.
3. The primary transcript column retains its existing component tree; the sidebar is a new component rendered beside it.

### Phase 2 — Sidebar content: show pre-existing entities

1. At the top of the sidebar, show a **"Already extracted"** list of all entities currently linked to this source (same data as [`source-all-related-entities-panel.md`](./source-all-related-entities-panel.md)) — compact, read-only, with type badges and link-type labels.
2. Below that, the existing entity correction UI (add new entity, link/unlink, merge suggestions).
3. The pre-existing list updates in real time (optimistic UI or revalidation) when the user adds or removes an entity link.

### Phase 3 — Collapsible drawer for narrow screens

1. On screens narrower than ~1280px, collapse the sidebar into a slide-over drawer triggered by a floating "Entities" button.
2. The drawer overlays the transcript; the user can open and close it as needed.

## Technical notes

- The transcript review page is likely a Server Component with Client Component children. The sidebar layout change is a Client-side concern (sticky positioning).
- Use Shadcn's `Sheet` or `Resizable` components for the sidebar/drawer depending on the existing component inventory.
- The "already extracted" list should be fetched alongside the transcript data in the initial server-side load to avoid a flash of empty content.

## Constraints

- Do not break the existing review state machine (draft → ready → reprocess) or any correction persistence logic.
- Layout change must not affect the print/export view of the transcript (if one exists).

## Risks & open questions

- **Component refactoring scope:** if the transcript review page is a single large component, splitting it into main + sidebar columns may require significant restructuring. A progressive approach (first move the panel to a sticky column without visual changes, then improve content) reduces risk.
- **Open question:** should the sidebar show entities from `source_entities` only, or also from `entity_relationships` (entities that appear as relationship endpoints)?
- **Open question:** is there a natural split point in the existing component tree where the sidebar can be added without a full rewrite?

## Acceptance / how to validate

- [x] On the transcript review page, the entity panel is visible in the right sidebar without needing to scroll.
- [x] The sidebar lists all entities already extracted from the source with their type and role labels.
- [x] Adding a new entity link in the sidebar is reflected after a brief server revalidation (router.refresh() called on seed add/remove).
- [x] On a 1280px (xl) screen, the transcript and the entity sidebar are both visible simultaneously without horizontal scrolling.
- [x] On a narrower screen (e.g. 1024px), a floating "Entities" button opens a Sheet drawer instead.
- [x] No regression in the existing review flow (save & reprocess, save draft).

## Implementation notes

**Date shipped:** 2026-05-10

### Layout

The outer `<div>` in `TranscriptReviewEditor` now uses a `flex items-start gap-6` row:

| Column | Visibility | Content |
|--------|-----------|---------|
| Main (`flex-1 min-w-0`) | always | Reviewed utterances card (unchanged internals) |
| Sidebar (`xl:w-80 sticky top-6`) | `xl:` (≥1280 px) | Entity panel (extracted + seeds) |

On screens narrower than 1280 px, the sidebar is hidden (`hidden xl:block`). A fixed floating button (`fixed bottom-6 right-6 xl:hidden`) opens a Radix `Sheet` with the same entity panel content.

### Entity panel content

The entity panel is defined as a JSX constant (`entityPanelJSX`) before the `return` statement, so it's shared by both the sidebar `<aside>` and the mobile `<SheetContent>`. It contains two sections:

1. **Extracted by pipeline** — read-only list of `source_entities` joined with `entities`, showing `name`, `type` badge, `link_type` label (each unique by `entity_id`).
2. **Review seeds** — the existing seed entity management UI (Link / Create buttons, removable list), now rendered in compact `h-7 text-xs` size buttons to fit the narrower sidebar width.

### Data flow

`review/page.tsx` now fetches `source_entities` with an entity join on the admin client:
```
source_entities.select("entity_id, link_type, entities(id, name, type)")
  .eq("source_id", id)
  .order("created_at", ascending)
```

Results are deduplicated by `entity_id` (first occurrence wins) and cast to `ExtractedEntity[]` before being passed to the editor.

### New exported types

- `ExtractedEntity` — exported from `transcript-review-editor.tsx`, imported by `review/page.tsx`.

### Removed

The standalone "Human-confirmed entities" `<Card>` at the bottom of the page has been removed. Its content is now in the sidebar's "Review seeds" section.

### Files touched

| File | Change |
|------|--------|
| `src/components/interviews/transcript-review-editor.tsx` | Two-column layout; `entityPanelJSX` helper; Sheet + mobile button; `ExtractedEntity` type + prop; `sidebarOpen` state; `Users` + Sheet imports |
| `src/app/(dashboard)/interviews/[id]/review/page.tsx` | `source_entities` query; deduplication; `extractedEntities` prop; imports `ExtractedEntity` |

### Validation

- `npx tsc --noEmit` — 0 errors.
- No linter errors.

### Deferred

- Inline entity highlighting in transcript text (spec non-goal).
- Source list badge showing "reprocessing" status (separate spec).
- Showing entities from `entity_relationships` endpoints (open question from spec — deferred).
