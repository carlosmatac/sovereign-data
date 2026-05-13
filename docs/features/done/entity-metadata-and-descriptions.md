---
title: "Entity metadata and richer descriptions for retrieval"
status: done
owner: team
priority: medium
last_updated: 2026-05-13
related_architecture:
  - docs/audits/database-retrieval-architecture-audit.md
  - docs/architecture/ingestion-pipeline.md
related_infrastructure:
  - docs/infrastructure/database-schema.md
---

# Entity metadata and richer descriptions for retrieval

## Problem

Two related observations from the Phase 1 verification (2026-05-06,
see [`chat-entity-retrieval-rpc.md`](../on-going/chat-entity-retrieval-rpc.md)
findings #2 and #7):

1. **`entities.metadata` is empty everywhere.** Across all 56
   canonical entities in the live DB, `metadata` is `'{}'` (`with_meta
   = 0`). The column is reachable from the resolver and the chat
   tools, but no write path populates it. As a result none of the
   downstream surfaces (`lookupEntity`, the project brief, network
   explorer, reports) can use it for disambiguation or summarization.

2. **Descriptions are present but thin.** 55/56 canonical entities
   have a description, average length 83 chars. Sample descriptions
   from the highest-mention entities:
   - "Country in southern Africa, with rich natural resources and a
     population of over 35 million..." (Angola, 126 mentions) —
     decent.
   - "Geographical location relevant to operations in Angola,
     mentioned briefly in the context of the disc" (Huambo, 4
     mentions) — uninformative.
   - "An integrated food processor and agricultural ecosystem builder
     in Angola, aiming to support local f" (Carrinho Group, 5
     mentions) — truncated mid-word.

   Per
   [`enrichEntityDescriptions`](../../../src/lib/entities/resolve.ts)
   the description is rewritten only when the new text is **longer**,
   capped at 100 chars in practice. That cap actively discards richer
   context; the resulting strings underperform as standalone evidence
   when the chat falls back to "use the entity description as the
   answer" (the One World Media response in Test 2 is verbatim the
   100-char description).

