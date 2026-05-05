---
title: "Database refactor — baseline diagnostics (Phase 0)"
status: to-do
owner: team
priority: high
last_updated: 2026-05-04
related_architecture:
  - docs/architecture/ingestion-pipeline.md
  - docs/architecture/agentic-rag.md
related_infrastructure:
  - docs/infrastructure/database-schema.md
related_audits:
  - docs/audits/database-retrieval-architecture-audit.md
  - docs/audits/database-retrieval-architecture-clarification.md
related_roadmap:
  - docs/roadmaps/database-refactor-plan.md
---

# Database refactor — baseline diagnostics (Phase 0 / PR 0.1)

## Problem

The [database refactor plan](../../roadmaps/database-refactor-plan.md) Phase 1+
makes structural changes (new RPCs, `sources`/`source_entities`, RLS hardening,
transactional reprocess, evidence persistence). Every later phase will claim to
"fix" specific symptoms — orphan entities, anchor-only interviewees, duplicate
canonicals, ungrounded mentions. To assert that honestly, we need numbers
captured **before** any change lands.

This Phase 0 task runs the read-only audits in
[`docs/audits/database-retrieval-architecture-audit.md`](../../audits/database-retrieval-architecture-audit.md)
§12 against the live database and records the results here.

## Goals

- Establish the baseline counts for §12.1 – §12.16 against the live DB.
- Make the audit run reproducible so we can re-run it after each subsequent
  phase per plan §9c and confirm the numbers move in the expected direction.
- Surface any audit findings that are **not** present in our data (so we can
  scope down later phases if a problem turns out to be theoretical for us).

## Non-goals

- No schema changes, no migrations, no application-code changes (other than
  the diagnostic script + its 16 SQL files, which are read-only).
- No interpretation that prejudges Phase 1+. The baseline is for comparison,
  not for design decisions.

## Approach

1. **Diagnostic script** at [`scripts/audit/database-baseline.ts`](../../../scripts/audit/database-baseline.ts)
   — loads `DATABASE_URL` from `.env.local`, opens a single `pg` client,
   runs each query in a `BEGIN READ ONLY` transaction, and emits a markdown
   table to stdout (or to a file via `--out`).
2. **Query files** in [`scripts/audit/queries/`](../../../scripts/audit/queries)
   are 1:1 copies of audit §12.1 – §12.16. The filenames carry the section
   number (`12-NN-slug.sql`) so the runner orders them deterministically.
3. **Execution** uses the Direct Postgres connection string from the Supabase
   project (Dashboard → Project Settings → Database → URI). The script forces
   `default_transaction_read_only = on` for the session.
4. **Re-run after every phase** per plan §9c: append a new "Re-run after
   Phase N" subsection to the [Results](#results) table below; the trend is
   what we care about, not the absolute numbers.

### Constraints

- Runs against the live DB — read-only is enforced both at the session level
  (`default_transaction_read_only = on`) and at the transaction level
  (`BEGIN READ ONLY`).
- No sacred patterns are touched: no admin-client mutations, no auth flow
  change, no RLS policy change.

## Technical notes

- Files added (this phase):
  - `scripts/audit/database-baseline.ts`
  - `scripts/audit/queries/12-01-anchor-only-interviewees.sql` … `12-16-validated-positions-missing.sql`
- Files modified (this phase):
  - `.env.local.example` — documents `DATABASE_URL`.
  - `package.json` — devDeps: `supabase`, `pg`, `@types/pg`, `dotenv`.
  - `supabase/config.toml`, `supabase/.gitignore`, `supabase/.temp/` —
    created by `supabase init` (Supabase CLI workflow scaffold). No migrations
    are added in this phase.
