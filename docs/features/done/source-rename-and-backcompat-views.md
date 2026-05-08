---
title: "Source-first rename: interviews → sources, interview_chunks → source_chunks (Phase 2.1 / PR 2.1)"
status: done
owner: team
priority: high
last_updated: 2026-05-08
related_architecture:
  - docs/architecture/ingestion-pipeline.md
  - docs/architecture/agentic-rag.md
related_infrastructure:
  - docs/infrastructure/database-schema.md
related_audits:
  - docs/audits/database-retrieval-architecture-audit.md
related_roadmap:
  - docs/roadmaps/database-refactor-plan.md
---

# Source-first rename: `interviews` → `sources` (Phase 2.1 / PR 2.1)

## Problem

The audit's P1 ("no canonical source abstraction") and P3
("source-first") root causes both stem from one fact: the canonical
`interviews` table is the entry point for *every* kind of source in
the product — audio interviews, PDF documents, pasted text — and is
about to absorb CRM, email, and meeting kinds in later phases. Every
new feature that wants a generic column on the source has to either
(a) add it to a table called `interviews`, which is wrong on its
face, or (b) build a new sibling table that fragments the source
graph. Phase 2.1 takes the smallest structural step that fixes this:
**rename the canonical table to `sources` (with `source_chunks`)** and
keep the old names available as **read-only back-compat views** for
one release so existing readers continue to work while we incrementally
update them.

This is the structural prerequisite for Phase 2.2 (`source_entities`)
and Phase 2.4 (RPC reads `source_entities`). It is **rename-only** —
no column moves, no behavior change, no schema-shape change for the
data.

## Goals

- Canonical names are correct: `sources`, `source_chunks`,
  `source_chunks.source_id`. No semantic change.
- The two `SECURITY DEFINER` helpers and the RLS policies that read
  these tables stop having "interview" in their names; bodies updated
  to read the new names.
- Every existing read of `from('interviews')` /
  `from('interview_chunks')` keeps working through back-compat views
  for one release. Every existing **write** is updated in this PR
  (Postgres views are read-only).
- TS types in [`src/types/database.ts`](../../../src/types/database.ts)
  expose `sources` / `source_chunks` and keep `interviews` /
  `interview_chunks` as type aliases for one release.
- `entity_intel` (Phase 1) keeps working unchanged — its body joins
  `interviews` and `interview_chunks` and will resolve those names
  through the back-compat views without touching the function.
- Re-runnable validation: dry-run via
  [`scripts/db/migration-dry-run.ts`](../../../scripts/db/migration-dry-run.ts)
  applies and rolls back cleanly; baseline audit re-run shows zero
  regressions.

## Non-goals

- Renaming `entity_mentions.interview_id` /
  `entity_relationships.interview_id` (deferred — not blocking, and
  riskier than the table rename).
- Renaming `hybrid_search`'s return column `interview_id` (kept this
  release; revisit when chat reads `source_id` natively).
- Splitting interview-only columns (`interviewee_name`,
  `audio_url`, `speaker_map`, …) into a `source_interviews`
  extension table. Plan §4 explicitly defers this to Phase 5+.
- Updating the schema doc + types thoroughly — that is **PR 2.6**.
  This PR ships the minimum types changes needed for compilation.
- Rewriting purely-read call sites that don't already need a touch
  in this PR. Reads can ride the back-compat views; the cleanup PR
  is in scope for the same release window but not this PR.

## Approach

### A. Migration `supabase/migrations/00027_rename_interviews_to_sources.sql`

1. **Pre-flight assertions** (do nothing if the rename has already
   landed) — wrap the body in `DO $$ ... IF EXISTS (SELECT 1 FROM
   pg_class WHERE relname = 'interviews' AND relkind = 'r') THEN
   ... END IF; $$;` so re-running on a partially-migrated DB is a
   no-op.
2. **Rename tables and column:**
   - `ALTER TABLE interviews RENAME TO sources;`
   - `ALTER TABLE interview_chunks RENAME TO source_chunks;`
   - `ALTER TABLE source_chunks RENAME COLUMN interview_id TO
     source_id;`
   - Postgres rewrites every FK constraint that references
     `interviews(id)` automatically; no FK changes needed in the
     migration.
3. **Rename indexes** (cosmetic but kept honest):
   `idx_interviews_status` → `idx_sources_status`,
   `idx_interviews_project` → `idx_sources_project`,
   `idx_interviews_interviewee_entity_id` →
   `idx_sources_interviewee_entity_id`,
   `idx_interviews_interviewee_org_entity_id` →
   `idx_sources_interviewee_org_entity_id`,
   `idx_chunks_embedding` → `idx_source_chunks_embedding`,
   `idx_chunks_interview` → `idx_source_chunks_source`,
   `idx_chunks_metadata` → `idx_source_chunks_metadata`,
   plus any others surfaced by `pg_indexes` introspection at
   migration-write time.
