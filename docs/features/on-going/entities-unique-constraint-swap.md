---
title: "Phase 2.5 — Drop global entities UNIQUE(name, type); add project-scoped unique index"
status: on-going
owner: agent
priority: high
last_updated: 2026-05-08
related_plan: docs/roadmaps/database-refactor-plan.md
related_migration: supabase/migrations/00031_entities_project_scoped_unique.sql
related_features:
  - docs/features/on-going/database-retrieval-refactor-baseline.md
  - docs/features/done/chat-entity-retrieval-rpc.md
---

# Phase 2.5 — Drop global `entities.UNIQUE(name, type)`; add project-scoped unique index

## Problem

`00001_initial_schema.sql` created `entities` with a bare `UNIQUE(name, type)`
constraint. When `00009_entity_normalization.sql` introduced `project_id` (nullable
— `NULL` = global), the constraint was never updated. As a result:

- Two different projects cannot independently own an entity named "Ministry of
  Energy" of type `PUBLIC_INSTITUTION`.
- When `matchOrCreateEntity` tries to INSERT such a row and a global (or another
  project's) entity already owns the `(name, type)` pair, Postgres raises
  `error code 23505`.
- `match.ts` silently recovers by **returning the existing entity from the
  conflicting scope** — quietly merging entities across project boundaries without
  any trace in logs or telemetry (audit finding §3.5 / §5.3).

The migration used for `entity_aliases` scope already shows the correct pattern:
`COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid)` — NULL is
treated as one shared global scope, non-NULL project IDs are independent.

## Pre-flight

Phase 0 baseline (2026-05-05) confirmed:

| §12.10 — duplicate canonical entities (same normalized_name + type) | **0** |
| §12.12 — project/global collisions on the same name                | **0** |

Both are 0, so no remediation migration is required before this swap. The plan's
R4 risk is resolved.

## Goals

1. Drop `entities_name_type_key` (the global `UNIQUE(name, type)` table
   constraint from `00001`).
2. Add `entities_name_type_scope_unique` — a project-scoped partial unique index
   on `(normalized_name, type, COALESCE(project_id, '00000000…'))`.
3. Remove the `23505` recovery hack in `src/lib/entities/match.ts`
   (`createProjectCanonicalEntity`). After the constraint swap a 23505 is
   genuinely unexpected (the exact-match steps 1–4 would have found a
   same-scope duplicate before reaching INSERT), so it should surface as an
   error.
4. Add a unit test documenting that 23505 now propagates.

## Scope

### In scope

- `supabase/migrations/00031_entities_project_scoped_unique.sql`
- `src/lib/entities/match.ts` — remove 23505 recovery block in
  `createProjectCanonicalEntity`
- `src/lib/entities/match.test.ts` — add 23505-propagation test

### Not in scope

- Workspace-level scoping of the index (deferred to Phase 3a — when
  `workspace_id` is added to `entities`, the index will be revisited)
- Any backfill or remediation (pre-flight confirmed clean)
- `entity_aliases` unique constraint (already project-scoped since `00009`)

## Design

### New unique index (mirrors `entity_aliases` from `00009`)

```sql
ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_name_type_key;

CREATE UNIQUE INDEX entities_name_type_scope_unique
  ON entities (
    normalized_name,
    type,
    COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
```

The `COALESCE` sentinel (`00000000-…`) ensures two global rows (both `project_id
IS NULL`) with the same `(normalized_name, type)` still conflict — preserving the
existing global-entity deduplication behaviour.

### `match.ts` change

Remove the `if (error.code === "23505") { … }` recovery block in
`createProjectCanonicalEntity`. The four exact-match steps that precede INSERT
(project entity, project alias, global entity, global alias) would return the
matching entity for any same-scope duplicate. A 23505 after those four misses can
only occur if two concurrent pipeline runs race on the same entity name, which is
not currently possible in a single-tenant, sequential pipeline. Propagating the
error surfaces it instead of silently merging across scopes.

### Forward-compat with Phase 3a

When Phase 3a adds `workspace_id` to `entities`, this index will be dropped and
replaced with a workspace-scoped variant:
`(normalized_name, type, workspace_id, COALESCE(project_id, …))` or simply
`(normalized_name, type, workspace_id)`. The Phase 2.5 index is explicitly
named `entities_name_type_scope_unique` so Phase 3a can target it by name.

## Key files touched

| File | Change |
|---|---|
| `supabase/migrations/00031_entities_project_scoped_unique.sql` | DROP global constraint + CREATE scoped index |
| `src/lib/entities/match.ts` | remove 23505 recovery block |
| `src/lib/entities/match.test.ts` | add 23505-propagation test |

## Acceptance criteria

- [x] `entities_name_type_key` constraint no longer exists in the DB.
      (Pre-flight: count=1; post-flight: count=0 — confirmed 2026-05-08.)
- [x] `entities_name_type_scope_unique` index exists in the DB.
      (Pre-flight: count=0; post-flight: count=1 — confirmed 2026-05-08.)
- [x] 63 total entities; all 63 distinct under the new scoped key — no collision
      during the swap.
- [x] A 23505 on INSERT in `createProjectCanonicalEntity` now propagates as an
      error (unit test added; passes).
- [x] `match.ts` contains no `23505` recovery code in `createProjectCanonicalEntity`.
- [x] All 6 unit tests pass; no tsc errors.
- [x] §12.10 = 0, §12.12 = 0 in the post-Phase-2.5 audit re-run (2026-05-08).

## Implementation log

### 2026-05-08

- Migration `00031_entities_project_scoped_unique.sql` written and applied to live
  DB. Pre/post verification confirmed `entities_name_type_key` dropped and
  `entities_name_type_scope_unique` created. 63 entities; zero collisions during swap.
- `src/lib/entities/match.ts`: removed `23505` recovery block in
  `createProjectCanonicalEntity`. Updated comment to explain new constraint semantics.
- `src/lib/entities/match.test.ts`: added "Phase 2.5: 23505 now propagates" test.
  Test count: 5 → 6; all green.
- Audit re-run (all 18 queries): §12.10 = 0, §12.12 = 0 ✓. Data-only deltas
  noted in baseline doc (§12.1/§12.2 = 1 each — new ingest, expected; §12.3 = 25
  — +1 orphan; §12.13 = 4 — +1 reviewed interview).
