---
title: "Source entities panel — unified related-entity set on both detail and review pages"
status: done
owner: team
priority: medium
last_updated: 2026-05-13
related_architecture:
  - docs/architecture/ingestion-pipeline.md
related_features:
  - docs/features/done/source-entities-table-and-backfill.md
  - docs/features/done/entity-intel-rpc-source-entities.md
  - docs/features/done/source-entity-relationship-context.md
---

# Source entities panel — unified related-entity set on both detail and review pages

## Problem

Two related surfaces have inconsistent and incomplete entity lists:

**Source Detail page** (`/interviews/[id]`) — queries only `entity_mentions`. This means:
- The **interviewee** (`link_type = interviewee`, `origin = upload_anchor`) never appears — the person being interviewed may speak in the first person throughout without being "mentioned" by name.
- The **interviewee's organization** (`link_type = interviewee_org`) is similarly absent.
- Any **participants** tagged at upload time (`link_type = participant`) are invisible.

**Transcript Review page** (`/interviews/[id]/review`) — queries only `source_entities`. This means:
- All entities that appear as literal `entity_mentions` in the transcript but do not have a `source_entities` row are invisible.
- The panel label ("Extracted by pipeline") is misleading: anchor entities (interviewee, org) also appear there.

The result: both pages show a partial, inconsistent view of which entities are related to a source.

## Goals

- **One shared aggregation helper** (`src/lib/entities/source-entity-aggregator.ts`) that both pages call, producing an identical unified entity list.
- The unified list includes:
  - All `source_entities` rows for the source (with `link_type`, `origin`, `context`).
  - All `entity_mentions` rows for the source, deduplicated by `entity_id`.
  - When an entity appears in both tables, the `source_entities` row wins (anchor label takes precedence).
- Each entry is **labelled by role**: Interviewee, Organization, Participant, Primary Subject, Author, Extracted, Mentioned, or a humanized form of the `link_type`.
- **No hardcoded single-interviewee / single-org assumptions** — the data model and rendering support multiple rows per `link_type` (future multi-participant feature).
- `source_entities.context` is surfaced when available.
- Read-only display. No editing or relinking.

## Non-goals

- Changing `entity_mentions` or `source_entities` data models.
- Showing relationship edges in this panel.
- Editing / relinking entities from this panel.
- Adding pagination (a "show all" toggle is a nice-to-have, not required).

## Approach

### Shared helper — `src/lib/entities/source-entity-aggregator.ts`

Exports:
- `SourceEntityItem` type: `{ entityId, name, type, description, roleLabel, context, sortOrder }`
- `getSourceEntityItems(admin, sourceId)` — fetches `source_entities` + `entity_mentions` in parallel, merges, deduplicates by `entity_id`, assigns role labels, sorts.

Sort order:
1. Anchor entities: `interviewee` (1) → `interviewee_org` (2) → `participant` (3) → other anchor (4)
2. Other `source_entities` rows (extraction origin) → 5
3. `entity_mentions`-only rows → 6

Role labels:
- `interviewee` → "Interviewee"
- `interviewee_org` → "Organization"
- `participant` → "Participant"
- `primary_subject` → "Primary Subject"
- `author` → "Author"
- `subject_organization` → "Organization"
- Other `link_type` → humanized (snake_case → Title Case)
- `entity_mentions`-only → "Mentioned"

Requires admin client (same reason as the existing `source_entities` query in the review page — RLS blocks user client on this path).

### Shared component — `src/components/interviews/source-entity-list.tsx`

A read-only RSC-compatible component that accepts `SourceEntityItem[]` and renders:
- Entity type icon + name
- Type badge (existing vocabulary)
- Role label badge (color-coded by role group: anchor = blue, extracted = muted, mentioned = subtle)
- Context text (if present, clamped 2 lines)
- Description (if no context, clamped 2 lines)

### Source Detail page — `src/app/(dashboard)/interviews/[id]/page.tsx`

- Replace the `entity_mentions`-only fetch with `getSourceEntityItems(admin, id)`.
- Retain `entityNameMap` for the Relationships panel (built from `SourceEntityItem[]`).
- Replace `EntityMentionsList` with `SourceEntityList`.
- Card title: "Related Entities".

### Transcript Review page — `src/app/(dashboard)/interviews/[id]/review/page.tsx`

- Replace the `source_entities`-only fetch with `getSourceEntityItems(admin2, id)`.
- Pass result to `TranscriptReviewEditor` via the (renamed) `sourceEntities` prop.

