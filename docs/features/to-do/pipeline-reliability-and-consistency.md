---
title: "Pipeline Reliability — Job Tracking, Retry, and Partial-Write Consistency"
status: to-do
owner: team
priority: high
last_updated: 2026-05-18
related_architecture:
  - docs/architecture/ingestion-pipeline.md
related_infrastructure:
  - docs/infrastructure/database-schema.md
---

# Pipeline Reliability — Job Tracking, Retry, and Partial-Write Consistency

## Problem

The ingestion pipeline is a long-running, multi-phase process (upload → transcribe → extract → resolve → chunk → normalise → embed → ground → graph). Two related failure modes are currently unaddressed:

### Fire-and-forget risk (idea #9)

Long jobs may be launched within a request lifecycle without a robust job-tracking mechanism. If the server restarts, or if AssemblyAI completes transcription but the subsequent pipeline phase fails, the system may:
- Leave the source in an ambiguous "processing" status forever.
- Show no useful error to the user.
- Not retry the failed phase.
- Not clean up partial writes.

### Partial-write consistency (idea #10)

If a source fails mid-pipeline, some derived data may already have been written: entities, mentions, relationships, chunks, source_entities, summaries, metadata. The database ends up in a partial state where the source appears to exist but critical derived data is missing. This silently breaks:
- Copilot answers (incomplete chunk set).
- Network Explorer (missing relationships).
- Reports (missing entities or summaries).

## Goals

- Every pipeline run is represented as a trackable job with a phase, status, started_at, and error_at.
- When a pipeline phase fails, the error is surfaced to the user (not just logged server-side).
- A failed source can be reprocessed from the UI — either from the beginning or from the last committed phase.
- On retry, partial derived data from the previous failed run is either cleaned up or safely overwritten (no duplicate rows).
- If the server restarts mid-pipeline, in-progress jobs are detectable and can be resumed or marked failed.
- The polling fallback for AssemblyAI (`/api/interviews/[id]/poll`) remains functional; this spec does not remove it.

## Non-goals

- A full distributed job queue (e.g. BullMQ, Inngest) is not required for Phase 1 — a lightweight Supabase-backed job table is sufficient.
- Real-time pipeline progress tracking (phase-by-phase progress bar) is a UX enhancement that can follow later.
- Multi-tenant job isolation beyond existing RLS is out of scope.
- Outbound webhooks or notifications when a job completes are out of scope.

## Approach

This spec starts as an **investigation + architecture decision**, then moves to implementation.

### Phase 0 — Audit (before writing code)

Answer the following questions by reading `docs/architecture/ingestion-pipeline.md` and tracing the code:

1. Where does the pipeline currently run — inside a request handler, a background function, or a route that responds immediately and delegates?
2. What happens to in-progress jobs if the Next.js dev server or Vercel function times out?
3. At what granularity is `status` currently updated on the `interviews` row?
4. Are there any existing retry or resume mechanisms?
5. Which pipeline phases perform DB writes? Are they wrapped in transactions or committed incrementally?

Document findings in the Implementation log before proceeding.

### Phase 1 — Job tracking table

Add a `pipeline_jobs` table (via migration) to track each pipeline run:

```
pipeline_jobs
  id              uuid PK
  interview_id    uuid FK → interviews
  phase           text   -- e.g. 'transcribe', 'extract', 'resolve', 'chunk', 'embed', 'ground', 'graph'
  status          text   -- 'pending' | 'running' | 'completed' | 'failed'
  started_at      timestamptz
  completed_at    timestamptz
  error_message   text
  created_at      timestamptz default now()
```

The pipeline writes a row at the start of each phase and updates it on completion or failure. This gives a durable, queryable audit trail independent of the request lifecycle.

### Phase 2 — Error surfacing

- When a pipeline phase fails, update the `pipeline_jobs` row with `status = 'failed'` and `error_message`.
- Update `interviews.status` to `'failed'` (or a phase-specific failed status) so the UI can show the user a meaningful error state.
- Add a failed state to the source card/detail UI: display the phase that failed and the error message (sanitised for user display).

