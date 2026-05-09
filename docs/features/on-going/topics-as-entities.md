---
id: topics-as-entities
title: "Phase 4b — Topics / sectors / risks / opportunities as first-class entities"
status: on-going
owner: carlos
last_updated: 2026-05-09
phase: 4b
migrations:
  - supabase/migrations/00040_entity_type_topics.sql
related:
  - docs/roadmaps/database-refactor-plan.md § Phase 4b
  - docs/features/on-going/chat-message-evidence.md
  - docs/architecture/tenant-model-adr.md § 3.8a
---

# Phase 4b — Topics / sectors / risks / opportunities as first-class entities

## Problem

The current extraction pipeline produces `topics[]`, `risks[]`, and
`opportunities[]` as **string-array tags** stored in `sources.topics` (a
denormalized column). These tags cannot:

- Be linked to entities via `entity_mentions` or `entity_relationships`
- Be searched, filtered, or browsed in the entity graph
- Be tracked across sources (no persistent entity row = no cross-source
  aggregation)
- Be cited in chat (no `chunk_id` link)

Meanwhile the `entity_type` enum already has `SECTOR` and `COMMODITY` (added
in migration 00025), but `TOPIC`, `RISK`, `OPPORTUNITY`, and `PROJECT` were
missing.

## Goal

1. **Schema (migration 00040):** add `TOPIC`, `RISK`, `OPPORTUNITY`, `PROJECT`
   to the `entity_type` enum.
2. **Extraction:** when `topicEntitiesEnabled=true` (default), the LLM emits
   substantive named topics, risks, opportunities, and projects as entities in
   the `entities[]` array — alongside the existing short-tag string arrays,
   which are kept as denormalized fallback.
3. **Resolution / write path:** unchanged — the existing entity resolution
   pipeline handles any `EntityType` value, so TOPIC/RISK/OPPORTUNITY/PROJECT
   entities automatically get entity rows, mentions, and relationships.
4. **Backwards compatibility:** `sources.topics[]` continues to be populated
   from `ExtractionResult.topics` (the short-tag string array) for any code
   that reads it. No deprecation in this phase.

## Non-goals (Phase 4b)

- A UI for browsing TOPIC/RISK/OPPORTUNITY/PROJECT entities (deferred).
- Search/filter by new entity types in the entity explorer (additive; no
  blockers, but not in scope for this PR).
- Removing `sources.topics[]` (kept for one release per plan).

---

## Schema change

**Migration 00040 — `00040_entity_type_topics.sql`:**

```sql
ALTER TYPE public.entity_type ADD VALUE IF NOT EXISTS 'TOPIC';
ALTER TYPE public.entity_type ADD VALUE IF NOT EXISTS 'RISK';
ALTER TYPE public.entity_type ADD VALUE IF NOT EXISTS 'OPPORTUNITY';
ALTER TYPE public.entity_type ADD VALUE IF NOT EXISTS 'PROJECT';
```

Additive only. Zero rows affected. No rollback needed (enum values cannot be
removed from Postgres enums, but they have no effect until extraction starts
emitting them).

---

## Feature flag

`AI_CONFIG.topicEntitiesEnabled` (default: `true`, controlled by env var
`ENABLE_TOPIC_ENTITIES`):

```typescript
topicEntitiesEnabled: process.env.ENABLE_TOPIC_ENTITIES !== "false"
```

Set `ENABLE_TOPIC_ENTITIES=false` in the environment to revert to pre-4b
extraction behavior (only the short-tag string arrays, no entity rows for
topics/risks/opportunities/projects). This is the A/B comparison lever.

The flag is also accepted as a parameter to `extractIntelligence()`:
```typescript
extractIntelligence({ ..., topicEntitiesEnabled: false })
```

---

## Extraction changes

**File: `src/lib/ai/extraction.ts`**

### Entity type guidance

`ENTITY_TYPE_GUIDANCE_BASE` (always active): existing types unchanged.