### TranscriptReviewEditor — `src/components/interviews/transcript-review-editor.tsx`

- Replace local `ExtractedEntity` type with an import of `SourceEntityItem`.
- Rename `extractedEntities` prop to `sourceEntities: SourceEntityItem[]`.
- Replace inline `entityPanelJSX` entity list with `<SourceEntityList items={sourceEntities} />`.
- Section heading changes from "Extracted by pipeline" to "Source entities".

## Technical notes

- `getSourceEntityItems` uses `Promise.all` for the two parallel queries.
- When the same entity has multiple `source_entities` rows with different `link_type` values, keep the highest-priority one (lowest `sortOrder`). This handles the future multi-participant case without exploding the list.
- The admin client is already imported on both pages — no new dependency.
- `source_entities.context` arrives from migration 00042 (live on remote as of 2026-05-13).

## Future-proofing notes

- **Multiple primaries:** the aggregator iterates all `source_entities` rows rather than assuming one interviewee + one org. When a future upload allows multiple participants, they all appear as separate rows with `link_type = 'participant'` and will surface automatically.
- **New link types:** any new `link_type` added to the enum is handled by the `humanizeLinkType` fallback — no code change required for display.
- **Context enrichment:** once a source has its `source_entities.context` populated (either by the pipeline or a backfill script), the panel automatically shows it without any additional changes.

## Implementation notes (2026-05-13)

### Decisions made

- `getSourceEntityItems` fetches `source_entities` and `entity_mentions` in parallel (`Promise.all`). `source_entities` rows take precedence; `entity_mentions`-only rows are added after with `roleLabel = "Mentioned"`.
- When the same entity has multiple `source_entities` rows (e.g. future multi-participant sources), only the row with the lowest `sortOrder` is kept — no duplicate entries per entity, regardless of how many `link_type` rows exist.
- `ExtractedEntity` type in `TranscriptReviewEditor` was removed entirely and replaced with an import of `SourceEntityItem` from the aggregator — no parallel type definitions.
- The `admin` client on the Source Detail page was already imported (`createAdminClient`) but only instantiated inside the audio signed-URL `if` block. It is now hoisted unconditionally above that block so both audio signing and entity aggregation share the same instance.
- Card title on Source Detail changed from "Entities Mentioned" to "Related Entities" — the old label was accurate only for `entity_mentions`; the new one covers anchors too.
- Section heading in Transcript Review entity panel changed from "Extracted by pipeline" to "Source entities".
- `SourceEntityList` renders context text (from `source_entities.context`, populated by migration 00042) in preference to description when both are present, so the richer source-scoped text takes precedence.

### Files changed

| File | Change |
|------|--------|
| `src/lib/entities/source-entity-aggregator.ts` | **New.** `SourceEntityItem` type + `getSourceEntityItems` — parallel fetch, merge, dedup, sort, role-label |
| `src/components/interviews/source-entity-list.tsx` | **New.** Read-only entity list component; type icon + name + type badge + role label (colour-coded) + context/description |
| `src/app/(dashboard)/interviews/[id]/page.tsx` | Replaced `entity_mentions`-only fetch + `EntityMentionsList` with `getSourceEntityItems` + `SourceEntityList`; hoisted `admin` client; card title "Related Entities" |
| `src/app/(dashboard)/interviews/[id]/review/page.tsx` | Replaced `source_entities`-only fetch + `ExtractedEntity[]` build with `getSourceEntityItems`; renamed prop `extractedEntities` → `sourceEntities` |
| `src/components/interviews/transcript-review-editor.tsx` | Removed `ExtractedEntity` type; imported `SourceEntityItem`; renamed prop `extractedEntities` → `sourceEntities`; replaced inline entity list JSX with `<SourceEntityList items={sourceEntities} />`; updated mobile Sheet badge count |

## Acceptance / how to validate

- [ ] On the Source Detail page, the interviewee entity appears in the panel even when never mentioned by name in the transcript.
- [ ] On the Source Detail page, anchor entities are labelled "Interviewee" / "Organization".
- [ ] On the Transcript Review page, entities from `entity_mentions` (not in `source_entities`) appear in the panel labelled "Mentioned".
- [ ] No duplicate entries for an entity that appears in both tables.
- [ ] Context text from `source_entities.context` is shown when non-null.
- [ ] No regression in existing Relationships panel, seeds panel, or reprocess flow.
- [ ] Both pages show the same entity set for the same source.
