---
title: "Multi-participant entity tagging in source upload"
status: on-going
owner: team
priority: medium
last_updated: 2026-05-13
related_architecture:
  - docs/architecture/ingestion-pipeline.md
related_features:
  - docs/features/done/source-entities-table-and-backfill.md
  - docs/features/done/source-entities-pipeline-writes.md
  - docs/features/done/source-all-related-entities-panel.md
---

# Multi-participant entity tagging in source upload

## Problem

The Add Source upload form allows tagging only **one primary person** and **one organization**. Many real sources involve more pre-known participants — a roundtable, a panel interview, a consortium-authored document. Those extra participants must be discovered by the LLM during extraction, risking misidentification or missed entity matches.

Allowing explicit pre-tagging of additional known entities at upload time improves extraction quality by giving the resolver explicit `upload_anchor` hints before the pipeline runs.

## Goals

- Keep the existing primary person / organization / title fields for the simple case (no behavioral change).
- Add an optional collapsible section "Additional known entities" below the primary fields.
- Each additional entity row: name (with autocomplete), entity type, link type, optional title/context.
- On submission, each row becomes a `source_entities` row with `origin = 'upload_anchor'`, `is_primary = false`.
- No hardcoded single-primary assumption: data model and rendering already support N rows per `link_type` (see `source-all-related-entities-panel`). Form mirrors this.
- Works across all three source types (audio, PDF, text).

## Non-goals

- Removing or replacing the primary interviewee/org fields.
- Automatic participant detection from audio/document before upload.
- Post-upload editing of participant tags (separate governance feature).
- Arbitrary relationship editor or company-company relationship tagging in this form (see follow-up below).

## Approach

### Schema — no migration needed

- `participant` link type already exists in `source_entity_link_type` enum (migration 00028).
- `source_entities` already has `is_primary BOOLEAN NOT NULL DEFAULT false` and `context TEXT`.
- No new columns or types required.

### Upload form — `upload/page.tsx`

- New state: `participants: ParticipantRow[]` where `ParticipantRow = { id, name, entityId, entityType, linkType, title }`.
- Collapsible section (default closed) below the primary fields. Toggle shows entity count badge when non-empty.
- Each row: name input with `InterviewAnchorEntityInput` (extended with `typeFilter` prop), entity type selector, link type selector, optional title input, remove button.
- "Add entity" button at bottom of section.
- Participants included in all three submit paths (audio JSON, PDF FormData as JSON string, text JSON).

### `InterviewAnchorEntityInput` — `interview-anchor-entity-input.tsx`

- Add optional `typeFilter?: string` prop: when set, overrides the `kind`-based type query param in the entity search URL entirely.
- Add optional `entityLabel?: string` prop: used in the "no existing match" hint text when `typeFilter` is set.
- No breaking change — existing `kind` prop behavior unchanged when `typeFilter` is absent.

### Shared validation helper — `validate-interview-anchor.ts`

New export `ensureParticipantAnchorEntity`: accepts `entityId | null`, `name | null`, `entityType: EntityType`. Follows the same two-path contract as `ensureUploadAnchorEntity` (validate FK if provided; `create_or_match` on free text), but accepts any `EntityType` rather than the limited `"person" | "organization"` role.

### Shared writer helper — `source-entities-writer.ts`

New export `writeParticipantSourceEntities`: takes `sourceId`, `tenantId`, resolved participant array (entityId, linkType, context), and upserts `source_entities` rows with `origin = 'upload_anchor'`, `is_primary = false`.

### Shared API helper — `validate-interview-anchor.ts`

New export `parseAndResolveParticipants`: callable from all three API routes. Parses raw participants array from the request, validates, resolves entity IDs via `ensureParticipantAnchorEntity`, returns resolved rows ready for `writeParticipantSourceEntities`.

### API routes — all three

After source insert succeeds, call `parseAndResolveParticipants` then `writeParticipantSourceEntities`. Failures are non-fatal (logged, not 500) — the source was already created.

