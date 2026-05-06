---
title: "Entity correction governance (post-extraction)"
status: to-do
owner: team
priority: medium
last_updated: 2026-05-06
related_architecture:
  - docs/audits/database-retrieval-architecture-audit.md
  - docs/architecture/ingestion-pipeline.md
related_infrastructure:
  - docs/infrastructure/database-schema.md
related_features:
  - docs/features/done/admin-entity-governance-dashboard.md
---

# Entity correction governance (post-extraction)

## Problem

When a human reviewer corrects an entity name on an interview (e.g.
"AMC" was extracted incorrectly and renamed by the user), the legacy
canonical entity remains in `entities` even after the correction. The
corrected name becomes a **new** canonical row, with its own mentions
and relationships, and the **old** row stays behind, often:

- with stale mentions that no longer reflect reality,
- without any explicit alias / canonical pointer to the corrected
  entity, and
- still being surfaced by chat tools as a "known but
  poorly-evidenced" entity.

The user's manual Phase 1 test for **AMC** (see
[`chat-entity-retrieval-rpc.md` §Test 3](../on-going/chat-entity-retrieval-rpc.md))
illustrates the concrete shape: AMC the legacy entity has 1 active
relationship, the user no longer considers it a meaningful entity, and
there is no editorial flow that demotes / merges / aliases it.

This is distinct from
[`entity-cross-type-deduplication.md`](./entity-cross-type-deduplication.md)
— that one is about *unintentional* duplicates created by the
`(name, type)` constraint. This spec is about *intentional* user
corrections that the system fails to propagate.

## Goals

- A reviewer correction creates an **explicit link** between the
  legacy entity and the corrected entity (alias, canonical pointer, or
  both), so chat retrieval cannot continue to surface the legacy row
  as a peer.
- The legacy entity is either:
  (a) merged into the corrected one (mentions / relationships /
  aliases repointed, row demoted via `canonical_entity_id`), or
  (b) explicitly retained as an alias and hidden from canonical
  lookups.
- A reviewer can see, on the entity detail / governance page, the
  correction history (what was renamed, by whom, when, and which rows
  moved).

## Non-goals

- Automatic LLM-driven correction (this is a human-in-the-loop flow).
- Bulk historical de-correction across the entire DB (one-shot
  cleanup belongs to a separate migration).
- Cross-project corrections (project-scoped only).

## Approach

1. **Reviewer-facing API** — extend the entity-edit action(s) to
   accept a `replace_with_entity_id` argument (or a "create new + move
   evidence" flow). Today the rename path appears to write a new
   `entities` row without repointing the old one.
2. **Server-side merge** — repoint `entity_mentions`,
   `entity_relationships`, `entity_aliases`, `validated_positions`,
   `interviews.interviewee_entity_id` /
   `interviewee_org_entity_id`, and `interview_review_entities` from
   the legacy entity to the corrected one. Mark the legacy row as
   `canonical_entity_id = corrected_id` (or hard-delete if zero
   coverage and no aliases pointed at it).
3. **Audit trail** — append a row to a new `entity_correction_log`
   table (or extend `audit_log`) capturing `{old_id, new_id,
   reason, reviewer_id, applied_at, moved_counts}`.
4. **Admin governance UI** — the existing entity-governance dashboard
   gets a "merge into…" affordance gated by reviewer role, with a
   confirmation modal that shows the moved-counts dry-run.

## Dependencies & related docs

- Refactor plan: [`database-refactor-plan.md`](../../roadmaps/database-refactor-plan.md)
  — relevant to Phase 2.x source/entity quality work, not a blocker.
- Phase 1 verification: [`chat-entity-retrieval-rpc.md`](../on-going/chat-entity-retrieval-rpc.md)
  §Test 3 — origin of this spec.
- Existing governance surface:
  [`done/admin-entity-governance-dashboard.md`](../done/admin-entity-governance-dashboard.md).

## Risks & open questions

- **Risk**: relationship-merge can violate
  `UNIQUE(source_entity_id, target_entity_id, relation_type,
  interview_id)` if both endpoints already exist. Need
  `ON CONFLICT DO NOTHING` + merge of editorial state (`review_status`
  precedence).
- Open question: do we surface "this entity was a legacy name for
  X" inline in the Network Explorer, or hide it entirely?
- Open question: is the legacy `entity_mentions.context` worth
  preserving as evidence after a correction? Probably yes — it still
  describes a real chunk in a real interview.

## Acceptance / how to validate

- Pick the legacy `AMC` entity (`9eedf8a5-…`) and merge it into the
  user's corrected entity via the new flow.
- After merge, `entity_intel(legacyAmcId, projectId)` returns 0 rows;
  `entity_intel(correctedId, projectId)` returns the union it had
  before plus the previously-AMC rows.
- The chat answers a question about the corrected entity using
  evidence that previously sat under the legacy name.
- Re-running `scripts/audit/database-baseline.ts` shows §12.10b drops
  by exactly one cluster (assuming no other corrections) and §12.10
  stays at 0.

## Implementation log

- 2026-05-06 — Spec drafted from Phase 1 manual-chat-test findings.
