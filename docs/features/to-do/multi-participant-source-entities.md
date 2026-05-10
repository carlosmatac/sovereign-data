---
title: "Multi-participant entity tagging in source upload"
status: to-do
owner: team
priority: medium
last_updated: 2026-05-10
related_architecture:
  - docs/architecture/ingestion-pipeline.md
related_features:
  - docs/features/done/source-entities-table-and-backfill.md
  - docs/features/done/source-entities-pipeline-writes.md
  - docs/features/to-do/entity-anchor-autocomplete-ux.md
---

# Multi-participant entity tagging in source upload

## Problem

The Add Source upload form currently allows the user to specify **one primary person** (the interviewee) and **one organization** (their affiliation). These two become the "anchor" entities for the source — pre-seeded before extraction so the LLM doesn't have to guess who the source is about.

Many real sources involve more than two pre-known participants. Examples:
- A roundtable with three ministers plus a moderator from Aksum.
- A panel interview with a CEO, their Head of Strategy, and an external analyst.
- A document authored by a consortium of organizations.

In these cases the user knows at upload time who the participants are, but can only anchor one person and one org. The remaining participants must be discovered by the LLM during extraction — which risks misidentification, missed matches to existing entities, or the need for manual corrections in the review step.

Allowing the user to pre-tag all known participants at upload time improves extraction quality by giving the resolver an explicit `match_only` hint for each participant entity.

## Goals

- The Add Source form accepts a list of **participant entities** (zero to many), each with: name, entity type, optional organization, optional title/role in the source.
- Each participant becomes a `source_entities` row with `origin = 'upload_anchor'` and the appropriate `link_type` (e.g. `participant` — a new link type value).
- The existing single-person / single-org anchor fields are kept and remain the "primary" participant; additional participants are secondary.
- The entity resolver uses participant rows as `match_only` hints during extraction, the same way the current anchor entities are used.

## Non-goals

- Removing or replacing the existing primary interviewee/org fields.
- Automatic participant detection from the audio/document before upload (out of scope; this is manual user input).
- UI for editing participants post-upload (separate governance feature).

## Approach

### Phase 1 — Schema

1. Add `participant` as a new value to the `source_entity_link_type` enum.
2. No other schema changes — `source_entities` already supports multiple rows per source.

### Phase 2 — Upload form UI

1. Add a "Participants" section to the Add Source form (below the primary person/org fields).
2. The section renders a dynamic list: each row has a name field (with entity autocomplete) + optional type selector + optional role/title input.
3. Users can add/remove rows. Zero participants is valid (preserves current behavior).
4. Each participant row uses the same `InterviewAnchorEntityInput` autocomplete component to allow linking to existing entities.

### Phase 3 — Upload API + pipeline

1. Pass the participant list in the upload API request payload.
2. In the source creation route, write `source_entities` rows for each participant with `link_type = 'participant'`, `origin = 'upload_anchor'`, and `is_primary = false`.
3. The entity resolver already handles multiple anchor rows — no pipeline changes needed.

## Technical notes

- The `source_entities` table has a `UNIQUE(source_id, entity_id, link_type)` constraint. Multiple participants with the same `link_type = 'participant'` but different entity IDs are allowed.
- `is_primary = false` for participant rows; `is_primary = true` only for the single primary interviewee.
- This feature is a prerequisite for sources like panels/roundtables where multiple primary voices exist.

## Dependencies

- [`entity-anchor-autocomplete-ux.md`](./entity-anchor-autocomplete-ux.md) — the autocomplete performance and UX improvements should land before this feature ships, since the multi-participant form will use the same autocomplete component multiple times per form.

## Risks & open questions

- **Form complexity:** adding a dynamic participant list increases the form's cognitive load. Consider making it collapsible or placing it in an "Advanced" section.
- **Open question:** what is the maximum number of participants? No hard cap is needed technically, but the UX should guide users to only tag pre-known participants, not every entity in the transcript.
- **Open question:** should `participant` link type be renamed to something more specific (e.g. `secondary_interviewee`, `contributor`)? Keeping `participant` generic is more flexible.

## Acceptance / how to validate

- [ ] The upload form renders a "Participants" section with an add/remove participant row UI.
- [ ] Submitting a source with two participants creates two `source_entities` rows with `link_type = 'participant'`, `origin = 'upload_anchor'`.
- [ ] The entity autocomplete works on participant name fields.
- [ ] No regression on the existing primary interviewee/org anchor flow.
- [ ] A source with zero participants behaves identically to the current behavior.