`THEMATIC_ENTITY_TYPE_GUIDANCE` (added when flag is on):
- `TOPIC`: substantive named theme discussed at length (e.g. "Energy Transition")
- `RISK`: named specific risk trackable across sources (e.g. "Regulatory Uncertainty in Angola")
- `OPPORTUNITY`: named specific opportunity (e.g. "LNG Export Corridor to Europe")
- `PROJECT`: named real-world project/programme (e.g. "Trans-Saharan Gas Pipeline")

A separate `thematicEntitiesBlock` instruction in the prompt clarifies:
- These entities supplement (do not replace) the `topics[]`/`risks[]`/`opportunities[]` short-tag arrays
- Emit at most 3–4 RISK / OPPORTUNITY entities per source
- Relationships use `affiliated_with` (entity ↔ person/org) or `operates_in` (project ↔ country)

### Schema: no changes

`ExtractionSchema` already accepts any `EntityTypeSchema` value in the
`entities[]` array. Adding new enum values to `ENTITY_TYPE_VALUES` (which
`EntityTypeSchema = z.enum(ENTITY_TYPE_VALUES)` uses) is sufficient.

---

## Write path (no changes)

The entity resolution pipeline (`resolveExtractedEntities`) and the pipeline
writer (`pipeline.ts`) are type-agnostic — they handle any `EntityType`. Once
a TOPIC/RISK/OPPORTUNITY/PROJECT entity is extracted:

1. `resolveExtractedEntities` calls `matchOrCreateEntity` → creates/matches an
   `entities` row with the new type.
2. Entity mentions are written to `entity_mentions` (one per chunk that
   mentions the entity).
3. Entity relationships are written to `entity_relationships`.
4. `sources.topics[]` continues to be populated from `ExtractionResult.topics`
   (the short-tag array) — unchanged.

---

## Backwards compatibility

| What | Status |
|------|--------|
| `sources.topics[]` string array | Still populated every run |
| `ExtractionResult.topics` | Still present in schema, unchanged |
| `ExtractionResult.risks[]` / `opportunities[]` | Still present, unchanged |
| Pre-existing entity types | Unaffected |
| `ENTITY_TYPE_GUIDANCE_BASE` prompt text | Unchanged |
| Chat tool (`lookupEntity`, `lookupMentions`) | Works for new types automatically |
| Network Explorer | Shows new entity types automatically (no dedicated UI) |

---

## Key files changed

| File | Change |
|------|--------|
| `supabase/migrations/00040_entity_type_topics.sql` | New migration: 4 enum values |
| `src/types/database.ts` | `ENTITY_TYPE_VALUES` extended with 4 new types |
| `src/lib/constants.ts` | `AI_CONFIG.topicEntitiesEnabled` flag |
| `src/lib/ai/extraction.ts` | `buildEntityTypeGuidance`, `thematicEntitiesBlock`, `topicEntitiesEnabled` param |
| `src/__tests__/entity-types.test.ts` | Updated to include 4 new types |
| `src/__tests__/thematic-entities.test.ts` | New test for thematic entity type behavior |

---

## Validation

1. `npx tsc --noEmit` — zero errors.
2. `npm test` — all tests pass including updated entity-types and new thematic tests.
3. `supabase db push --dry-run` — only migration 00040 queued.
4. Pending remote push approval.

---

## Risks

| # | Risk | Severity | Mitigation |
|---|------|----------|-----------|
| R1 | LLM emits too many thematic entities, diluting precision | Medium | Prompt caps RISK/OPPORTUNITY at 3–4; TOPIC only for deep discussion |
| R2 | Quality regression in existing entity types | Low | Existing guidance unchanged; new types are additive |
| R3 | `topics[]` array redundant with TOPIC entities | Low | Both populate for one release; removal planned after A/B comparison |
| R4 | RISK/OPPORTUNITY entities too generic (same as the string tags) | Medium | Prompt instructs "named specific risk trackable across sources" not generic |
| R5 | Entity resolution creates duplicate rows for similar risks | Low | Existing deduplication logic (trigram similarity) handles this |

---

## Technical debt

- **TD-1:** `sources.topics[]` column and `ExtractionResult.topics` string array
  are now partially redundant with TOPIC entities. Plan to drop `topics[]` in a
  future "Soon" PR once the network explorer shows TOPIC entities and no reader
  depends on the string array. Track in active-workstreams when ready.
