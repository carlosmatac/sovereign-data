---
title: "Fix: strict source-grounded entity persistence"
status: on-going
owner: ventura
priority: high
last_updated: 2026-04-16
related_architecture:
  - docs/architecture/ingestion-pipeline.md
related_infrastructure: []
---

# Fix: strict source-grounded entity persistence

## Problem

Today Sovereign can persist entities and relationships that are **not explicitly mentioned in the processed source**. Concretely:

- `extractIntelligence()` returns a mix of explicitly mentioned and inferred entities without distinguishing them.
- `groundEntityMentions()` tries to tie each entity to a chunk using four strategies (`exact`, `alias`, `anchor_context`, `fuzzy`), but when grounding fails the pipeline falls back to persisting `entity_mentions` with `chunk_id = null` and `context = null` — a silent "we know this exists somewhere" fallback.
- Relationship persistence only checks that both sides resolve to an `entity_id`, not that both sides were **locally grounded** in the source.
- `anchor_context` intentionally accepts inferred mentions of the upload anchors (interviewee, interviewee org) from contextual clues (honorific+surname, org token overlap) — that is the right behavior for internal resolution, but in the current pipeline it is also treated as a valid excuse to persist the entity.

Net effect: an interview can end up with `entity_mentions` and `entity_relationships` for entities that never appear in the transcript, pulled in either from the LLM's general knowledge or from upload anchors.

## Goals

- An entity is **persisted** only if it has **explicit local textual evidence** in the source (exact name or a known alias that is literally present in a chunk).
- A relationship is persisted only if **both** source and target entities survive the persistence gate.
- Upload anchors (`intervieweeName`, `intervieweeOrg`) remain usable for disambiguation, chunk normalization, embeddings and prompt context — but do **not** enter the persisted `entity_mentions[]` by themselves.
- Behavior is consistent across all current source types: audio, document/PDF, and reviewed-text reprocess.
- Reviewed reprocess keeps working; `reviewer seed` entities still flow through resolution/alias registration but also have to earn grounded evidence to be persisted.
- Precision > recall for this phase. It is acceptable if a few real entities get dropped because the ASR misspells them badly — they will still be recovered on reviewed reprocess (alias learning + human seeds).

## Non-goals

- Full pipeline redesign or extractor rewrite.
- DB migration: no new columns. `matchMethod` continues to live in memory only.
- New prompt block (`candidateEntities`) — the real bug is in persistence, not in the prompt.
- Backfilling historical `entity_mentions` rows with `chunk_id = null`. The backfill endpoint already re-grounds them opportunistically; we do not purge old rows.

## Approach

1. **Grounding policy** (`src/lib/entities/ground-mentions.ts`)
   - Export a tiny policy helper `isPersistableMatchMethod(method)` that returns `true` only for `exact` and `alias`.
   - `anchor_context` and `fuzzy` remain part of the grounding strategy (still useful for chunk-level context and disambiguation) but are treated as **not enough** to promote an entity into persisted output.

2. **Pure persistence gate** (`src/lib/ai/persistence-gate.ts`, new)
   - A pure function `applyPersistenceGate({ groundedMap, entitiesForGrounding, relationships, entityIdMap, interviewId })` that:
     - Walks the grounded map and keeps only mentions whose `matchMethod` is persistable.
     - Discards any entity that ends up with zero persistable mentions — **no silent null-chunk fallback**.
     - Filters relationships so both source and target must resolve to an entity that survived the gate.
   - Pure input/output so it can be unit-tested without Supabase.

3. **Pipeline integration** (`src/lib/ai/pipeline.ts`, `src/lib/ai/document-pipeline.ts`)
   - Replace the existing "create null-chunk mention for every ungrounded entity" block with a single call to the gate.
   - Use the returned `persistedEntityIds` to filter `entity_relationships` upserts instead of the naive name-map check.
   - Keep anchor-derived `entityIdMap` entries so ASR-corrupted anchor names can still resolve to the correct entity record internally — but those entries **do not** grant a free pass into persisted output.

