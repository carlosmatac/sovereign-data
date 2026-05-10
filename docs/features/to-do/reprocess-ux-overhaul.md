---
title: "Reprocess UX overhaul"
status: to-do
owner: team
priority: high
last_updated: 2026-05-10
related_architecture:
  - docs/architecture/ingestion-pipeline.md
related_features:
  - docs/features/done/interview-transcript-review.md
  - docs/features/done/reprocess-transactional-swap.md
---

# Reprocess UX overhaul

## Problem

Triggering a reprocess from the transcript review page is a painful, opaque multi-step flow with no live feedback. Specific pain points observed:

1. **Too many manual steps:** to reprocess, a user must (1) save the review as draft, (2) mark the source as ready, (3) click a separate reprocess button. Three actions for a single intent — "re-run the pipeline with my edits applied."
2. **No in-progress indicator:** once reprocess is triggered, the UI gives no feedback that anything is happening. There is no spinner, no "reprocessing…" state, and no progress cue. The user has no idea whether it's running or stuck.
3. **The "ready" status can be set before reprocess completes:** a user can click "mark as ready" and then click away, abandoning the reprocess mid-flight. The review status transitions make this possible.
4. **Gets stuck:** the reprocess can silently fail or hang, leaving the source in a `reprocessing` limbo state with no recovery path visible to the user. The Phase 3b transactional swap reduced data-corruption risk but did not improve the UX of a stuck reprocess.

## Goals

- **Reduce to one action:** a single "Save & Reprocess" button that commits the review edits and triggers the pipeline reprocess atomically from the user's perspective.
- **Live feedback:** show a reprocess progress state (spinner / progress indicator / status message) on the source detail / review page while the pipeline is running.
- **Block premature status changes:** while a reprocess is in progress, the "mark as ready" or "save draft" actions should be disabled or replaced with "reprocessing in progress" copy.
- **Recoverable stuck state:** if a reprocess fails or times out, surface a clear error state with a "Retry reprocess" affordance, not a silent hang.

## Non-goals

- Real-time streaming progress per-chunk or per-entity (nice-to-have; not in this spec — a simple "in progress / done / failed" three-state is sufficient for the MVP).
- Changing the pipeline compute logic or the Phase 3b transactional RPC.
- Reprocess from outside the review page (e.g. programmatic batch reprocess — separate feature).

## Approach

### Phase 1 — Collapse the action surface

1. Replace the separate "Save Draft → Mark Ready → Reprocess" buttons with a single **"Save & Reprocess"** button in the review UI.
2. On click: save the current review state (entities, corrections) AND immediately trigger the reprocess API call in one sequence.
3. Keep "Save Draft" as a secondary action for users who want to save without reprocessing.

### Phase 2 — Reprocess status polling

1. When reprocess is triggered, set the source's `transcript_review_status` to `reprocessing` (already exists in the schema).
2. The review page polls the source status (e.g. every 3–5 seconds via `useInterval` or a lightweight SWR revalidation) while `status === 'reprocessing'`.
3. Show a spinner / "Reprocessing…" banner while polling.
4. On completion (`status = COMPLETED` or `transcript_review_status = ready`), refresh the page state and show a success toast.
5. On failure (`status = FAILED`), show an error banner with a "Retry" button.

### Phase 3 — Guard against mid-flight user actions

1. While `transcript_review_status === 'reprocessing'`, disable or visually indicate as inert: "Save Draft", "Mark as Ready", all entity correction controls.
2. Show a non-blocking "Reprocessing in progress — please wait" notice.
3. Navigate-away protection: warn the user if they try to leave the page while reprocess is in flight.

## Technical notes

- The existing pipeline uses AssemblyAI polling (`/api/interviews/[id]/poll`); the review-reprocess flow is separate (no AssemblyAI involved — it uses the stored transcript, not a new transcription). The polling for reprocess status is simpler: just check `sources.status` and `transcript_review_status`.
- `transcript_review_status` enum values: `draft`, `ready`, `reprocessing`, `completed` (verify current values in `database.ts`).
- The Phase 3b RPC (`replace_source_derived_data`) already handles the atomic swap. The UX change is purely in the frontend call sequence and the status-polling layer.

## Constraints

- Admin client pattern: the reprocess trigger API route already uses `createAdminClient()` for pipeline writes — do not change this.
- Do not change the Phase 3b transactional RPC or pipeline logic.

## Risks & open questions

- **Polling interval:** too frequent polling is wasteful; too slow gives a poor experience. 3–5 seconds is a reasonable default for a reprocess that typically takes 10–60 seconds.
- **Page navigation during reprocess:** a hard "block navigation" is aggressive; a soft "are you sure?" prompt is user-friendlier.
- **Open question:** should the reprocess progress be visible from the source list page too, not just the detail/review page? A status badge on the list card would help users who navigate away mid-reprocess.

## Acceptance / how to validate

- [ ] Triggering reprocess from the review page requires exactly one click of "Save & Reprocess."
- [ ] While reprocessing, a visible in-progress indicator is shown (spinner or banner) and entity correction controls are disabled.
- [ ] On success, the page refreshes and shows the updated entity state.
- [ ] On failure, an error state is visible with a "Retry" action — no silent hang.
- [ ] "Mark as Ready" button is not clickable while reprocess is in progress.
