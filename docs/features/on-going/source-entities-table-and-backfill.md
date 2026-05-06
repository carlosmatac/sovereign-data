---
title: "source_entities table + anchor backfill (Phase 2.2 / PR 2.2)"
status: on-going
owner: team
priority: high
last_updated: 2026-05-06
related_architecture:
  - docs/architecture/ingestion-pipeline.md
related_infrastructure:
  - docs/infrastructure/database-schema.md
related_audits:
  - docs/audits/database-retrieval-architecture-audit.md
related_roadmap:
  - docs/roadmaps/database-refactor-plan.md
related_features:
  - docs/features/on-going/source-rename-and-backcompat-views.md   # Phase 2.1 (predecessor)
---

# `source_entities` table + anchor backfill (Phase 2.2 / PR 2.2)

## Problem

Today there is **no source-level association layer**. The only edges
between a `sources` row and an `entities` row are:

1. `sources.interviewee_entity_id` (single FK, single role)
2. `sources.interviewee_org_entity_id` (single FK, single role)
3. `entity_mentions(entity_id, source_id, chunk_id)` — chunk-level only,
   and the post-April-2026 persistence gate intentionally drops anchor /
   fuzzy mentions, so an interviewee can have **zero** rows here for
   the very source where they are the interviewee.

Consequences (from the audit and from Phase 1 manual chat tests):

- The chat answer for "who was interviewed about X" is structurally
  unreliable, because `lookupMentions` reads `entity_mentions` and the
  gate hides anchors there.
- Anchor entity rows in `entities` end up with zero mentions and zero
  edges — pure orphan-graph creation.
- There is nowhere to record "this person is the *author* of this
  document", "this organization is the *primary subject* of this
  source", "this entity was tagged here by a human reviewer", "this
  entity was imported from a CRM record".
- Provenance (anchor vs extraction vs human tag vs CRM import) is not
  representable, so the UI cannot weight trust differently and we
  cannot audit how an association was learned.

Phase 1 (PR 1.1) shipped `entity_intel` as a UNION over `entity_mentions`
+ the two anchor FK columns + active relationships. That patched the
visible chat fix without committing to a model. Phase 2.2 is the
**structural** fix: introduce the source-level association layer the
audit's clarification §3.4 mandates.

## Goals

- Create `source_entities` — the canonical, source-level association
  table for every `(source, entity)` link the product cares about.
- Encode **what the link is** (`link_type`) and **how the link was
  learned** (`origin`) as enums, so retrieval, the UI, and governance
  can reason about trust.
- Allow **multiple provenance rows** for the same logical association
  (`UNIQUE(source_id, entity_id, link_type, origin)`): an anchor row
  and an extraction row for the same person on the same source are both
  intended and useful.
- One-shot, idempotent **backfill** of existing anchor data from
  `sources.interviewee_entity_id` and `sources.interviewee_org_entity_id`
  so the table is non-empty for projects that have used the upload form.
- Standard RLS via the existing `is_project_member` /
  `is_project_editor` helpers — no new tenancy machinery (Phase 3a's
  job).

## Non-goals (this PR)

- **No application code writes `source_entities` yet.** Pipeline +
  document-pipeline + reviewed reprocess writes are PR 2.3.
- **`entity_intel` is not rewritten** to read this table yet. That is
  PR 2.4. Until then, the chat continues to read the anchor FK columns
  on `sources` and the back-compat view `interviews` (which still
  exposes those columns).
- **No removal of `sources.interviewee_entity_id` /
  `interviewee_org_entity_id`.** Those columns remain authoritative for
  one full release window; the back-compat `interviews` view continues
  to expose them. Removal is scheduled for Phase 5+.
- **CRM-import, manual-tag, AI-inference, prior-context origins** are
  **defined in the enum** but **no caller writes them in this PR**
  (their write paths live in Phase 5+).
- **No UI changes.** Interview Detail's optional "associated entities"
  section is queued for a follow-up tied to PR 2.3/2.4.

## Approach

### Migration `00028_source_entities_table.sql`

Single migration, ordered to be safe against rerun (every step is
guarded with `IF NOT EXISTS` / `ON CONFLICT DO NOTHING` so a retry
after a partial failure remains valid):

1. **Create enum `source_entity_link_type`** — what the link *is*:
   `interviewee, interviewee_org, interviewer, translator, participant,
   author, primary_subject, subject_organization, account, source_owner,
   mentioned_at_source_level, related_entity`.
2. **Create enum `source_entity_origin`** — *how* the link was learned:
   `upload_anchor, metadata_import, extraction, crm_import, manual_tag,
   ai_inference, human_review, alias_propagation, prior_context`.
3. **Create table `public.source_entities`** with columns:
    - `id            uuid PRIMARY KEY DEFAULT gen_random_uuid()`
    - `source_id     uuid NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE`
    - `entity_id     uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE`
    - `link_type     source_entity_link_type NOT NULL`
    - `origin        source_entity_origin NOT NULL`
    - `is_primary    boolean NOT NULL DEFAULT false`
    - `speaker_label text NULL`
    - `source_metadata jsonb NULL`
    - `evidence      jsonb NULL`
    - `confidence    real NULL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))`
    - `created_by    uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL`
    - `created_at    timestamptz NOT NULL DEFAULT now()`
    - `updated_at    timestamptz NOT NULL DEFAULT now()`
    - `CONSTRAINT source_entities_quad_uniq UNIQUE (source_id, entity_id, link_type, origin)`
