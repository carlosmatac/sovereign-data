---
title: "Phase 3b — Reprocess transactional swap"
status: on-going
owner: agent
priority: high
last_updated: 2026-05-08
migration: 00035
related_architecture:
  - docs/architecture/ingestion-pipeline.md
related_features:
  - docs/features/on-going/tenants-rls-and-customization.md
related_roadmap:
  - docs/roadmaps/database-refactor-plan.md (§5 Phase 3b)
---

# Phase 3b — Reviewed-reprocess transactional swap

## Problem

`reprocessInterviewFromReview` in `src/lib/ai/pipeline.ts` clears derived
data and re-inserts it in two separate operations:

```
1. compute all new data in memory (chunks + embeddings + entities + mentions + relationships + snippets)
2. rpc clear_source_derived_data(sourceId)   ← old data gone
3. insert source_chunks in batches of 50     ← can fail here
4. insert entity_mentions in batches
5. insert entity_relationships
6. insert content_snippets
```

If step 3-5 fail after step 2, the source ends up with `status=FAILED` and
**no derived rows at all** — zero chunks, zero mentions, zero relationships.
The source's `transcript_review_status` is left as `reprocessing` with no
path to recovery except re-triggering the review reprocess from scratch.

This is a known gap documented in the architecture audit (§5.4).

## Goal

Replace the clear + N-insert pattern with a single `SECURITY DEFINER`
Postgres function `replace_source_derived_data` that executes the DELETE and
all INSERTs inside **one transaction**. If any INSERT fails, the DELETE also
rolls back — the original derived layer remains intact.

## Non-goals

- Changing the pipeline compute logic (embeddings, entity resolution, grounding)
- Changing the `clear_source_derived_data` function (kept for other callers)
- Transactional safety for the *first* ingest (no existing derived data to preserve)
- Changing `source_entities` writes (these are additive upserts, not cleared on reprocess)

## Design

### New SQL function (migration 00035)

```sql
replace_source_derived_data(
  p_source_id       uuid,
  p_chunks          jsonb,       -- array of chunk objects (see §Schema below)
  p_mentions        jsonb,       -- array of mention objects
  p_relationships   jsonb,       -- array of relationship objects (pending only)
  p_snippets        jsonb        -- array of snippet objects
) RETURNS void SECURITY DEFINER
```

The function runs in a single implicit PL/pgSQL transaction:
1. Resolves `tenant_id` from `sources` (errors if source not found)
2. Deletes `content_snippets` for the source
3. Deletes `entity_relationships` with `review_status = 'pending'` (preserves
   `approved` / `rejected` editorial rows)
4. Deletes `entity_mentions` for the source
5. Deletes `source_chunks` for the source (cascade clears any chunk-level data)
6. Inserts all new chunks — embedding JSON array is cast to `vector` inline
7. Inserts all new mentions (`ON CONFLICT DO NOTHING` for pre-existing grounded rows)
8. Inserts all new relationships (`ON CONFLICT DO NOTHING` to protect editorial rows)
9. Inserts all new snippets

### JSONB payload schema

#### `p_chunks` element
```json
{
  "id": "uuid",
  "chunk_index": 0,
  "content": "raw text",
  "speaker": "Speaker A",
  "start_time": 12.5,
  "end_time": 34.1,
  "embedding": [0.1, 0.2, ...],   // 1536-float array
  "metadata": { ... }
}
```

#### `p_mentions` element
```json
{
  "id": "uuid",
  "entity_id": "uuid",
  "chunk_id": "uuid",
  "context": "text excerpt",
  "sentiment": "positive"
}
```

#### `p_relationships` element
```json
{
  "id": "uuid",
  "source_entity_id": "uuid",
  "target_entity_id": "uuid",
  "relation_type": "works_for",
  "confidence": 0.9,
  "evidence_text": "quoted text",
  "origin": "extraction"
}
```

#### `p_snippets` element
```json
{
  "id": "uuid",
  "snippet_type": "linkedin",
  "content": "text",
  "context": "optional context"
}
```

### Pipeline change

In `reprocessInterviewFromReview` (and the reviewed-reprocess branch of
`runIntelPipelineFromCanonicalSource`):

- Compute all data in memory exactly as today
- Serialize to the JSONB payloads above
- Call `replace_source_derived_data(sourceId, chunksJson, mentionsJson, relsJson, snippetsJson)` **once**
- If it throws, catch and set `status=FAILED` — old derived data is intact
- If it succeeds, update `status=COMPLETED` as today

The original `clearDerivedBeforeInsert` flag path remains for the non-reviewed
first-ingest path (which has nothing to preserve).

## Acceptance criteria

- [ ] Migration 00035 applies cleanly (push pending)
- [x] `npx tsc --noEmit` clean — 0 errors
- [x] `npm test` 161/161 pass (5 new Phase 3b tests)
- [x] New test: `replace_source_derived_data` throws → status FAILED, transcript_review_status reset to 'ready'
- [x] New test: first-ingest path does NOT call `replace_source_derived_data`
- [x] New test: chunk payload carries pre-assigned UUID + serialised embedding
- [ ] Smoke: trigger a reprocess of a reviewed interview; confirm COMPLETED and
      derived data present in app (manual post-push)

## Files to touch

- `supabase/migrations/00035_replace_source_derived_data.sql` (new)
- `src/lib/ai/pipeline.ts` — `runIntelPipelineFromCanonicalSource` (clearDerivedBeforeInsert branch)
- `src/types/database.ts` — RPC type for `replace_source_derived_data`
- `src/__tests__/pipeline-reprocess-txn.test.ts` (new)
- `docs/features/on-going/reprocess-transactional-swap.md` (this file)
- `docs/roadmaps/active-workstreams.md`
