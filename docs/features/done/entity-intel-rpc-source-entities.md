---
title: "Phase 2.4 — entity_intel RPC reads source_entities"
status: done
owner: agent
priority: high
last_updated: 2026-05-08
related_plan: docs/roadmaps/database-refactor-plan.md
related_migration: supabase/migrations/00030_entity_intel_rpc_v2.sql
related_features:
  - docs/features/done/chat-entity-retrieval-rpc.md
  - docs/features/on-going/source-entities-pipeline-writes.md
---

# Phase 2.4 — `entity_intel` RPC reads `source_entities`

## Problem

The `entity_intel` SECURITY DEFINER function (migration `00026`, Phase 1) closes
the audit §13 retrieval gap by UNIONing:
1. `entity_mentions` (chunk-level mentions)
2. `sources.interviewee_entity_id` FK column directly
3. `sources.interviewee_org_entity_id` FK column directly
4. `entity_relationships` (non-rejected edges)

Branches 2 and 3 read legacy FK columns on `sources`. They were a pragmatic Phase 1
fix — but after Phase 2.2 (backfill) and Phase 2.3 (pipeline writes), every
source-level entity association now lives in `source_entities` with richer
provenance (`link_type`, `origin`, `is_primary`, `confidence`). Branches 2 and 3
should be replaced with a single `source_entities` branch that:

- Covers `interviewee` and `interviewee_org` (the old FK branch data)
- Also surfaces `extraction`-origin associations (`author`, `primary_subject`,
  `subject_organization`) that Phase 2.3 started writing when LLM confidence ≥ 0.9
- Is structurally correct — reading the table designed for this purpose

## Goals

1. Replace FK-column branches 2 + 3 in `entity_intel` with a single
   `source_entities` JOIN.
2. Surface all Phase 2.3-written link_types (not just the two FK anchor types).
3. Preserve the external chat tool contract (`lookupMentions` shape, `MentionRecord`
   interface) unchanged.
4. Extend `MentionRole` TypeScript type to include the new link_types.
5. Update chat route fallback context strings for new roles.
6. All tests green; no tsc errors.

## Scope

### In scope
- `supabase/migrations/00030_entity_intel_rpc_v2.sql` — `CREATE OR REPLACE` rewrite
- `src/lib/ai/entity-lookup.ts` — `MentionRole`, `MentionKind`, `MENTION_ROLE_PRECEDENCE`
- `src/app/api/chat/route.ts` — fallback context strings for new roles
- `src/lib/ai/entity-lookup.test.ts` — new role surface tests

### Not in scope
- Chat tool input/output schema (no breaking change)
- `getRelationships` function (branch 4 of the RPC is unchanged)
- `entity_mentions` branch (branch 1 unchanged)
- Phase 2.5 (drop global unique constraint on entities)

## Design

### New `source_entities` UNION branch

```sql
-- 2) Source-level associations via source_entities.
--    Replaces the legacy interviewee_*_entity_id FK branches.
--    Reads all link_types: upload_anchor rows (interviewee, interviewee_org)
--    and extraction rows (author, primary_subject, subject_organization).
SELECT se.source_id,
       s.title AS source_title,
       se.link_type::text AS role,
       CASE se.origin
         WHEN 'upload_anchor'   THEN 'anchor'
         WHEN 'metadata_import' THEN 'anchor'
         WHEN 'manual_tag'      THEN 'anchor'
         WHEN 'human_review'    THEN 'anchor'
         ELSE 'source_entity'
       END AS kind,
       (se.evidence->>'text')::text AS evidence,
       NULL::uuid AS chunk_id,
       NULL::text AS sentiment,
       s.conducted_at,
       s.created_at
FROM source_entities se
JOIN sources s ON s.id = se.source_id
WHERE se.entity_id = p_entity_id
  AND (p_project_id IS NULL OR s.project_id = p_project_id)
```

### Role precedence (updated)

```
interviewee > interviewee_org > primary_subject > subject_organization >
author > mention > related_via_relationship > participant > interviewer >
translator > account > source_owner > mentioned_at_source_level > related_entity
```

### Kind mapping