4. **Indexes** (everything beyond the PK + the unique constraint
   index): `(entity_id)`, `(source_id, link_type)`, `(source_id, origin)`.
5. **`update_source_entities_updated_at` trigger** wired to the
   shared `update_updated_at()` function defined in `00001`.
6. **Enable RLS** on `source_entities`. Policies (mirroring
   `interview_review_entities` from `00013`, repointed at
   `get_source_project`):
    - SELECT: `is_project_member(get_source_project(source_id))`
    - INSERT: `auth.uid() IS NOT NULL AND is_project_editor(get_source_project(source_id))`
    - UPDATE: `is_project_editor(get_source_project(source_id))`
    - DELETE: `is_project_editor(get_source_project(source_id))`
   Service-role / admin client keeps RLS bypass per `HANDOVER.md`.
7. **Backfill** (idempotent — `ON CONFLICT (source_id, entity_id, link_type, origin) DO NOTHING`):
    - One row per non-NULL `sources.interviewee_entity_id`
      → `(link_type = 'interviewee', origin = 'upload_anchor', is_primary = true, confidence = NULL)`.
    - One row per non-NULL `sources.interviewee_org_entity_id`
      → `(link_type = 'interviewee_org', origin = 'upload_anchor', is_primary = false, confidence = NULL)`.

### Backfill assertion

The migration ends with two `DO $$ ... RAISE NOTICE` blocks emitting
the row-count delta so the dry-run probe and the post-push verification
can assert: `count(source_entities WHERE link_type = 'interviewee'  AND origin = 'upload_anchor')` =
`count(sources WHERE interviewee_entity_id IS NOT NULL)`, and the
mirror for `interviewee_org`. On the current DB both source-side
counts are **0**, so both rules collapse to `0 = 0` (vacuously true)
— still a useful invariant the moment any anchor is written.

### Application-side changes

**None for PR 2.2.** Existing readers and writers do not touch
`source_entities`. PR 2.3 introduces ingestion-side writes; PR 2.4
introduces RPC-side reads.

For type-system hygiene only, this PR adds:

- `Database["public"]["Tables"]["source_entities"]`: `Row`, `Insert`,
  `Update`.
- The two enums under `Database["public"]["Enums"]`
  (`source_entity_link_type`, `source_entity_origin`).
- Convenience aliases `SourceEntity`, `SourceEntityLinkType`,
  `SourceEntityOrigin`.

This keeps the `src/types/database.ts` ↔ remote schema invariant we
re-established in Phase 2.1.

### Validation

Run order:

1. `npx tsx scripts/db/migration-dry-run.ts supabase/migrations/00028_source_entities_table.sql --lock-timeout 5s --statement-timeout 60s` with a probe checking:
    - Table exists with the expected columns.
    - Both enums exist and contain every documented value.
    - The unique constraint exists.
    - The 3 secondary indexes exist.
    - The 4 RLS policies exist.
    - Backfill row counts match the source-of-truth: the count of
      `(link_type='interviewee', origin='upload_anchor')` rows equals
      the count of `sources` rows with non-NULL `interviewee_entity_id`,
      and likewise for `interviewee_org`.
    - Re-running the backfill block within the dry-run produces zero
      additional rows (idempotency).
   The whole transaction rolls back at the end of the probe.
2. STOP. Report counts to the user. Wait for go-ahead before push.
3. `npx supabase db push --db-url <DATABASE_URL_DIRECT> --include-all`.
4. Re-run the same probe queries against the live DB to confirm.
5. Re-run the baseline audit (`scripts/audit/database-baseline.ts`)
   and append a Phase 2.2 cadence row to
   `docs/features/on-going/database-retrieval-refactor-baseline.md`.
6. `npx tsc --noEmit` + `npm test` to confirm nothing app-side
   regressed (no app code reads the new table yet, so this should be a
   no-op in behaviour).

### Rollback

The migration is additive; the only existing-state mutation is the
backfill INSERT. Rollback path:

```sql
DROP TABLE public.source_entities CASCADE;
DROP TYPE  public.source_entity_origin;
DROP TYPE  public.source_entity_link_type;
```

(Plus revert TS types.) No reader depends on the new table this PR.

## Dependencies

- **Phase 2.1 (PR 2.1) shipped.** Required: this migration references
  `public.sources`, `public.get_source_project(uuid)`, and the
  `update_updated_at()` shared trigger function from `00001`.
- `is_project_member(uuid)` and `is_project_editor(uuid)` from `00002`.

## Risks