4. **Rename + rewrite SECURITY DEFINER helpers:**
   - `get_interview_project(p_interview_id UUID)` →
     `get_source_project(p_source_id UUID)`. Body reads from
     `sources`. Old function dropped; **callers updated in the same
     PR** (used only by RLS policies, not by app code — see grep
     evidence below).
   - `clear_interview_derived_data(p_interview_id UUID)` →
     `clear_source_derived_data(p_source_id UUID)`. Body deletes
     from `entity_relationships`, `entity_mentions`, `source_chunks`,
     `content_snippets` by `source_id` / `interview_id`. (Note:
     `entity_mentions.interview_id` and
     `entity_relationships.interview_id` columns retain their old
     names this release.) **Callers updated in the same PR** — only
     2 sites (see below).
   - Old function names dropped (no thin wrappers — call sites are
     small and explicit).
5. **Re-create RLS policies** that referenced the old helper:
   `interview_chunks` (now `source_chunks`) policies in `00002` /
   `00013` use `is_project_member(get_interview_project(interview_id))`.
   Drop and re-create them with `is_project_member(get_source_project(source_id))`.
   Policy names that include "interviews" / "chunks" are renamed to
   "sources" / "source chunks" for hygiene.
6. **Re-create `hybrid_search`** with the body rewritten to read
   `source_chunks` and `source_id` internally; **return shape kept
   identical** (`chunk_id`, `interview_id`, …) so no chat code change
   is required this PR. A future PR will rename the return column.
7. **`entity_intel` (00026)** — left untouched. Its body joins
   `interviews i ON i.id = em.interview_id` and `LEFT JOIN
   interview_chunks c ON c.id = em.chunk_id`. With the back-compat
   views in place these names resolve to the renamed tables and the
   function continues to work. Plan §4 PR 2.4 will rewrite the body
   to read `source_entities` directly.
8. **Create back-compat views:**
   ```sql
   CREATE VIEW public.interviews AS SELECT * FROM public.sources;

   CREATE VIEW public.interview_chunks AS
     SELECT
       id,
       source_id AS interview_id,
       source_id,                         -- for forward-compat
       chunk_index, content, speaker,
       start_time, end_time, embedding,
       metadata, created_at
     FROM public.source_chunks;
   ```
   Views are read-only by Postgres default; this is intentional.
   Writes go to the underlying tables only.
9. **Grants** — `GRANT SELECT ON public.interviews, public.interview_chunks
   TO authenticated, service_role;` so RLS-enabled `authenticated`
   queries through the views still work. Underlying RLS on the
   real tables is enforced because the views run with invoker
   privileges by default.

### B. App-code rewrites (writes only)

The grep evidence below shows **only writes** must move in this PR;
reads can stay on the view names for one release.

**Files with writes that must move to `sources` / `source_chunks`:**

| File | Operation | Line(s) |
|---|---|---|
| `src/lib/ai/pipeline.ts` | `update interviews status/extra` | 59–62 |
| `src/lib/ai/pipeline.ts` | `insert interview_chunks` (batched) | 491–492 |
| `src/lib/ai/pipeline.ts` | `update interview_chunks metadata` (per-chunk backfill) | 615–619 |
| `src/lib/ai/pipeline.ts` | `update interviews status=EXTRACTING / FAILED` (reprocess) | 868–910 |
| `src/lib/ai/pipeline.ts` | `rpc clear_interview_derived_data` → `clear_source_derived_data` | 450 |
| `src/lib/ai/document-pipeline.ts` | similar shape (TBD — re-grep at implementation time) | TBD |
| `src/app/api/interviews/route.ts` | `insert interviews` (initial upload row) | TBD |
| `src/app/api/interviews/from-pdf/route.ts` | `insert interviews` | TBD |
| `src/app/api/interviews/from-text/route.ts` | `insert interviews` | TBD |
| `src/app/api/interviews/[id]/route.ts` | `update interviews` (rename / metadata edits) | TBD |
| `src/app/api/interviews/[id]/poll/route.ts` | possible `update interviews` (status mutation) | TBD |
| `src/app/api/interviews/[id]/reprocess-review/route.ts` | mutates `interviews.transcript_review_status` | TBD |
| `src/app/api/interviews/backfill-duration/route.ts` | `update interviews` | TBD |
| `src/app/api/interviews/[id]/backfill-mentions/route.ts` | possibly | TBD |
| `src/app/actions/interview-review.ts` | `update interviews` | TBD |
| `src/app/actions/interview-title.ts` | `update interviews` | TBD |
| `src/app/actions/interview-speakers.ts` | `update interviews` | TBD |
| `src/app/api/webhooks/transcription/route.ts` | `update interviews` | TBD |