- Run:

  ```bash
  npx tsx scripts/audit/database-baseline.ts --out tmp/baseline.md
  ```

  The script writes the full report to the path you pass; the
  [Results](#results) section below is hand-filled from that report so the
  numbers are immediately readable in the spec.

## Dependencies & related docs

- Audit (read-only): [`docs/audits/database-retrieval-architecture-audit.md`](../../audits/database-retrieval-architecture-audit.md)
- Clarification: [`docs/audits/database-retrieval-architecture-clarification.md`](../../audits/database-retrieval-architecture-clarification.md)
- Plan (this is phase 0 of): [`docs/roadmaps/database-refactor-plan.md`](../../roadmaps/database-refactor-plan.md)
- Schema doc (out of date — gets refreshed in Phase 2.6): [`docs/infrastructure/database-schema.md`](../../infrastructure/database-schema.md)

## Risks & open questions

- **Schema-doc drift** (audit P7): the audit notes the schema doc claims "12
  tables, 15 migrations" while the repo has 25+ migrations. The audit run may
  hit columns or tables the doc does not describe; that's expected. We do
  **not** fix the doc here — Phase 2.6 owns it.
- **One customer / small dataset:** counts will be small. The plan
  acknowledges this; the value of Phase 0 is the trend over time, not the
  absolute numbers.

## Acceptance / how to validate

- [x] `npx tsx scripts/audit/database-baseline.ts` connects, runs all 16
      queries, and exits with code 0. _(2026-05-05 — confirmed against
      live DB via `DATABASE_URL_DIRECT`.)_
- [x] All 16 rows in the [Results](#results) summary table are filled
      in (numbers, not `_pending_`).
- [x] The "Re-run cadence" sub-section is left in place with empty rows
      for Phases 1, 2, 3a, 3b, 4a, 4b so we can append after each phase
      ships.
- [x] No code other than the diagnostic script + its SQL files is
      touched.

## Results

> Live-DB run from [`scripts/audit/database-baseline.ts`](../../../scripts/audit/database-baseline.ts).
> Counts are row counts returned by each §12.NN query. **`0` is the goal**
> for most rows — every non-zero entry is real schema/data debt that one of
> the later refactor phases should reduce.

### Phase 0 baseline (initial run — 2026-05-05)

| # | Description | Row count | Notes |
| --- | --- | ---: | --- |
| §12.1  | Anchor-only interviewees (the known-symptom probe) | **0** | Symptom does not currently exhibit on this dataset; every `interviewee_entity_id` on a `COMPLETED` interview also has at least one `entity_mention`. **Phase 1 becomes preventive, not reactive.** Structural cause (gate drops `anchor_context` / `fuzzy`) still exists; we just have not stepped on it. |
| §12.2  | Anchor-only orgs | **0** | Same as §12.1 — preventive. |
| §12.3  | Entities without any mentions (orphans) | **18** | The audit's expected debt (P5 / §5.3). Created by `matchOrCreateEntity` for anchors that the persistence gate later dropped. Targeted by Phase 2.3 (stop creating orphan anchor entities) and indirectly by Phase 2.2 (`source_entities` removes the gate's role in remembering anchors). |
| §12.4  | Mentions without source links (legacy pre-gate rows) | **0** | Pre-gate cleanup already complete; nothing to backfill. |
| §12.5  | Relationships whose endpoint entity is missing | **0** | FKs working as expected. |
| §12.6  | Relationships with no evidence quote | **0** | All relationships carry `evidence_text`. Phase 4a / S1 (`evidence_chunk_id`) is still desirable but not blocked. |
| §12.7  | Chunks with no embedding | **0** | Healthy. |
| §12.8  | Interviews stuck mid-pipeline | **0** | No zombie pipeline rows. |
| §12.9  | Reviewed interviews left without derived data | **0** | The non-transactional reprocess window has not actually corrupted any interview yet. Phase 3b stays as a hardening fix, not a recovery fix. |
| §12.10 | Duplicate canonical entities (same `normalized_name + type`) | **0** | **Phase 2.5 pre-flight clean** — drop-and-add of the unique constraint will not surface destructive collisions. |
| §12.11 | Aliases pointing to non-canonical entities | **0** | Healthy. |
| §12.12 | Project-scope vs global collisions on the same name | **0** | **Phase 2.5 pre-flight clean** — no project/global pair to remediate before swapping the unique index. |
| §12.13 | Reviewed transcripts (`last_intel_source = 'human_review'`) | **1** | Read carefully: this query lists every reviewed interview, not broken ones. The single row has `last_chunk_at: 2026-05-01` and `reviewed_count: 64`, i.e. chunks rebuilt successfully — healthy. The audit-doc title for this query ("…that did NOT update chunks/embeddings") is misleading; the SQL is a simple list. |
| §12.14 | Cycle detection in canonical chain | **0** | No cycles. |
| §12.15 | `interviewee_entity_id` pointing at a non-PERSON entity | **0** | Anchor hygiene clean. |
| §12.16 | Validated positions referencing missing entities | **0** | Healthy. |

**Headline interpretation:**

- **One real piece of debt:** §12.3 = 18 orphan entities. This is exactly the "anchor entities created without ever having a persisted mention" pattern the audit predicted (P5 / §5.3). It is what Phase 2.3 targets. We expect this number to drop after Phase 2.3 ships and to keep dropping (or at minimum stop growing) after Phase 2 lands.
- **Phase 2.5 is unblocked:** §12.10 + §12.12 + §12.5 are all 0, so the `entities.UNIQUE(name, type)` swap can ship without a remediation migration in front.
- **Phase 1 still worth doing, but its visible win is muted on this dataset:** §12.1 + §12.2 = 0, so the chat does not currently exhibit "entity recognized → no interview found" against the live data. The plan still covers entity↔relationship-only cases (`role='related_via_relationship'`) which §12 does not measure. This justifies Phase 1 as preventive coverage + improved retrieval shape, not as a fix-the-fire patch.

_Run details (from `scripts/audit/database-baseline.ts`, ISO timestamps preserved):_

```text
Generated: 2026-05-05 18:50:46Z
Connection: DATABASE_URL_DIRECT (Direct connection, db.<ref>.supabase.co:5432)
Rows: 16/16 queries succeeded; full markdown report in tmp/baseline.md (gitignored).
```

### §12.3 sample (first 3 of 18 orphan entities, for context)

> Sample is not exhaustive. Full list lives in the gitignored
> `tmp/baseline.md`. These are deliberately low-stakes public-org names
> from a single project; no PII.

| id | name | type | project_id |
| --- | --- | --- | --- |
| `89a89bc8-…` | Indiama | STATE_OWNED_ENTERPRISE | `c624337f-…` |
| `1f0f1369-…` | African Continental Free Trade Area | EVENT | `c624337f-…` |
| `27747181-…` | Banco National Angola | PUBLIC_INSTITUTION | `c624337f-…` |

### Re-run cadence (append after each phase)

| Phase | Date | §12.1 | §12.2 | §12.3 | §12.4 | §12.5 | §12.6 | §12.7 | §12.8 | §12.9 | §12.10 | §12.11 | §12.12 | §12.13 | §12.14 | §12.15 | §12.16 |
| ----- | ---- | ----: | ----: | ----: | ----: | ----: | ----: | ----: | ----: | ----: | -----: | -----: | -----: | -----: | -----: | -----: | -----: |
| 0 (baseline) | 2026-05-05 | 0 | 0 | 18 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| 1 (chat retrieval RPC) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 2 (source-first foundation) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 3a (workspaces + RLS) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 3b (reprocess txn swap) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 4a (chat evidence) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 4b (topics as entities) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |

## Implementation log

- 2026-05-04 — Phase 0 scaffolded: Supabase CLI installed (`supabase init`
  produced `supabase/config.toml`); diagnostic script + 16 SQL files added;
  baseline spec created. Awaiting `DATABASE_URL` to run.
- 2026-05-05 — Script generalised to try `DATABASE_URL_DIRECT` then
  `DATABASE_URL_POOLER` then `DATABASE_URL`. After a fresh DB password
  reset the Direct connection succeeded; all 16 queries ran; counts and
  interpretation pasted into [Results](#results). The dataset is small
  and mostly clean; the only real debt visible to the audit is **18
  orphan entities** (§12.3), which Phase 2.3 targets directly. Phase 2.5
  pre-flight (§12.10, §12.12) is **clean** — no remediation migration
  required ahead of the unique-constraint swap.
