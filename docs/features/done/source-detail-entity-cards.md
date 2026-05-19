---
title: "Source detail page: visible primary-entity cards"
status: done
owner: unassigned
priority: medium
last_updated: 2026-05-17
related_architecture:
  - docs/architecture/ingestion-pipeline.md
related_features:
  - docs/features/on-going/source-entities-pipeline-writes.md
  - docs/features/to-do/entity-anchor-autocomplete-ux.md
---

# Source detail page: visible primary-entity cards

## Problem

After Phase 2.3, every source can have one or more `source_entities`
rows (currently `link_type = interviewee | interviewee_org`, both
`origin = upload_anchor`). The data is there, but the source detail
page does not surface it.

A user opening a source has to scroll into chunks / mentions to
recover the basic answer to *"who is this source about?"* — the same
two fields they entered at upload time. That orientation should be
visible at the top of the page.

## Goals

- On the source detail page (`/interviews/:id`), show structured
  cards **next to or under the title** for the source-level
  primary entities:
  - **Primary person** (link_type `interviewee`)
  - **Organization / company** (link_type `interviewee_org`)
- Each card links to the entity's detail page (or graph node).
- Each card shows: entity name, type badge, the source role
  (e.g. *"Interviewee"*, *"Subject organization"*), and optionally
  the title/role string from `interviewee_title` for the person
  card.

## Non-goals

- Editing the anchors from this page (handled by entity governance
  flows).
- Showing every chunk-level mention (that's a separate "Mentions"
  panel that already exists).
- Surfacing extraction-origin associations
  (`origin = 'extraction'`) until Phase 2.4 so the chat/RPC layer
  is aligned first.

## Approach (sketch — refine before implementing)

1. Read `source_entities` for this source where
   `origin = 'upload_anchor'` (filter at the RSC level via the
   admin client; RLS exists but reads bypass via admin already in
   the rest of the page).
2. Join to `entities(id, name, type, description)` for display.
3. Render a small horizontal card group above the existing
   summary block.
4. Cards are read-only; clicking opens the entity detail page.
5. Document-source paths (`source_type='document'`, no anchors
   chosen) should gracefully render nothing (or a small "no
   primary entities recorded" affordance, with a link to add via
   review).

## Acceptance criteria

- Audio interview detail page shows two cards (person + org) when
  both anchors are set.
- PDF / text source detail page shows whichever cards apply (0, 1,
  or 2).
- Tested via Playwright/RTL on a fixture source with both anchors
  set and on a source with neither.
- No regression in existing detail-page sections.

## Risks

- Page layout: the existing detail page already has a dense header.
  This needs design review, not a drive-by add.
- Type drift: cards must read directly from `source_entities` so
  they reflect the source-level provenance, not infer from
  `interviewee_*_entity_id` (those columns will eventually be
  retired in a later phase).

## Notes

- Spawned from the PR 2.3 sign-off discussion (2026-05-07). The
  backend write path is already in place as of PR 2.3; this is
  pure frontend.