4. **Reviewed reprocess**
   - Reviewer seed entities (from `interview_review_entities`) keep flowing through `resolveExtractedEntities` and continue to register aliases. They are **still** subject to the same grounding gate during persistence, which is consistent with the strict rule ("mention in the source"). The reviewer's confirmation is a strong signal to the LLM, not a bypass of grounding.

5. **Metadata / embeddings untouched**
   - Anchor-aware chunk normalization, `content_for_embedding`, and the `metadata.entities` tag on chunks are all internal signals for retrieval. They are not part of the persisted entity graph and are left as-is.

## Technical notes

- **Policy constants** live in `ground-mentions.ts` so future loosening (e.g. allow `fuzzy` with confidence=high) is a one-line change, and a sibling test file locks the policy.
- The gate is the **only** place that writes the final `mentionRows` + `relationshipRows` shape, called from both pipelines. Pipelines no longer decide on silent fallbacks.
- Logging: after the gate, both pipelines log a single structured line (`grounded=N kept=K dropped=D relationships_kept=R relationships_dropped=X`) so operators can see the precision tradeoff per interview.

## Likely code paths

- `src/lib/ai/pipeline.ts` (audio + reviewed-text reprocess)
- `src/lib/ai/document-pipeline.ts` (PDF/document)
- `src/lib/entities/ground-mentions.ts`
- `src/lib/ai/persistence-gate.ts` (new)
- `src/lib/ai/persistence-gate.test.ts` (new)
- `src/lib/entities/ground-mentions.test.ts` (new)

## Dependencies & related docs

- Architecture reference: [`docs/architecture/ingestion-pipeline.md`](../../architecture/ingestion-pipeline.md) — the "Hybrid entity grounding" and "Entity persistence" sections are amended in the same change.
- Related feature: [Interview transcript review](../done/interview-transcript-review.md) — reviewed reprocess still works, reviewer seeds still flow, but subject to grounding.

## Risks & open questions

- **Recall drop for badly transcribed names.** If ASR produces a heavy misspelling with no alias yet, the entity will no longer be persisted. This is by design for this phase — the entity editor + alias learning + reviewed reprocess are the recovery paths. Accepted.
- **Anchor-only interviews.** If a PDF/audio is so short that the interviewee name never appears literally (e.g. a memo that only says "the Minister"), the anchor entity will no longer land in `entity_mentions`. The upload anchor remains as `interview.interviewee_entity_id`; callers querying "who was interviewed" should continue to use that column, not the mentions table. Existing UI already does this.
- **Historical rows.** Old null-chunk `entity_mentions` rows remain in the DB. Not touched by this change; the backfill endpoint can re-ground them opportunistically.

## Acceptance / how to validate

Automated (vitest):
- `ground-mentions.test.ts` — `isPersistableMatchMethod` matches policy (`exact`, `alias` only).
- `persistence-gate.test.ts` covers:
  - plausible-but-unmentioned entity → **not persisted**.
  - explicitly mentioned entity → persisted with a grounded mention.
  - entity resolved via alias that appears literally in the text → persisted.
  - entity supported only by `anchor_context` → **not persisted**.
  - entity supported only by `fuzzy` → **not persisted**.
  - relationship with one ungrounded endpoint → **not persisted**.
  - relationship with both endpoints grounded → persisted.

Manual smoke:
- Upload a short audio interview → pipeline completes to `COMPLETED` with mentions carrying non-null `chunk_id`.
- Upload a PDF interview → same.
- Run "Reprocess from review" on an existing reviewed interview → completes; reviewer seeds with literal text evidence are persisted, reviewer seeds without evidence are not.

## Implementation log

- 2026-04-16 — Branch `ventura/fix-context-entity-ingestion` from `main`. Pure gate + grounding policy + pipeline + document-pipeline integration + tests + docs.