### Link types exposed in the form

`participant` (default), `interviewer`, `author`, `primary_subject`

### Entity types exposed in the form

`PERSON`, `COMPANY`, `ORGANIZATION`, `GOVERNMENT`, `PUBLIC_INSTITUTION`

## Follow-up: affiliated org per participant row

Allowing a person participant to have an affiliated org would need:
1. A second entity row per participant in the form (org name / autocomplete).
2. A separate `source_entities` row for that org.
3. Optionally, an `entity_relationship` row (person → org for this source).

The relationship write depends on `writeExtractionSourceEntities` patterns which adds scope. This is documented here as a follow-up rather than forced into V1.

## Implementation notes (2026-05-13)

### Decisions made

- **No migration.** `participant` link type already existed in the enum; `is_primary` and `context` columns already existed. Zero DB changes.
- **Participants written at upload time**, not in the pipeline — as soon as the source row is created, `writeParticipantSourceEntities` upserts the rows with `origin = 'upload_anchor'`, `is_primary = false`. This makes them immediately available to the resolver when the pipeline fires.
- **Participant writes are non-fatal** — wrapped in try/catch in each API route. A failed resolution (bad entity ID, network error) logs and skips but never returns a 500 to the user; the source was already created.
- **Affiliated org deferred** — creating a person→org relationship per participant row requires coordinating `entity_relationship` writes which adds meaningful scope. Documented as follow-up; form supports title/context only.
- **PDF route** receives participants as a JSON string in FormData (`formData.get("participants")`), parsed server-side. This avoids restructuring a FormData route to JSON.
- **`InterviewAnchorEntityInput` extension** is backward-compatible: `typeFilter` and `entityLabel` are optional; existing callers (primary person/org fields) pass neither and behave identically.
- **Type filter per entity type:** PERSON → `type=PERSON`; all org-like types → `types=COMPANY,ORGANIZATION,GOVERNMENT,PUBLIC_INSTITUTION,STATE_OWNED_ENTERPRISE`. If the user picks a type that doesn't match their autocomplete pick, the entity resolution on the server uses `matchOrCreate` with the explicit `entityType` — so it self-corrects.

### Files changed

| File | Change |
|------|--------|
| `src/components/interviews/interview-anchor-entity-input.tsx` | Added optional `typeFilter?: string` + `entityLabel?: string` props; dependency array updated |
| `src/lib/entities/validate-interview-anchor.ts` | Added `PARTICIPANT_LINK_TYPES`, `PARTICIPANT_ENTITY_TYPES`, `ensureParticipantAnchorEntity`, `parseAndResolveParticipants`, `RawParticipant`, `ResolvedParticipant` |
| `src/lib/entities/source-entities-writer.ts` | Added `writeParticipantSourceEntities` |
| `src/app/api/interviews/route.ts` | Parses `participants` from body; writes via `parseAndResolveParticipants` + `writeParticipantSourceEntities` after source insert |
| `src/app/api/interviews/from-pdf/route.ts` | Same; parses `participants` as JSON string from FormData |
| `src/app/api/interviews/from-text/route.ts` | Same; parses `participants` from JSON body |
| `src/app/(dashboard)/interviews/upload/page.tsx` | `ParticipantRow` type, helper functions, `participants` state, collapsible section UI, `participantsPayload()` included in all 3 submit paths |

## Acceptance / how to validate

- [ ] Upload form renders "Additional known entities" collapsible section below the primary fields.
- [ ] Adding a participant row with autocomplete link creates a `source_entities` row with `link_type = 'participant'`, `origin = 'upload_anchor'`, `is_primary = false` after source creation.
- [ ] `context` field on that row is populated when a title was provided.
- [ ] Zero participants → identical behavior to current flow (no regression).
- [ ] Works on audio, PDF, and text source types.
- [ ] Participant entities appear in the Related Entities panel on the Source Detail page (via `source-all-related-entities-panel` aggregator).