The product impact (per the user's note): semantic-view-style work
shows that LLM answers are dramatically better when the context block
includes well-formed entity descriptions and structured metadata.
Today the chat is bottlenecked by sparse, truncated, schemaless
context.

## Goals

- A schema for `entities.metadata` (likely a Zod-typed JSON shape:
  `{ aliases?: string[], industry?: string[], country?: string[],
  founded?: string, website?: string, summary?: string,
  source_run?: { interview_id, model, version, generated_at } }`),
  versioned and validated at write time.
- A description-quality bar: minimum length ~200 chars, no
  mid-word truncation, structured (e.g. "<role> | <jurisdiction> |
  <one-line behavior>") so chat tool output is consumable by the
  downstream LLM.
- A backfill that regenerates `description` and `metadata` for the
  current entity set using the same extraction model (or a richer
  one), seeded from the chunks that mention the entity.
- Chat tools surface the `metadata` block alongside the description
  in `lookupEntity` output so the LLM can use it.

## Non-goals

- Re-extracting interview transcripts (this is entity-centric, not
  source-centric).
- Multi-language description support.
- Automatic verification of metadata claims (deferred).

## Approach

1. **Define the metadata shape** in
   `src/lib/entities/metadata-schema.ts` with Zod and add it to the
   types under `Database["public"]["Tables"]["entities"]["Row"]` via
   a comment-typed `Json` cast.
2. **Lift the description cap** in
   [`enrichEntityDescriptions`](../../../src/lib/entities/resolve.ts) —
   raise to ~600 chars and ensure full sentences (cut on `. ` only).
3. **Description + metadata generator** — small offline script
   `scripts/entities/refresh-context.ts` that, per entity:
   - selects the top-N (e.g. 8) most-mentioned chunks (already
     filtered through the persistence gate),
   - asks the extractor for `{ description, metadata }` constrained
     by the schema,
   - upserts the result with optimistic concurrency on
     `updated_at`.
4. **Pipeline integration** — once the offline script is proven,
   fold the same call into the runner (`runIntelPipelineFromCanonicalSource`)
   so newly-resolved entities get metadata at ingest time, not as a
   later batch job.
5. **Surface in chat** — `lookupEntity` returns
   `{ id, name, type, description, metadata }`; prompt builder
   includes a compact rendering when the field is non-empty.

## Dependencies & related docs

- Phase 1 verification: [`chat-entity-retrieval-rpc.md`](../on-going/chat-entity-retrieval-rpc.md)
  findings #2 and #7.
- Related tables: [`docs/infrastructure/database-schema.md`](../../infrastructure/database-schema.md)
  — `entities` row.
- Existing resolver: [`src/lib/entities/resolve.ts`](../../../src/lib/entities/resolve.ts)
  (`enrichEntityDescriptions`).
- Related plan phase: not strictly tied to one phase; the chat tool
  surface change rides Phase 2.x naturally.

## Risks & open questions

- LLM cost: regenerating metadata for 56 entities is trivial; for
  thousands it isn't. Need a budget/throttle.
- Truthfulness: structured metadata that is wrong is worse than
  empty. Need a "human review" badge on metadata that has not been
  verified, and a way for the reviewer to lock fields.
- Open question: do we use `entities.metadata` for retrieval-time
  filtering (e.g. country) or just for context? Probably both, but
  the index strategy differs.
- **Description reinforcement over time:** entity descriptions should get richer as more sources mention the entity. The offline backfill script (Phase 3 of the Approach above) establishes a baseline; the pipeline integration (Phase 4) ensures new ingests contribute. An incremental "re-enrich when mention count crosses a threshold" strategy (e.g. re-run when `mention_count` doubles) would let the most-discussed entities accumulate the richest context without regenerating everything on every ingest. This is tracked here rather than as a separate spec since it is a natural extension of Phase 4 pipeline integration.

## Acceptance / how to validate

- Pre-flight diagnostic: `with_meta = 0` (current state).
- After backfill: `with_meta >= 56` and `avg(length(description))
  >= 200`.
- Re-run the manual chat test "What does the database say about One
  World Media?" — answer must include at least one structured
  metadata claim grounded in the entity's chunks (e.g. country,
  industry).
- `lookupEntity` returns the `metadata` field; the `chat` route's
  system prompt prints it when non-empty.

## Implementation notes (2026-05-11)

### Metadata shape used: `entity_metadata_v1`

```
{
  schema_version: "entity_metadata_v1",
  summary_tags:   string[]          // 2–8 lowercase keyword tags
  countries:      string[]          // full English country names grounded in sources
  sectors:        string[]          // economic/thematic sectors
  confidence:     "high"|"medium"|"low"
  generated_from: {
    source_count:  number
    chunk_count:   number
    generated_at:  ISO timestamp string
    model:         string
  }
}
```

Fields NOT in metadata (stored elsewhere):
- `type` → `entities.type` column
- `aliases` → `entity_aliases` table
- `related_entities` → `entity_relationships` table
- Current roles/titles → `validated_positions` table

### Description length rules

- **Floor:** descriptions shorter than 120 chars from the generation path are not written (guard against degenerate model output).
- **Target:** 200–600 chars; the LLM prompt asks for this range explicitly.
- **Ceiling:** `trimToSentenceBoundary(text, 600)` — cuts at the last `. ` before 600 chars; falls back to last ` `. No mid-word or mid-sentence truncation.
- **Pipeline enrichment path (`enrichEntityDescriptions`):** the existing per-source description enrichment now overwrites if the new description is strictly longer than the stored one (removed the old `currentDesc.length < 100` guard that blocked updates on descriptions ≥ 100 chars).

### Files changed

| File | Change |
|------|--------|
| `src/lib/entities/metadata-schema.ts` | **New.** `EntityMetadataV1Schema` (Zod) + `EntityContextGenerationSchema` (generation subset, all required for OpenAI structured outputs) |
| `src/lib/entities/generate-entity-context.ts` | **New.** `generateEntityContext` (single entity, LLM call + DB write) + `enrichNewEntityContexts` (pipeline helper, up to 5 entities/run, concurrent) |
| `src/lib/entities/resolve.ts` | Fixed `enrichEntityDescriptions`: removed `< 100` cap; added `trimToSentenceBoundary` (max 600 chars at sentence boundary) |
| `src/lib/ai/entity-lookup.ts` | Added `metadata` field to `EntityMatch`; added to all `.select()` calls in `findEntity` and `fuzzySearch` |
| `src/app/api/chat/route.ts` | `lookupEntity` tool now returns `metadata` as compact pipe-delimited string when entity has v1 metadata; added `formatEntityMetadata` helper |
| `src/lib/ai/pipeline.ts` | Hooks `enrichNewEntityContexts` after source_entities writes; errors are swallowed (non-critical) |
| `scripts/entities/refresh-entity-context.ts` | **New.** Offline backfill script with `--project`, `--dry-run`, `--force`, `--concurrency` flags |

### Validation / how to test

1. **Pre-flight diagnostic (before backfill):**
   ```sql
   select count(*) filter (where metadata->>'schema_version' = 'entity_metadata_v1') as with_v1,
          count(*) total,
          round(avg(length(description))) as avg_desc_len
   from entities where canonical_entity_id is null;
   ```
   Expected before backfill: `with_v1 = 0`.

2. **Run the backfill (dry-run first):**
   ```bash
   npx tsx scripts/entities/refresh-entity-context.ts --dry-run
   npx tsx scripts/entities/refresh-entity-context.ts
   ```

3. **Post-backfill check:**
   - `with_v1 >= 50` (of 56 canonical entities — some may have < 2 chunks and be skipped)
   - `avg_desc_len >= 200`

4. **Chat test:**
   Ask the Copilot: *"What does the database say about One World Media?"*
   Expected: answer includes at least one structured metadata claim (country, sector, or tag) grounded in the entity's chunks rather than the previous 100-char verbatim description.

5. **`lookupEntity` tool output:**
   Verify a `metadata: "countries: ... | sectors: ... | tags: ..."` field appears in the tool call result when the entity has v1 metadata.

### Remaining follow-ups

- **Description reinforcement over time:** re-enrich when `mention_count` crosses a threshold (e.g. doubles). This is a Phase 3 / pipeline-extension concern; the `enrichNewEntityContexts` function in the pipeline already runs on each new ingest and skips entities that have v1 metadata + rich descriptions.
- **pg_trgm index for the search route:** if p95 search latency remains above 200ms after query parallelisation, add `CREATE INDEX CONCURRENTLY ON entities USING gin (name gin_trgm_ops)`. Separate migration, out of scope here.
- **Human-review flag on metadata:** a "needs_human_review" badge for metadata not yet verified. Tracked in `entity-correction-governance.md`.

## Implementation log

- 2026-05-06 — Spec drafted from Phase 1 manual-chat-test findings
  (folds findings #2 and #7).
- 2026-05-11 — Implemented: metadata schema, generator, backfill script,
  description cap lifted, pipeline hook, lookupEntity updated.
- 2026-05-13 — **Regression fix:** four root causes identified and fixed:

  **Root causes:**
  1. `MAX_PER_RUN = 5` in `enrichNewEntityContexts` — silently capped
     enrichment at 5 entities per pipeline run regardless of how many were
     relevant.
  2. Upload anchor entity IDs (`interviewee_entity_id`,
     `interviewee_org_entity_id`, multi-participant `source_entities` rows)
     were never included in the ID list passed to `enrichNewEntityContexts`.
     Only `resolvedEntities` (LLM extraction output) was passed.
  3. `generateEntityContext` skipped at `MIN_CHUNKS = 2` with no fallback —
     upload anchors are the primary subject of the source, so they rarely
     appear as third-party `entity_mentions` in chunks. They consistently
     hit the guard and were silently dropped despite `source_entities.context`
     (generated earlier in the same pipeline run) being available.
  4. No logging of which entities were skipped and why.

  **Files changed:**
  | File | Change |
  |------|--------|
  | `src/lib/entities/generate-entity-context.ts` | Removed `MAX_PER_RUN = 5`; added `fallbackContextText?: string` param to `generateEntityContext`; when chunks < `MIN_CHUNKS` AND fallback is provided, uses it as context instead of skipping; added `contextHints?: Map<string, string>` param to `enrichNewEntityContexts`; improved skip-reason logging |
  | `src/lib/ai/pipeline.ts` | Enrichment call now builds a unified entity ID set (`resolvedEntities` + `interviewee_entity_id` + `interviewee_org_entity_id` + all `source_entities.entity_id` for the source); pre-fetches `source_entities.context` in one query and passes it as `contextHints` to `enrichNewEntityContexts` |