### Phase 3 — User-triggered reprocess

- Add a "Reprocess" action to the source detail page (owner/editor only).
- On reprocess: determine the last successfully completed phase from `pipeline_jobs`, then re-run from that phase (or from the beginning if no phase completed).
- Before re-running, delete or overwrite derived data from the failed run:
  - Prefer **delete-and-replace**: delete all derived data for that `interview_id` (entities, mentions, relationships, chunks, source_entities, summaries) and start fresh.
  - This is simpler than phase-level partial cleanup and avoids stale data accumulation.
- The reprocess action uses the admin client pattern.

### Phase 4 — Stale job detection

- Add a background check (or a check on the poll endpoint) that detects `pipeline_jobs` rows stuck in `running` for longer than a configured timeout (e.g. 30 minutes).
- Mark such jobs as `failed` with `error_message = 'Job timed out'`.
- This handles server restart scenarios.

### Constraints

- Admin client pattern for all pipeline DB writes (HANDOVER.md §3).
- AssemblyAI polling fallback at `/api/interviews/[id]/poll` must not be broken (HANDOVER.md §3 gotcha #3).
- The `token_hash` auth flow is unrelated but must not be disturbed.
- Do not change the cascade delete behaviour on `interviews` — deleting an interview still removes all derived data (HANDOVER.md §3 gotcha #8).

## Technical notes

- Pipeline phases are detailed in `docs/architecture/ingestion-pipeline.md`.
- Derived data tables: `chunks`, `entity_mentions`, `entity_relationships`, `source_entities`, `entities` (project-scoped), source summaries (column on `interviews` or separate table — check schema).
- For delete-and-replace on reprocess: a single `DELETE FROM chunks WHERE interview_id = $1` pattern is sufficient if cascade deletes are not available; verify FK constraints.
- The `pipeline_jobs` table should be RLS-protected: users can only see job rows for interviews in their projects.
- Phase 4 stale detection can be a lightweight Supabase Edge Function on a cron schedule, or triggered lazily on the poll endpoint.

## Dependencies & related docs

- `docs/architecture/ingestion-pipeline.md` — full pipeline phase breakdown; must be read before implementing.
- `docs/infrastructure/database-schema.md` — `interviews` and all derived data table schemas.
- `docs/features/done/interview-transcript-review.md` — existing reprocess flow (if any) for transcript review; check before adding a new reprocess action.

## Risks & open questions

- **Architecture decision required**: should the pipeline use phase-level commits (resume from last checkpoint) or all-or-nothing (delete and retry from scratch)? This spec recommends delete-and-replace for simplicity, but confirm with the team.
- If AssemblyAI completes transcription successfully but extraction fails, does the reprocess need to re-call AssemblyAI or can it reuse the existing transcript? Reusing the transcript is strongly preferred (cost and latency); confirm the transcript is persisted before extraction begins.
- How long should a job be allowed to stay in `running` before being considered stale? 30 minutes is a guess — calibrate against actual pipeline durations.
- Should `pipeline_jobs` rows be retained indefinitely or pruned after N days? Retention policy needed.

## Acceptance / how to validate

- Upload a source. Open `pipeline_jobs` in the database. A row exists for each pipeline phase, progressing from `pending` → `running` → `completed`.
- Simulate a pipeline failure (e.g. temporarily break the extract step). The relevant `pipeline_jobs` row shows `status = 'failed'` with a non-null `error_message`. The source card in the UI shows an error state.
- Trigger reprocess from the source detail page. The source is re-processed successfully. No duplicate entity, chunk, or relationship rows exist after reprocessing.
- Simulate a server restart mid-pipeline (kill the dev server, wait for the stale timeout, restart). The stuck job is eventually marked `failed`, not left in `running` indefinitely.
- Check `interviews.status` after a failure — it reflects the failed state, not a stale "processing" status.

## Implementation log

- _To be filled in during Phase 0 audit._
