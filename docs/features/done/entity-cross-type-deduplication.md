---
title: "Entity cross-type deduplication"
status: done
owner: team
priority: high
last_updated: 2026-05-17
related_architecture:
  - docs/audits/database-retrieval-architecture-audit.md
related_infrastructure:
  - docs/infrastructure/database-schema.md
---

# Entity cross-type deduplication

## Problem

`entities.UNIQUE(name, type)` (from migration `00001`) allows the same
canonical name to exist multiple times in the same project as long as
the `type` column differs. As of the Phase 1 verification (2026-05-06)
the live DB carries at least:

- `One World Media` × 2 — `COMPANY` (no coverage) and `ORGANIZATION`
  (1 mention + 3 relationships) in the Angola project.
- `Banco Angolano de Investimentos` × 3 — `COMPANY`, `ORGANIZATION`,
  `PUBLIC_INSTITUTION` in the Angola project.

`findEntity(name, projectId)` in
[`src/lib/ai/entity-lookup.ts`](../../../src/lib/ai/entity-lookup.ts)
matches by `(normalized_name, project_id, canonical_entity_id IS
NULL)` and `.limit(1).maybeSingle()`. When duplicates exist it returns
whichever the planner orders first — often the row with **less**
coverage — and the chat answers "no information" for entities that
actually have rich downstream evidence.

This is the documented root cause of the failing **One World Media**
manual chat test in
[`chat-entity-retrieval-rpc.md`](../on-going/chat-entity-retrieval-rpc.md).

The audit's §12.10 probe groups by `(normalized_name, type)` and
therefore **scores 0** here. We need a §12.10b probe that groups by
`normalized_name` only.

## Goals

- New probe `§12.10b — Same-normalized-name canonical duplicates
  across different `type` values within a project` added to the audit
  set + `scripts/audit/queries/`.
- A canonical merge plan: chosen survivor row per `(project_id,
  normalized_name)` cluster, with mentions / relationships / aliases
  re-pointed to the survivor and demoted rows marked via
  `canonical_entity_id` (or hard-deleted if zero coverage).
- A migration that performs the merge transactionally and is safe to
  re-run on top of Phase 2.5's uniqueness swap.
- `findEntity` updated to break ties deterministically (e.g. prefer
  the row with most `entity_mentions + entity_relationships`) until
  the merge runs, so that the failure surface is reduced even before
  the migration ships.

## Non-goals

- Cross-project entity merging (out of scope; canonical entity model
  is project-scoped).
- Manual entity correction UX (covered by
  [`entity-correction-governance.md`](./entity-correction-governance.md)).
- Choosing the "right" `entity_type` taxonomy (the COMPANY vs
  ORGANIZATION ambiguity is itself a taxonomy issue, but the dedupe
  here just picks one survivor).

## Approach

1. **Audit probe** — add `12-17-cross-type-canonical-duplicates.sql`
   that groups by `(project_id, normalized_name)` and surfaces clusters
   with `count(*) > 1`.
2. **Survivor heuristic** — for each cluster, prefer the row with:
   most coverage (mentions + relationships) → most recent
   `created_at` → lexicographically first `id`. Encode in a SQL CTE.
3. **Repoint** — `entity_mentions.entity_id`, `entity_aliases.entity_id`,
   `entity_relationships.{source,target}_entity_id`,
   `validated_positions.{person,organization}_entity_id` repointed to
   survivor; obey existing foreign-key cascades.
4. **Demote** — non-survivor rows get
   `canonical_entity_id = survivor_id`. (No hard delete; preserves
   external references.)
5. **Resolver tie-break** — `findEntity` selects up to 5 candidates
   and ranks them by coverage before returning.

## Dependencies & related docs

- Phase 1 verification: [`chat-entity-retrieval-rpc.md`](../on-going/chat-entity-retrieval-rpc.md) — Live verification §Test 2.
- Refactor plan: [`database-refactor-plan.md`](../../roadmaps/database-refactor-plan.md) — Phase 2.5 (uniqueness swap) is the structural follow-up.
- Audit: [`database-retrieval-architecture-audit.md`](../../audits/database-retrieval-architecture-audit.md) §3.2 / §12.10.

## Risks & open questions

- Repointing `entity_relationships` may collide with the existing
  `UNIQUE(source_entity_id, target_entity_id, relation_type,
  interview_id)` constraint when both endpoints survive separately
  but their merged form duplicates an existing edge. Migration must
  handle that with `ON CONFLICT DO NOTHING` (and audit the
  rejected-rule mirror so editorial state is preserved).
- Open question: do we run the merge **before** or **as part of**
  Phase 2.5? Running it before keeps Phase 2.5 a pure constraint swap.
- Open question: should `findEntity`'s coverage-aware tie-break ship
  immediately as a hot-fix to make Test 2 pass on current data,
  independent of the merge?

## Acceptance / how to validate

- §12.10b probe returns 0 after the merge.
- Re-run the manual chat test "What does the database say about One
  World Media?" — answer must reference at least one connected entity
  / interview.
- `entity_mentions`, `entity_relationships`, `entity_aliases` row
  counts unchanged before vs. after merge (only `entity_id` columns
  changed); `entities` row count drops by the number of demoted rows.

## Implementation log

- 2026-05-06 — Spec drafted from Phase 1 manual-chat-test findings.
