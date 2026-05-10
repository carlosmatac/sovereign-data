---
title: "Source-entity relationship context descriptions"
status: to-do
owner: team
priority: medium
last_updated: 2026-05-10
related_infrastructure:
  - docs/infrastructure/database-schema.md
related_architecture:
  - docs/architecture/ingestion-pipeline.md
related_features:
  - docs/features/done/source-entities-table-and-backfill.md
  - docs/features/done/source-entities-pipeline-writes.md
  - docs/features/to-do/entity-metadata-and-descriptions.md
---

# Source-entity relationship context descriptions

## Problem

The `source_entities` table records *that* an entity appears in a source and *how* (via `link_type` and `origin`), but it carries **no textual description of the relationship**. When the LLM retrieves `source_entities` rows during chat, it knows an entity is the "interviewee" of a source, but it has no context about:

- What role the entity played in that specific source (e.g. "Minister of Finance discussing the 2026 budget reform").
- Why the entity is relevant to the source (e.g. "mentioned as a partner in the gas pipeline deal").
- What was said about the entity in this specific source (a brief synopsis, not the full transcript).

This forces the LLM to either infer context from the entity's global description (which is entity-wide, not source-specific) or return thin answers without grounding.

More broadly: relationship rows between tables that are used as LLM context should carry descriptive text when it adds value. `source_entities` is the highest-priority case because it is queried on every entity chat lookup.

## Goals

- Add a `context` text field to `source_entities` (or a `metadata` JSONB field) to store a brief description of why and how this entity relates to this specific source.
- The pipeline populates `context` at ingest time using the extraction result (e.g. the entity's role description, or a short synthesis from the chunks where the entity is mentioned most).
- The `entity_intel` RPC surfaces the `context` field alongside the existing `link_type` and `origin` fields.
- The Copilot uses the `context` field in its retrieval prompt when constructing answers about an entity's presence in a source.

## Non-goals

- Replacing the entity-level `description` field on `entities` (this is source-scoped context, not entity-global context — see [`entity-metadata-and-descriptions.md`](./entity-metadata-and-descriptions.md) for the entity-level work).
- Generating context for all existing historical `source_entities` rows in a bulk migration (a best-effort offline backfill script is acceptable, but not required for launch).
- Context descriptions for `entity_relationships` rows (valuable but out of scope here).

## Approach

### Phase 1 — Schema

1. Add a `context TEXT` column to `source_entities` (nullable; populated only when extraction or a post-pipeline enrichment step provides it).
2. Migration: `ALTER TABLE source_entities ADD COLUMN context TEXT;` — additive, no rows affected.
3. Update `database.ts` types.

### Phase 2 — Pipeline writes context

1. In the entity extraction schema, add an optional `entityContext` field per entity: a 1–2 sentence description of this entity's role and significance **in this source** (distinct from the global entity description).
2. In the pipeline writer (`source-entities-writer.ts`), include `context` when inserting `source_entities` rows that come from `origin = 'extraction'`.
3. For `origin = 'upload_anchor'` rows (the interviewee/org), populate `context` from the interviewee title field if available (e.g. "Minister of Finance, interviewed about 2026 budget reforms").

### Phase 3 — Surface in retrieval

1. Update `entity_intel` RPC to include `context` in its returned columns.
2. Update `lookupMentions` and related chat tools to include `context` in the formatted output passed to the LLM.
3. Update the chat system prompt / tool output formatter to render the source-entity context alongside the source title.

## Technical notes

- `source_entities` write paths: `src/lib/entities/source-entities-writer.ts` (pipeline) and the anchor backfill in migration 00028.
- The `entity_intel` RPC is defined in `supabase/migrations/00030_entity_intel_rpc_v2.sql` and returns a `link_type`, `kind`, `origin` per source. Extending it to include `context` requires updating the function's SELECT.
- Keep the `context` column nullable — rows written before this feature ships will have NULL context, which is fine; the LLM should handle it gracefully.

## Risks & open questions

- **LLM prompt inflation:** adding a `context` field for every source-entity returned in a lookup could grow the prompt significantly for high-mention entities. Consider truncating to 200 chars in the tool output.
- **Open question:** should `context` be auto-generated offline (backfill script) for existing entities, or only for new ingests going forward? An offline enrichment pass similar to the one in [`entity-metadata-and-descriptions.md`](./entity-metadata-and-descriptions.md) would cover the historical data.
- **Open question:** is a `TEXT` column sufficient, or should this be `JSONB` to allow structured fields (e.g. `{ "role": "...", "summary": "...", "tone": "positive" }`)?

## Acceptance / how to validate

- [ ] `source_entities` table has a `context` column after migration.
- [ ] After ingesting a new source, `source_entities` rows for extracted entities have non-null `context` values.
- [ ] `entity_intel` RPC result includes `context` for rows that have it.
- [ ] Copilot answer for "What did [entity] say in [source]?" includes source-specific context, not just the entity's global description.