> Each `TBD` entry above will be confirmed with a precise line-level
> grep at implementation time. The list is the union of files that
> showed up in the broad `from('interviews')` / `from('interview_chunks')`
> grep (32 distinct files) intersected with files that perform any
> mutating Supabase call. If a file only **reads** from the view, it
> stays on the old name.

**RPC call rename:**

- `src/lib/ai/pipeline.ts:450` —
  `supabase.rpc("clear_interview_derived_data", ...)` →
  `supabase.rpc("clear_source_derived_data", ...)`.
- `src/__tests__/pipeline-smoke.test.ts:256` — assertion that the
  pipeline calls the RPC. Updated to the new name.

### C. Types refresh (`src/types/database.ts`)

- Add `Database["public"]["Tables"]["sources"]` (Row /
  Insert / Update). Structurally identical to today's
  `interviews`. Add `Database["public"]["Tables"]["source_chunks"]`
  same way (with `source_id` instead of `interview_id`).
- Keep `Database["public"]["Tables"]["interviews"]` and
  `["interview_chunks"]` as **type aliases** of the new types, so
  existing reader code continues to type-check. Add a JSDoc
  `@deprecated` note on the alias.
- Add `clear_source_derived_data` to
  `Database["public"]["Functions"]`. Remove
  `clear_interview_derived_data` (no thin wrapper this release).
- `get_source_project` is RLS-only; not strictly required in the
  TS types (we never call it from app code), but added for
  completeness.

### D. Validation

1. **Static**: `npx tsc --noEmit` (every read still type-checks via
   the alias; every write moves to the new name).
2. **Unit / integration**: `npm test` — must stay green. The
   pipeline-smoke test will be the most informative regression
   surface.
3. **Migration dry-run**:
   `tsx scripts/db/migration-dry-run.ts supabase/migrations/00027_rename_interviews_to_sources.sql`.
   Probe SQL: confirm `sources` exists as a base relation, `interviews`
   as a view, `source_chunks.source_id` exists, `entity_intel` returns
   the same row counts as before (run `entity_intel(angola_id, NULL)`
   pre- and post-apply within the same transaction).
4. **Smoke pages** (manual, post-push): dashboard, interview list,
   interview detail (audio + document), interview review, reports
   list, reports detail, network explorer, chat. Each one exercises a
   subset of `from('interviews')` reads.
5. **Audit cadence row**: re-run
   `tsx scripts/audit/database-baseline.ts` and append a row to
   [`database-retrieval-refactor-baseline.md`](../on-going/database-retrieval-refactor-baseline.md).
   §12.1 / §12.2 should be unchanged; §12.3 should be unchanged unless
   another reprocess landed in between.

### E. Rollback