| Risk | Mitigation |
|------|------------|
| Backfill row counts drift from source-of-truth | Idempotent INSERT with explicit assertion in the dry-run probe; SQL invariant comparing both counts before push. |
| Enum value typo locks in a name we will regret | Both enums match the plan §4 PR 2.2 wording verbatim; values can be appended later via `ALTER TYPE ADD VALUE` (cannot be removed/renamed cheaply, so we double-check now). |
| Future write paths duplicate anchor rows on reprocess | The `UNIQUE(source_id, entity_id, link_type, origin)` quad makes upserts trivially safe; PR 2.3 will use `ON CONFLICT DO UPDATE`. |
| RLS policy mismatch with the rest of the schema | Patterned on `interview_review_entities` (00013) — closest analog; verified by reading the post-rename copy in `00027`. |
| `gen_random_uuid()` not available | Already enabled by `00001` (`pgcrypto`). |
| Migration partially applied | Every DDL block is guarded with `IF NOT EXISTS`; INSERT uses `ON CONFLICT DO NOTHING`. Reruns are safe. |

## Acceptance criteria

- [x] Dry-run completes cleanly inside the 60s `statement_timeout` and
  rolls back; probe confirms table, enums, unique constraint, indexes,
  policies, backfill counts, and idempotency.
- [x] `supabase db push` succeeds against the remote project.
- [x] Live probe confirms `count(source_entities)` matches the sum of
  non-NULL `sources.interviewee_entity_id` + non-NULL
  `sources.interviewee_org_entity_id` (today 0 + 0 = 0).
- [x] `src/types/database.ts` carries the new table + enums.
- [x] `npx tsc --noEmit` and `npm test` pass (125/125 tests).
- [x] Baseline audit re-run shows no §12.* count moved as a *consequence
  of this PR* (every count unchanged vs. the 2.1 cadence row).

## Implementation log

- **2026-05-06** — Spec drafted. Migration
  `supabase/migrations/00028_source_entities_table.sql` written:
  enum `source_entity_link_type` (12 values), enum
  `source_entity_origin` (9 values), table `public.source_entities`
  with quad UNIQUE `(source_id, entity_id, link_type, origin)`, three
  secondary indexes, `update_updated_at()` trigger, RLS enabled with
  4 policies (SELECT for project members, INSERT/UPDATE/DELETE for
  editors via `is_project_editor(get_source_project(source_id))`),
  idempotent backfill INSERTs from
  `sources.interviewee_entity_id` → `(interviewee, upload_anchor, is_primary=true)`
  and `sources.interviewee_org_entity_id` → `(interviewee_org, upload_anchor)`
  with `ON CONFLICT DO NOTHING`, and a final `RAISE EXCEPTION` block
  asserting the row-count invariant.

- **2026-05-06** — Transactional dry-run via
  `scripts/db/migration-dry-run.ts --lock-timeout 5s --statement-timeout 60s`
  with a pre-flight lock check on `sources, entities` (no other
  sessions). Probe confirmed: `table_exists=1`, both enum value
  arrays in declaration order, `quad_uniq_exists=1`, `index_count=5`
  (PK + quad UNIQUE + 3 secondary), `policy_count=4`,
  `expected_interviewee=0 / actual_interviewee=0`,
  `expected_interviewee_org=0 / actual_interviewee_org=0`,
  `total_rows=0`. Transaction rolled back cleanly.

- **2026-05-06** — `npx supabase db push --db-url "$DATABASE_URL_DIRECT" --include-all`
  applied 00028 successfully. Migration's `RAISE NOTICE` confirmed
  `interviewee 0/0 ; interviewee_org 0/0` on the live DB. Live read
  probe (post-push) confirmed `table_exists=1`, `index_count=5`,
  `policy_count=4`.

- **2026-05-06** — `src/types/database.ts` updated:
  `SourceEntityLinkType` and `SourceEntityOrigin` string-literal
  unions added next to `RelationshipReviewStatus` /
  `RelationshipOrigin`; `Database.public.Tables.source_entities` Row
  / Insert / Update declared with FKs to `sources(id)` and
  `entities(id)`; both enums registered in `Database.public.Enums`;
  convenience alias `SourceEntity = Tables<"source_entities">`
  added.

- **2026-05-06** — `npx tsc --noEmit` clean. `npm test` 125/125
  passing across 15 files (no regressions). Baseline audit re-run
  shows every §12.* count unchanged from the Phase 2.1 cadence row;
  Phase 2.2 cadence row appended to
  `database-retrieval-refactor-baseline.md` with two queued
  follow-up probes (§12.17 row counts grouped by `(link_type,
  origin)`, §12.18 anchors-without-source_entities) so future
  cadences can track the new table once PR 2.3 starts writing it.

## Open questions for follow-up PRs (not blockers for 2.2)

- Should `mentioned_at_source_level` be auto-written from
  `entity_mentions` (one row per `(source_id, entity_id)`) so the chat
  can show "this person appears in 12 sources" without recomputing?
  Probably yes, in PR 2.4 or a separate small follow-up.
- Reviewed-reprocess deletion semantics: PR 2.3 must decide whether
  reviewed reprocess clears `origin='extraction'` rows (yes) and
  whether it touches `origin='upload_anchor'` (no — those reflect the
  upload metadata, not the transcript).
- `confidence` for `origin='upload_anchor'` is NULL by spec; for
  `origin='extraction'` PR 2.3 will need to choose a threshold.
