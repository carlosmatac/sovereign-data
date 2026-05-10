---
title: "Entity metadata and richer descriptions for retrieval"
status: to-do
owner: team
priority: medium
last_updated: 2026-05-06
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

## Implementation log

- 2026-05-06 — Spec drafted from Phase 1 manual-chat-test findings
  (folds findings #2 and #7).