- Revert the app commits (single PR, easy revert).
- Migration rollback (only needed if `00027` is pushed but the app
  rollback isn't enough):
  ```sql
  DROP VIEW IF EXISTS public.interview_chunks;
  DROP VIEW IF EXISTS public.interviews;
  ALTER TABLE public.source_chunks RENAME COLUMN source_id TO interview_id;
  ALTER TABLE public.source_chunks RENAME TO interview_chunks;
  ALTER TABLE public.sources RENAME TO interviews;
  -- rename helpers + policies back, recreate clear_interview_derived_data
  ```
  Captured as a sibling SQL file `00027_rollback.sql` (kept
  outside `supabase/migrations/` so the CLI doesn't apply it).

## Dependencies & related docs

- Plan: [`database-refactor-plan.md`](../../roadmaps/database-refactor-plan.md)
  §4 (this is PR 2.1).
- Phase 1 spec: [`done/chat-entity-retrieval-rpc.md`](../done/chat-entity-retrieval-rpc.md)
  — `entity_intel` is the only function whose body explicitly relies
  on the back-compat views; explicitly noted in its body comment.
- Audit: [`database-retrieval-architecture-audit.md`](../../audits/database-retrieval-architecture-audit.md)
  §1 / §3.5 — this PR doesn't fix the doc-drift but Phase 2.6 will.

## Risks & open questions

- **Risk: writes through views fail silently** if a call site is
  missed. Mitigation: `npx tsc --noEmit` will not catch this (the
  view exposes the same column shape). The pipeline-smoke test does
  run a full ingest; a successful run is a strong signal. The manual
  smoke checklist exists for this reason.
- **Risk: RLS policy `USING` clause column references break** when
  policies are dropped + re-created. Mitigation: re-create them in
  the same migration; the `00027` migration must be exhaustive — no
  policy left referencing the old helper.
- **Open question: do we keep `clear_interview_derived_data` as a
  thin SQL wrapper that calls `clear_source_derived_data`?** Today
  there are exactly **2 callers** in the codebase (pipeline.ts and
  one test). Recommend: drop the old name in this PR; saves a follow-
  up cleanup.
- **Open question: do we rename indexes?** Cosmetic, but cheap. The
  migration includes them by default. Skip if the rename causes
  trouble during dry-run.
- **Open question: do we rename the `entity_mentions.interview_id` /
  `entity_relationships.interview_id` columns in this PR?** Plan §4
  is silent. Recommend: defer. Renaming these columns ripples through
  every query and every type. Phase 2.4 (RPC reads `source_entities`)
  is the natural moment to revisit.
- **Open question: read-side rewrites in this PR?** Plan §4 says
  "future generic columns get added to `sources`, not to a table
  called `interviews`" — but reads riding the view in this PR is
  fine because no new generic columns ship in 2.1. Recommend: in
  this PR, rewrite reads only in files we already had to touch for
  writes (i.e. `pipeline.ts`, the API routes, the actions). Pure-read
  pages (`(dashboard)/interviews/[id]/page.tsx`, etc.) can move in a
  cleanup PR before Phase 2.4.

## Acceptance / how to validate

- [x] `00027_rename_interviews_to_sources.sql` applies cleanly via
      `tsx scripts/db/migration-dry-run.ts ...` (probe asserts
      `sources` is a base table, `interviews` is a view,
      `source_chunks.source_id` exists, `entity_intel` returns the
      same row counts pre- and post-apply).
- [x] `npm test` stays green (15 files / 125 tests as of Phase 1, plus
      the test-name update in `pipeline-smoke.test.ts`).
- [x] `npx tsc --noEmit` is clean.
- [ ] Smoke checklist (manual): dashboard, interview list / detail
      (audio + document), interview review, reports, network
      explorer, chat. Each loads without error.
- [x] No call to `clear_interview_derived_data` left in `src/`
      (`rg -n 'clear_interview_derived_data' src` returns empty).
- [x] No RLS policy references `get_interview_project` after the
      migration (`pg_policies` probe returns 0 old-helper references
      and 8 `get_source_project` references).
- [x] Baseline audit cadence row appended.

## Implementation log

- 2026-05-06 — Spec drafted from Plan §4 PR 2.1 + concrete grep of
  the call-site graph (32 files reference `from('interviews')` or
  `from('interview_chunks')`; ~6 of them perform writes and must
  move in this PR; the rest can ride the back-compat views).
- 2026-05-06 — Human decisions locked: drop old helper function names
  in the same PR; keep `hybrid_search` return shape (`interview_id`)
  for one release; leave read-only callers on the back-compat views;
  defer `entity_mentions.interview_id` /
  `entity_relationships.interview_id` column renames.
- 2026-05-06 — Migration `00027_rename_interviews_to_sources.sql`
  written and transactionally dry-run against the remote DB with
  explicit `lock_timeout = '5s'` and `statement_timeout = '60s'`.
  First dry-run failed cleanly and rolled back due to dependency
  ordering (`2BP01`: old `get_interview_project(uuid)` still had 8
  RLS-policy dependents). Fixed by moving old-function drops to the
  end of the migration after RLS policies are re-created on
  `get_source_project`. Second dry-run applied + probed + rolled back
  cleanly.
- 2026-05-06 — App write paths updated to write `sources` /
  `source_chunks` and call `clear_source_derived_data`; read paths
  remain on `interviews` / `interview_chunks` views for one release.
  Validation before remote push: `npx tsc --noEmit` clean; `npm test`
  green (15 files / 125 tests; first sandbox run hit Vitest
  `kill EACCES`, rerun outside sandbox passed).
- 2026-05-06 — Applied `00027` to remote via
  `npx supabase db push --db-url ...` after the CLI dry-run showed
  only `00027_rename_interviews_to_sources.sql` pending. Post-push
  probe confirmed: `sources` / `source_chunks` are base tables,
  `interviews` / `interview_chunks` are views, old helper names are
  dropped, new helper names exist, 8 RLS policies use
  `get_source_project`, and `entity_intel` still returns rows via the
  back-compat view path. Baseline audit re-run and cadence row
  appended.