| origin | kind |
|---|---|
| `upload_anchor`, `metadata_import`, `manual_tag`, `human_review` | `'anchor'` |
| `extraction`, `ai_inference`, `alias_propagation`, `prior_context` | `'source_entity'` |
| `mention` branch (unchanged) | `'mention'` |
| `relationship` branch (unchanged) | `'relationship'` |

### Backward compatibility

- `MentionRole` union is extended, not changed — existing `'interviewee'` and
  `'interviewee_org'` roles still come through unchanged (via `link_type` cast).
- `MentionKind` gains `'source_entity'`; consumers that only handled `'anchor'` and
  `'mention'` fall through to the existing `"No chunk content available"` fallback
  until the chat route is updated.
- The `sources.interviewee_*_entity_id` FK columns are not removed — they remain
  deprecated for one full release window per the plan.
- The back-compat `interviews` view continues to expose them.

## Key files touched

| File | Change |
|---|---|
| `supabase/migrations/00030_entity_intel_rpc_v2.sql` | `CREATE OR REPLACE FUNCTION entity_intel` — replace branches 2+3 |
| `src/lib/ai/entity-lookup.ts` | `MentionRole`, `MentionKind`, `MENTION_ROLE_PRECEDENCE` |
| `src/app/api/chat/route.ts` | fallback context strings for `author`, `primary_subject`, `subject_organization` |
| `src/lib/ai/entity-lookup.test.ts` | tests for new roles + `source_entity` kind |

## Acceptance criteria

- [x] `entity_intel` no longer references `sources.interviewee_entity_id` or
      `sources.interviewee_org_entity_id` directly.
- [x] Chat: asking "have we interviewed X?" returns the source for X as
      `role='interviewee'` (via `source_entities`) — smoke-tested 2026-05-08.
      Martín Eurnekian → "test 2.3" (`interviewee`);
      Corporación América Airports → "test 2.3" (`interviewee_org`).
- [ ] Chat: asking about an entity tagged as `author` or `primary_subject` returns
      the source with the correct role — deferred until extraction-confidence rows
      accumulate in `source_entities` from new ingests.
- [x] No tsc errors (clean).
- [x] All 155 tests pass (5 new Phase 2.4 tests added).

## Follow-up queued

- [`docs/features/to-do/anchor-row-context-enrichment.md`](../../features/to-do/anchor-row-context-enrichment.md)
  — anchor rows return `null` evidence; the Copilot should fall back to
  source summary / representative chunk. Non-blocking, separate PR.

## Implementation log

### Migration (00030)

`CREATE OR REPLACE FUNCTION public.entity_intel(...)` — branches 2 and 3 replaced
with a single `source_entities` JOIN. Branch 1 (entity_mentions) and branch 3
(entity_relationships) unchanged. Dry-run verified (rowCount=1, function compiles,
clean rollback).

Key change in branch 1: now JOINs `sources` and `source_chunks` directly (not the
back-compat `interviews` / `interview_chunks` views) for correctness.

### TypeScript (`src/lib/ai/entity-lookup.ts`)

- `MentionRole` extended with all current `source_entity_link_type` enum values:
  `interviewer`, `translator`, `participant`, `author`, `primary_subject`,
  `subject_organization`, `account`, `source_owner`, `mentioned_at_source_level`,
  `related_entity`.
- `MentionKind` extended with `'source_entity'` (for extraction/ai_inference origin).
- `MENTION_ROLE_PRECEDENCE` updated: new order is `interviewee > interviewee_org >
  primary_subject > subject_organization > author > mention > related_via_relationship
  > participant > interviewer > translator > account > source_owner >
  mentioned_at_source_level > related_entity`.

### Chat route (`src/app/api/chat/route.ts`)

Fallback context strings added for `author`, `primary_subject`, `subject_organization`
roles in the `lookupMentions` tool output.

### Tests added (`src/lib/ai/entity-lookup.test.ts`)

5 new tests in "Phase 2.4 — source_entities roles" describe block:
- `author` role surfaced (kind=source_entity).
- `primary_subject` role surfaced.
- Dedup: `interviewee` (anchor) wins over `author` (source_entity) for same source.
- Dedup: `primary_subject` wins over `mention` for same source.
- Dedup: `author` wins over `related_via_relationship` for same source.
