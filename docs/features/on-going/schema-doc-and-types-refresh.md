---
title: "Phase 2.6 — Schema doc + TypeScript types refresh"
status: on-going
owner: agent
priority: medium
last_updated: 2026-05-08
related_plan: docs/roadmaps/database-refactor-plan.md
related_features:
  - docs/features/done/source-rename-and-backcompat-views.md
  - docs/features/done/source-entities-table-and-backfill.md
  - docs/features/done/source-entities-pipeline-writes.md
  - docs/features/done/entity-intel-rpc-source-entities.md
  - docs/features/done/entities-unique-constraint-swap.md
---

# Phase 2.6 — Schema doc + TypeScript types refresh

## Problem

`docs/infrastructure/database-schema.md` has accumulated significant drift since
it was last fully updated (audit §3.5 catalogued this explicitly). It still
describes the old `interviews` / `interview_chunks` shape, omits six tables, lists
fewer enums than exist, has a migration history that stops at `00025`, and uses the
global `UNIQUE(name, type)` framing that Phase 2.5 just removed.

`src/types/database.ts` is largely current but has two stale spots:
- `Views: Record<string, never>` — ignores the back-compat `interviews` and
  `interview_chunks` views created in Phase 2.1.
- `entity_intel` function return type — still uses the pre-Phase-2.4 `role` and
  `kind` unions.

## Goals

1. Rewrite `docs/infrastructure/database-schema.md` to reflect the schema as it
   stands after Phase 2.5: canonical table names (`sources`, `source_chunks`),
   all 18 tables, all enums, all RPCs, migration history through `00031`.
2. Update `src/types/database.ts`:
   - `Views` section — document `interviews` and `interview_chunks` back-compat views.
   - `entity_intel` return type — extend `role` with all `SourceEntityLinkType`
     values; extend `kind` with `"source_entity"`.
3. No schema changes, no new migrations, no pipeline changes.

## Scope

### In scope
- `docs/infrastructure/database-schema.md` — full rewrite
- `src/types/database.ts` — `Views` section + `entity_intel` return type

### Not in scope
- Any new migrations
- Any behavioral changes to queries or pipelines
- `docs/audits/database-retrieval-architecture-audit.md` (archive; not updated)

## Acceptance criteria

- [x] Schema doc opening paragraph states the correct table count (18) and
      migration range (`00001`–`00031`).
- [x] Schema doc documents `sources` as the canonical table; `interviews` noted as
      a back-compat view for one release.
- [x] Schema doc includes `source_chunks`, `source_entities`, `validated_positions`,
      `chat_conversations`, `chat_messages`, `chat_conversation_seq`.
- [x] Schema doc enums table is complete (16 enums, including `source_entity_link_type`,
      `source_entity_origin`, v2 `relation_type` values).
- [x] Schema doc migration history covers `00001`–`00031`.
- [x] Schema doc `entities` section documents `entities_name_type_scope_unique` index.
- [x] `database.ts` `Views` section documents `interviews` and `interview_chunks`
      as back-compat views.
- [x] `database.ts` `entity_intel` return type reflects Phase 2.4 role/kind expansion.
- [x] `npx tsc --noEmit` clean.

## Implementation log

### 2026-05-08

- Rewrote `docs/infrastructure/database-schema.md` from scratch — now covers all 18
  tables, 2 back-compat views, 16 enums, 6 RPCs, migration history `00001`–`00031`.
- `database.ts` `Views: Record<string, never>` replaced with typed `interviews` and
  `interview_chunks` view entries (read-only, no Insert/Update).
- `database.ts` `entity_intel` return type: `role` expanded from 4 values to all
  `SourceEntityLinkType` values + `"mention"` + `"related_via_relationship"`;
  `kind` expanded to include `"source_entity"`.
- `npx tsc --noEmit` clean.
