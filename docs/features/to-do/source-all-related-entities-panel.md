---
title: "Source entities panel — show all related entities, not only literally mentioned"
status: to-do
owner: team
priority: medium
last_updated: 2026-05-10
related_architecture:
  - docs/architecture/ingestion-pipeline.md
related_features:
  - docs/features/done/source-entities-table-and-backfill.md
  - docs/features/done/entity-intel-rpc-source-entities.md
  - docs/features/to-do/source-detail-entity-cards.md
---

# Source entities panel — show all related entities, not only literally mentioned

## Problem

The "Entities mentioned" panel on the source detail / transcript review page renders only entities that have `entity_mentions` rows for the source — i.e. entities whose name was literally extracted from the transcript text. It does not show:

- The **interviewee** (`link_type = interviewee`, `origin = upload_anchor`) — the person who gave the interview, who may speak in the first person throughout without ever being "mentioned" by name.
- The **interviewee's organization** (`link_type = interviewee_org`, `origin = upload_anchor`) — similarly, the organization may be the implicit subject of the entire source.
- Any other **participant entities** tagged at upload time (`link_type = participant`).

The result is a misleading panel: a source about a minister of energy shows no entities until the LLM happens to extract a literal mention, even though the minister is the most important entity in the source.

## Goals

- The "Entities mentioned" (or "Related entities") panel on the source detail page shows **all** entities linked to a source via `source_entities`, not just those with `entity_mentions` rows.
- Entities are labelled by their `link_type` so the user can distinguish "interviewee" (anchor) from "extracted mention."
- The panel is read-only (corrections stay in the existing review UI).

## Non-goals

- Changing the underlying `entity_mentions` or `source_entities` data model.
- Showing relationship edges in this panel (that is the Network Explorer's job).
- Editing or relinking entities from this panel (handled by the governance feature).

## Approach

1. Update the source detail page's data fetch to query `source_entities` (all rows for this source) in addition to or instead of `entity_mentions` for the "Entities mentioned" panel.
2. Join to `entities(id, name, type, description)` for display.
3. Render a unified list sorted by: anchor entities first (`origin = 'upload_anchor'`), then extraction entities (`origin = 'extraction'`), then literal mentions (from `entity_mentions` not covered by `source_entities`).
4. Each entry shows: entity name, type badge, source-role label (`Interviewee`, `Organization`, `Participant`, `Extracted`, `Mentioned`).
5. For entities that appear in both `source_entities` and `entity_mentions`, deduplicate — show one entry with the anchor label taking precedence.

## Technical notes

- `source_entities` and `entity_mentions` are both scoped by `source_id` / `interview_id`. A single query joining both tables can produce the unified list.
- The `entity_intel` RPC already returns the combined view per entity per source — consider using it as the data source for this panel instead of two separate queries.
- The panel should be a server component (RSC) or a lightweight SWR-fetched component on the detail page; avoid over-fetching on every keystroke.

## Dependencies

- [`source-detail-entity-cards.md`](./source-detail-entity-cards.md): that spec adds anchor entity cards at the top of the source detail page. This spec extends the lower "entities mentioned" list. They are complementary and should not conflict.
- If the multi-participant feature ([`multi-participant-source-entities.md`](./multi-participant-source-entities.md)) ships first, `participant` link-type entities should automatically appear in the panel via this spec's logic.

## Risks & open questions

- **Deduplication edge cases:** an entity that is both an anchor and extracted should show once. The deduplication logic needs to be clear.
- **Panel size:** sources with many extracted entities could produce a long list. Pagination or a "show all / show less" toggle may be needed.
- **Open question:** should entities from `entity_relationships` that are endpoints for this source also appear? (e.g. "Ministry of Finance" mentioned as the target of a relationship, not as a direct entity mention). Probably yes — worth including as a separate `link_type = 'related_via_relationship'` label.

## Acceptance / how to validate

- [ ] On a source detail page where the interviewee entity is an anchor (`origin = upload_anchor`), the interviewee appears in the entities panel even if they are never mentioned by name in the transcript.
- [ ] The panel labels anchor entities as "Interviewee" / "Organization" vs. extracted as "Extracted."
- [ ] No duplicate entries for an entity that is both an anchor and appears in `entity_mentions`.
- [ ] No regression in the transcript review panel or the existing "Entities mentioned" behavior.
