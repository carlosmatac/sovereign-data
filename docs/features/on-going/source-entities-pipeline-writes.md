---
title: "Pipeline writes source_entities + orphan-anchor reduction (Phase 2.3 / PR 2.3)"
status: on-going
owner: team
priority: high
last_updated: 2026-05-07
related_architecture:
  - docs/architecture/ingestion-pipeline.md
related_infrastructure:
  - docs/infrastructure/database-schema.md
related_audits:
  - docs/audits/database-retrieval-architecture-audit.md
related_roadmap:
  - docs/roadmaps/database-refactor-plan.md
related_features:
  - docs/features/on-going/source-entities-table-and-backfill.md   # Phase 2.2 (predecessor)
  - docs/features/on-going/source-rename-and-backcompat-views.md   # Phase 2.1 (predecessor)
  - docs/features/done/chat-entity-retrieval-rpc.md                # Phase 1 (consumer)
---

# Pipeline writes `source_entities` + orphan-anchor reduction (Phase 2.3 / PR 2.3)

## Problem

Phase 2.2 created `source_entities` and an idempotent backfill. The
table is currently **empty** — nothing writes to it. The audit's P5 /
§5.3 root cause therefore still holds:

- The chat reads `entity_mentions` via the `entity_intel` RPC. The
  April-2026 persistence gate intentionally drops `anchor_context` /
  `fuzzy` mentions, so an interviewee can have **zero** rows in
  `entity_mentions` for the very source where they are the
  interviewee. Phase 1 patched this read-side by also UNIONing the
  anchor FK columns on `sources`, but that is a one-relationship-per-
  source crutch and does not survive multi-interviewee /
  primary-subject / author cases.
- The resolver eagerly creates a new project entity any time the
  extraction emits an anchor name that does not match an existing
  entity. If grounding then fails (or all mentions get dropped by the
  gate), that entity row stays in `entities` with **zero** mentions,
  zero relationships, zero source links — pure orphan-graph creation.
  The current §12.3 count (24 orphans on a tiny dataset) is exactly
  this pattern.

Phase 2.3 closes both halves: pipelines start **writing** the rows
that `entity_intel` will read in PR 2.4, and the resolver stops
creating anchor-driven orphan entities.

## Goals

- Every successful ingest writes a `source_entities` row per non-NULL
  upload anchor (`interviewee` + `interviewee_org`) with
  `origin='upload_anchor'`, `confidence=NULL`, `is_primary=true` for
  the person row.
- Every successful ingest writes one `source_entities` row per
  high-confidence (≥ 0.9) extraction-emitted source-level association
  (`author`, `primary_subject`, `subject_organization`) with
  `origin='extraction'` and the LLM's confidence in `confidence`.
- The reviewed-reprocess clear-RPC (`clear_source_derived_data`) also
  removes `source_entities` rows with `origin='extraction'` so a
  reprocess gives a clean LLM-derived layer (without touching anchor
  rows).
- The resolver stops creating new project entity rows when the only
  signal that name exists is an anchor match and the user has not
  confirmed the anchor via autocomplete.
- All writes are idempotent: a reprocess MUST NOT create duplicate
  rows or duplicate orphans.

## Non-goals (this PR)

- **`entity_intel` is not rewritten yet.** PR 2.4 will UNION
  `source_entities` and stop reading the legacy anchor FK columns.
  Until then, the chat surface is unchanged.
- **`entities.UNIQUE(name, type)` stays put.** PR 2.5 owns that
  removal + the `match.ts` `23505` fallback cleanup.
- **No retroactive cleanup of the existing 24 orphan entities.** This
  PR only stops new orphans from being created on future ingests.
  Backfilling cleanup is tracked separately under
  [`entity-correction-governance.md`](../to-do/entity-correction-governance.md).
- **CRM-import / manual-tag / AI-inference / human-review /
  metadata-import / alias-propagation / prior-context origins** —
  the enum values exist (Phase 2.2) but no caller writes them in this
  PR.
- **No UI changes.** Interview-detail "associated entities" panel is
  a follow-up tracked under PR 2.6 / Phase 5.

## Approach

### 1. Anchor-row writer

New thin module `src/lib/sources/source-entities-writer.ts` exposing:

```ts
export async function upsertUploadAnchorSourceEntities(
  supabase: SupabaseClient<Database>,
  params: {
    sourceId: string;
    intervieweeEntityId: string | null;
    intervieweeOrgEntityId: string | null;
    createdBy?: string | null;
  }
): Promise<{ rowsConsidered: number; rowsWritten: number }>;
```

Behaviour:

- Builds a row per non-NULL anchor (zero, one, or two rows).
- Writes via `.upsert(..., { onConflict: 'source_id,entity_id,link_type,origin', ignoreDuplicates: true })`.
- `is_primary=true` on the person anchor, `false` on the org anchor.
- `confidence=NULL` (anchors are deterministic).
- Returns counts for logs / tests.

Called from **`runIntelPipelineFromCanonicalSource`** just **before**
the final `updateInterviewStatus(interviewId, 'COMPLETED', …)` call.
That single call site covers all three pipelines (audio,
PDF/document, plain text) and reviewed reprocess. Idempotency is
structural via the quad UNIQUE.

### 2. Extraction-confidence writes

#### 2a. Extension to `extraction.ts`

Add a top-level optional `source_associations` field to
`ExtractionSchema`:

```ts
source_associations: z.array(
  z.object({
    candidate_canonical_name: z.string(),  // must match an entities[].canonical_name
    link_type: z.enum(["author", "primary_subject", "subject_organization"]),
    confidence: z.number().min(0).max(1),
    evidence_text: z.string().nullable(),
  })
).optional()
```

Prompt addendum (concise, conservative):

> If the source has a clear AUTHOR (a single person who wrote the
> document), PRIMARY_SUBJECT (the single person the source is most
> centrally about), or SUBJECT_ORGANIZATION (the single org the
> source is most centrally about), and that role is supported by a
> direct quote, emit a `source_associations` entry with
> `confidence ≥ 0.9`. If the role is debatable or scattered across
> multiple entities, emit nothing.

Source-level associations are intentionally rare (most interviews
have none — the interviewee is already the primary subject and that
case is handled by the upload anchor). The 0.9 threshold and the
"emit nothing if debatable" instruction keep noise out.

#### 2b. Pipeline write

In `runIntelPipelineFromCanonicalSource`, after
`resolveExtractedEntities` builds `entityIdMap` and after the
persistence gate runs, iterate `extraction.source_associations ?? []`:

- Map `candidate_canonical_name` → entity ID via `entityIdMap`. If
  the name does not resolve, **skip** (no orphan creation).
- If `confidence < 0.9`, **skip** (constant defined in
  `src/lib/sources/source-entities-writer.ts` as
  `EXTRACTION_CONFIDENCE_THRESHOLD = 0.9`).
- Otherwise upsert with
  `{source_id, entity_id, link_type, origin: 'extraction', is_primary: link_type === 'primary_subject', confidence, evidence: evidence_text ? {quote: evidence_text} : null}`,
  `onConflict: 'source_id,entity_id,link_type,origin', ignoreDuplicates: false`
  (refresh evidence + confidence on reprocess).

Return counts; log them in the existing pipeline-completion line.

### 3. Reviewed-reprocess clear-RPC extension

Migration `00029_clear_source_derived_extraction.sql` (single file,
single function rewrite):

`clear_source_derived_data(p_source_id UUID)` adds one DELETE:

```sql
DELETE FROM public.source_entities
 WHERE source_id = p_source_id
   AND origin = 'extraction';
```

Other origins (`upload_anchor`, future `manual_tag`, `crm_import`,
`human_review`, …) are **preserved** — they reflect facts external
to the LLM pass.

Idempotent via `CREATE OR REPLACE FUNCTION`. Same dry-run discipline
as 00027/00028 (`scripts/db/migration-dry-run.ts` with explicit
`lock_timeout` / `statement_timeout` and a probe verifying the new
DELETE clause).

> **Plan numbering note:** the plan reserved `00029` for PR 2.5
> (`entities.UNIQUE(name, type)` drop). This PR claims `00029` for
> the clear-RPC extension because it's tightly coupled with the new
> writes; PR 2.5's migration becomes `00030`. No correctness impact —
> the plan numbering was illustrative.

### 4. Orphan-anchor reduction in the resolver

The audit's P5 names two paths that create orphan `entities` rows:

1. **Anchor-driven creation:** the LLM emits a name that fuzzy-
   matches the upload anchor. `matchAgainstAnchors` returns
   `anchor_inferred`. `matchOrCreateEntity` then creates a brand-new
   project entity for the anchor name. The gate later drops the
   chunk-grounded mention because the matchMethod was `anchor_context`
   / `fuzzy`. Net result: a fresh `entities` row with **zero**
   mentions, zero relationships, zero source_entities.
2. **Extraction-only creation:** the LLM emits a name that doesn't
   match any anchor or existing entity. `matchOrCreateEntity` creates
   a fresh project entity. If the gate also drops all of its grounded
   mentions, it becomes orphan.

Path 1 is the path covered by the plan's wording
("anchors that won't survive grounding"). Path 2 is structurally
distinct and is left to PR 2.5 / governance follow-up.

Fix for path 1, **localised to `src/lib/entities/match.ts` and
`src/lib/entities/resolve.ts`:**

- Add `mode: "create_or_match" | "match_only"` to
  `matchOrCreateEntity` (default `create_or_match` = today's
  behaviour). The result type becomes
  `{ entityId: string | null, needsReview: boolean }` so callers can
  detect the unresolved case.
- In `match_only` mode (per Q1 override): only the four **exact**
  paths run — project entity, project alias, global entity, global
  alias. **Fuzzy is skipped entirely** (no auto-merge, no review-
  threshold create). **Creation is skipped entirely**. If none of the
  exact paths hit, return `{ entityId: null, needsReview: false }`.
- In `resolveSingleEntity`, when `anchorMatch` is non-null AND
  `raw.forcedEntityId` is undefined, call `matchOrCreateEntity` with
  `mode: 'match_only'`.
- If the resolver returns `entityId === null`, treat the resolution
  as `unresolved`: do NOT push a `ResolvedEntity` for grounding, do
  NOT write any DB row. Log the drop with the anchor name + raw_name
  for observability.

Net effect: when the LLM emits "Mr. Raji" as a PERSON entity for an
interview whose `interviewee_name = 'Raji Bashir'` and the user
**did not** pick "Raji Bashir" from the autocomplete
(`interviewee_entity_id IS NULL`), the resolver:

1. Tries exact project entity match on `mr raji` → no hit.
2. Tries exact project alias match → no hit.
3. Tries exact global entity / global alias → no hit.
4. **Skips fuzzy.** Skips create.
5. Returns null. The mention is dropped.

If "Mr. Raji" or "Raji Bashir" already exists as a canonical entity
or as a pre-existing alias (e.g. from a prior interview), the exact
paths catch it and the mention is grounded against that existing
entity — which is the correct outcome.

What is **not** changed:

- `forcedEntityId` (reviewer seed) bypass — still creates / uses the
  exact entity the human picked.
- Non-anchor extraction entities — still go through the full
  `create_or_match` path including fuzzy auto-merge and creation
  (path 2, deferred).
- Existing exact-match reuse for non-anchor extractions — unchanged.

### 5. TypeScript types

- Extend `ExtractionResult` with the optional `source_associations`.
- No `Database` types change beyond what Phase 2.2 already added.
- Add a small enum union for the 3 extraction-eligible link types
  (the broader `SourceEntityLinkType` covers all 12).

### 6. Validation

1. `npm test` — extend
   - `src/__tests__/pipeline-smoke.test.ts` to assert
     `source_entities` upserts (anchor + extraction paths).
   - `src/lib/entities/match.test.ts` (new) for the `match_only`
     mode (or piggyback on `ground-mentions.test.ts` if that's
     where match.ts is exercised).
2. `npx tsx scripts/db/migration-dry-run.ts supabase/migrations/00029_clear_source_derived_extraction.sql --lock-timeout 5s --statement-timeout 60s` with a probe that:
   - Calls `clear_source_derived_data('<a real source id>')` inside the
     transaction, verifies it deletes only `origin='extraction'` rows
     (we'll seed two rows of different origin first), then ROLLBACKs.
3. STOP. Report. Wait for go-ahead before push.
4. `npx supabase db push --include-all`.
5. Manual smoke:
   - Upload one new source through the dev server (PDF or text since
     audio is heavier). Confirm `source_entities` gets the anchor
     row(s).
   - Trigger a reviewed-reprocess on a source that has extraction
     rows; confirm the extraction rows are wiped and re-derived
     while the anchor row survives.
6. Re-run baseline audit; append a Phase 2.3 cadence row. Expectation:
   - §12.3 (orphan entities) **stops growing** after the next ingest
     (the conservative reducer should already prevent path-1 orphans
     on a fresh upload).
   - All other §12.* counts unchanged.
7. Append two new probes to `scripts/audit/queries/`:
   - **§12.17** `source_entities_by_origin.sql` — `count(*) FILTER
     (WHERE origin = 'upload_anchor')`, `…='extraction'`, `…='manual_tag'`,
     etc.
   - **§12.18** `anchors_without_source_entities.sql` —
     `sources WHERE interviewee_*_entity_id IS NOT NULL AND no matching
     source_entities row`. Should be 0 once any future ingest runs.

### Rollback

- The clear-RPC migration is reversible by re-applying the prior
  body (`CREATE OR REPLACE FUNCTION` again). The migration is
  forward-compatible with the previous behaviour (it only deletes an
  empty set on databases that don't have any extraction rows yet).
- App-code rollback is `git revert` of the PR 2.3 commit. The new
  table stays; nothing reads it pre-PR-2.4 so a rollback is silent
  for users.

## Dependencies

- **Phase 2.2 (PR 2.2) applied.** Required: `source_entities` table
  + 2 enums + RLS, in remote DB.
- **Phase 2.1 (PR 2.1) applied.** Required: `clear_source_derived_data`,
  `get_source_project`, `sources` / `source_chunks` tables.
- `is_project_member`, `is_project_editor` from `00002`.

## Risks

| Risk | Mitigation |
|------|------------|
| Match-only mode regresses today's "interviewee gets resolved" behaviour | Today's anchor branch primarily uses `forcedEntityId` (autocomplete) when set; the dataset shows `interviewee_entity_id IS NOT NULL` for **0 of 6** sources, so no current ingest is using that path productively. Tests will assert the autocomplete path still resolves and a no-FK ingest does **not** spawn a new entity. |
| LLM emits malformed `source_associations` (e.g. unknown name, bad confidence) | Schema enforces shape; pipeline filters on `entityIdMap` lookup + confidence threshold. Unknown names are silently skipped. |
| `clear_source_derived_data` accidentally deletes anchor rows | The new DELETE filters `origin = 'extraction'`. Probe asserts a non-extraction row survives the call. |
| Reprocess concurrency leaves stale extraction rows | `clear_source_derived_data` runs inside the existing pipeline order (clear → re-extract → upsert). Same failure window as today; not introduced by this PR. |
| Migration numbering deviation from the plan | Documented above in §3 — PR 2.5's migration becomes `00030`. No DB or code coupling. |

## Acceptance criteria

- [x] `src/lib/entities/source-entities-writer.ts` ships with both
  the anchor and extraction writers, fully typed, with unit tests.
  *(Module added at `src/lib/entities/` rather than `src/lib/sources/`
  to keep the writer next to the resolver/match modules it composes
  with; 12 unit tests in
  `src/lib/entities/source-entities-writer.test.ts`.)*
- [x] `extraction.ts` emits the optional `source_associations` field;
  prompt updated with the 0.9-threshold instruction.
- [x] `runIntelPipelineFromCanonicalSource` calls both writers
  before `COMPLETED`, idempotent on reprocess.
- [x] `match.ts` accepts a `mode: 'match_only'` parameter that
  guarantees no `INSERT INTO entities`. Function overloads narrow
  the return type so default-mode callers keep their non-null
  `entityId` guarantee.
- [x] `resolve.ts` uses `match_only` for `anchor_inferred`
  resolutions with no `forcedEntityId`. Drops the resolution if
  no exact match is found and logs the drop.
- [x] Migration `00029_clear_source_derived_extraction.sql` dry-run
  passes with DO-block assertions. **Pending push** to remote
  (waiting for user go-ahead per the incremental-stop request).
- [x] `npx tsc --noEmit` clean. `npm test` 141/141 passing
  (16 new tests).
- [ ] Manual smoke: a fresh upload gets `source_entities` rows
  (when anchor FKs are set) and creates no new orphan entity row
  in `entities` for an unconfirmed-anchor name match. *(Deferred
  until migration push + types regen; smoke depends on remote DB
  having the new clear-RPC behaviour.)*
- [ ] Two new audit probes (§12.17, §12.18) added; cadence row
  appended. *(Will run after push, alongside the smoke.)*

## Fork decisions (confirmed 2026-05-06)

**Q1 — Resolver `match_only` semantics — _OVERRIDDEN: stricter than default_.**
For `anchor_inferred` resolutions without a `forcedEntityId`, the
`match_only` mode is **precision over recall**: it accepts ONLY
project-exact-entity, project-exact-alias, global-exact-entity, and
global-exact-alias matches. **Fuzzy auto-merge is skipped too**, even
into existing entities. Rationale: stale/incorrect entity behaviour
already observed in manual tests; we'd rather drop a debatable
anchor mention than mint a wrong association.

Concretely, in `match_only` mode `matchOrCreateEntity` will:

- Try the four exact paths (project entity, project alias, global
  entity, global alias).
- **NOT** call `findBestFuzzyCandidate`.
- **NOT** call `createProjectCanonicalEntity`.
- Return `null` if no exact match.

`create_or_match` (default) is unchanged.

**Q2 — Both rows when extraction author == upload anchor: KEEP DEFAULT.**
Write both `origin='upload_anchor', link_type='interviewee'` and
`origin='extraction', link_type='author'`. Different provenance,
different link semantics, quad UNIQUE allows it. PR 2.4 will
deduplicate at read time.

**Q3 — Evidence as free text: KEEP DEFAULT.** Store the LLM
`evidence_text` quote in `evidence: {"quote": "..."}`. Chunk-level
evidence is a later evidence-focused phase.

**Q4 — `created_by` NULL: KEEP DEFAULT.** Revisit when manual-tag /
human-review flows are implemented.

**Q5 — No `entity_mentions` → `source_entities` backfill in this PR:
KEEP DEFAULT.** Treated as a governance/backfill decision later.

## Implementation log

### 2026-05-06 — code complete, awaiting push approval

App-side changes landed; migration is ready to push.

**Migration**

- `supabase/migrations/00029_clear_source_derived_extraction.sql`:
  rewrites the body of `clear_source_derived_data(p_source_id UUID)`
  to also `DELETE FROM source_entities WHERE source_id = $1 AND
  origin = 'extraction'`. All other origins
  (`upload_anchor`, `manual_tag`, `crm_import`, `human_review`,
  `metadata_import`, `ai_inference`, `alias_propagation`,
  `prior_context`) are preserved. Plan reserved 00029 for PR 2.5;
  PR 2.5 becomes 00030 — documented in §3 of this spec.
- Dry-run command:
  ```
  npx tsx scripts/db/migration-dry-run.ts \
    --migration supabase/migrations/00029_clear_source_derived_extraction.sql \
    --lock-timeout 5s --statement-timeout 60s --probe "<DO-block>"
  ```
  The probe runs a DO block that seeds two `source_entities` rows
  (one `upload_anchor`, one `extraction`), calls the RPC, and
  raises an exception if the anchor row was dropped or the
  extraction row was preserved. Dry-run output: `✓ migration
  applied (will be rolled back) … ✓ probe returned … ✓ rolled back
  — no changes persisted` — i.e. the inner DO assertions passed
  silently.

**App code**

- `src/lib/entities/match.ts`: added `mode: "create_or_match" |
  "match_only"` parameter (default `create_or_match`). Function
  overloads narrow the return type so default-mode callers keep
  `{ entityId: string; needsReview: boolean }`. In `match_only`,
  after the four exact paths miss, the function short-circuits and
  returns `{ entityId: null, needsReview: false }` — no fuzzy, no
  create.
- `src/lib/entities/resolve.ts`: when `anchorMatch !== null` AND
  `raw.forcedEntityId` is undefined, calls `matchOrCreateEntity`
  with `mode: 'match_only'`. If `entityId === null`, the
  resolution is dropped (not pushed into `resolved[]`) and a
  `[resolve] match_only drop` line is logged for observability.
  A summary line counts drops at the end of the loop.
- `src/lib/ai/extraction.ts`: added `source_associations` field to
  the Zod schema (`z.array(...).default([])`), with a strict
  `link_type` enum (`author | primary_subject |
  subject_organization`) and `confidence: number` (0..1). The
  prompt now includes a paragraph instructing the model to emit
  these only when ≥ 0.9 and only when the source-as-a-whole is
  about / by the entity (interviewee, byline, profile subject).
- `src/lib/entities/source-entities-writer.ts` (new):
  - `writeAnchorSourceEntities` — UPSERTs one row per non-null
    anchor (`interviewee` / `interviewee_org`), all with
    `origin='upload_anchor'`. Returns the count for logging.
  - `writeExtractionSourceEntities` — filters by
    `confidence ≥ 0.9` (default; configurable), maps each `name`
    to an entity id via the resolver's `entityIdMap` (literal then
    normalized), dedupes `(entity, link_type)` within the call,
    UPSERTs with `origin='extraction'`. Returns
    `{ attempted, written, droppedLowConfidence, droppedUnresolved }`.
  - Both upserts use `onConflict: 'source_id,entity_id,link_type,
    origin'` and `ignoreDuplicates: true`.
- `src/lib/ai/pipeline.ts`: imports both writers and calls them
  after the relationship UPSERT loop and before the COMPLETED
  status flip. Logs a single summary line including
  `source_entities anchor=N extraction(written=…, dropped_low_conf=…,
  dropped_unresolved=…)`. The reprocess path benefits automatically
  via the `clear_source_derived_data` RPC's new behaviour (after
  00029 is pushed).

**Tests**

- `src/lib/entities/source-entities-writer.test.ts` (12 tests):
  anchor writer no-op when both IDs are null, single vs both rows,
  quad-key correctness; extraction writer empty-input no-op,
  threshold drop, unresolved drop, evidence packaging, intra-call
  dedupe, multi-link-type allowed, normalized-name fallback,
  custom threshold, default threshold = 0.9.
- `src/lib/entities/match.test.ts` (4 tests): `match_only` returns
  null when no exact match exists (no fuzzy / no insert); returns
  the canonical entity id on exact alias hit; returns the canonical
  entity id on exact entity hit; default mode still creates a new
  project entity when no match found.
- `src/__tests__/pipeline-smoke.test.ts` (4 existing tests, now
  exercising the new pipeline log line): all four paths
  (audio / PDF / text / reprocess) reach COMPLETED with the
  expected `source_entities anchor=… extraction(…)` summary.

**Validation**

- `npx tsc --noEmit` — clean.
- `npm test` — 141/141 passing (16 new).
- Migration dry-run — passes with DO-block assertions, transaction
  rolled back cleanly.

**Next**

Awaiting user go-ahead before `npx supabase db push` for migration
00029. After push: regenerate types, run baseline audit (with the
two new probes §12.17 / §12.18), and a manual upload smoke before
committing.

### 2026-05-07 — manual smoke caught a strict-schema regression; fix landed

User triggered an audio upload (interview
`684e9c4d-2ac6-45f2-86a6-50281afc2fe1`). AssemblyAI transcription
completed, the pipeline kicked off, and `extractIntelligence` failed
with:

```
AI_APICallError: Invalid schema for response_format 'response':
'required' is required to be supplied and to be an array including
every key in properties. Missing 'source_associations'.
```

Root cause: the new `source_associations` field used `z.array(...).default([])`.
Zod's `.default(...)` makes the field optional in the generated JSON
schema, but Vercel AI SDK calls `generateObject` with the OpenAI
strict-mode response format, which requires every property to appear
in `required`. The other arrays in `ExtractionSchema` (`entities`,
`relationships`, `risks`, `opportunities`) are required arrays — the
model emits `[]` when nothing applies.

Fix (`src/lib/ai/extraction.ts`):

- Removed `.default([])` so the field is a required array, matching
  the existing convention.
- Added an explicit prompt instruction: *"If the source is a generic
  article, a panel discussion, or a multi-speaker piece with no clear
  'subject', return an empty array [] for source_associations — do
  not omit the field."*
- Added an inline schema comment explaining why the field can never
  use `.default()` / `.optional()` under OpenAI strict-mode.

Validation: `npx tsc --noEmit` clean; `npm test` 141/141 passing.

The 16 new tests are unaffected — `pipeline.ts` already does
`extraction.source_associations ?? []` defensively, and the writer
tests don't exercise the LLM call path. The smoke regression would
have been caught by an integration test that runs the schema through
the OpenAI structured-output JSON schema generator; out of scope for
this PR but a worthwhile follow-up.

The failed interview row stays in `status='FAILED'` until the user
retries (re-upload or re-trigger). No data corruption — the pipeline
failed in `extractIntelligence` before any DB write past the
`status: EXTRACTING` flip.

### 2026-05-07 — upload-anchor regression: deterministic match-or-create at the route layer

After the strict-schema fix, the user pushed back on the
`§12.18 = 0` reading from the post-push baseline. The audit table
showed *zero* sources had `interviewee_*_entity_id` populated and
zero `source_entities upload_anchor` rows existed. The user's
suspicion was that Phase 2.3's `match_only` mode was preventing the
explicit "Primary person" / "Organization" fields from creating or
linking entities.

**Trace.** The Add Source form *already* mounts an autocomplete
(`InterviewAnchorEntityInput` in
`src/components/interviews/interview-anchor-entity-input.tsx`,
existing — not new in this PR) which fires
`/api/projects/:id/entities/search`. When the user picks a
suggestion, the form sets `intervieweeEntityId` and the route
validates it via `validateInterviewAnchorEntityId`. That branch is
fine.

The broken branch was: **user types text but does not pick.** The
route stored `interviewee_name` as text only and left
`interviewee_entity_id = NULL`. Pre-Phase-2.3, the resolver would
later run `anchor_inferred` on the LLM-extracted name and (in
default `create_or_match` mode) create the entity as a side effect.
Phase 2.3 closed that side-effect path for orphan-anchor reduction,
correctly — but it left the explicit-text channel uncovered, and
the form did not have a deterministic upload-time create path of
its own.

**Fix.** A new helper `ensureUploadAnchorEntity` in
`src/lib/entities/validate-interview-anchor.ts` collapses both
channels into one deterministic call:

- `entityId` provided → run the existing
  `validateInterviewAnchorEntityId`. On invalid → return
  `{ ok: false, reason: 'invalid_entity_id' }` so the route still
  answers 400.
- `entityId` null but `name` provided → call
  `matchOrCreateEntity({ mode: 'create_or_match', type })` with
  `type = PERSON` for the person field and `type = ORGANIZATION`
  (the most generic org-like type) for the org field. Reuses any
  existing match; otherwise creates a new project-scoped entity.
- Both null → return `{ ok: true, entityId: null, name: null }`.

After matching, the helper re-reads `entities.name` so the source
row stores the canonical form (e.g. an existing
`"Francisco Pinzon"` overrides a newly typed `"francisco pinzon"`).

The three upload routes were updated to call the helper instead of
the old "validate-only-if-provided" block:

- `src/app/api/interviews/route.ts`
- `src/app/api/interviews/from-pdf/route.ts`
- `src/app/api/interviews/from-text/route.ts`

**Pipeline change: none.** Once the FK is set on `sources`,
`writeAnchorSourceEntities` (already wired in PR 2.3) will produce
the matching `source_entities` `upload_anchor` row. The resolver's
`match_only` path is preserved for *LLM-inferred* anchor mentions,
where it correctly trades recall for precision.

**Tests.** `src/lib/entities/validate-interview-anchor.test.ts`
(9 new tests, mocks `matchOrCreateEntity` so the test stays unit-
scoped):

- both null → `{ ok: true, entityId: null, name: null }`, no
  `matchOrCreateEntity` call;
- whitespace-only name → same;
- valid PERSON FK → returns the validated row's name without calling
  `matchOrCreateEntity`;
- valid ORG-like FK (e.g. `COMPANY`) → same;
- non-existent FK → `{ ok: false, reason: 'invalid_entity_id' }`;
- ORG given for `role: person` → rejected, no `matchOrCreateEntity`
  call;
- free-text PERSON → `matchOrCreateEntity` called with
  `type: 'PERSON'`, `mode: 'create_or_match'`; canonical name read
  back;
- free-text ORG → same with `type: 'ORGANIZATION'`;
- entity row read-back failure → falls back to user-typed (trimmed)
  name.

**Validation.** `npx tsc --noEmit` clean; `npm test` 150/150
passing (9 new). Lint clean across the four touched files.

**Expected effect on §12.17 / §12.18.** Next upload that fills any
of the two anchor fields — whether by autocomplete pick or by free
text — will:

- populate `sources.interviewee_*_entity_id` (pre-2.3 baseline:
  always NULL),
- write a matching `source_entities` row with `origin =
  'upload_anchor'`,
- thereby moving §12.17 above zero and keeping §12.18 at zero (no
  source has FK set without the matching anchor row).

**Out of scope (tracked separately).** The form already has
autocomplete; the user's "would be nice to have autocomplete" comment
is therefore really about discoverability/UX (e.g. visible state for
"no match — will be created", loading hints, project-scoped match
indicator). I'll log that as a separate to-do spec
(`docs/features/to-do/entity-anchor-autocomplete-ux.md`) rather than
expand this PR.

### 2026-05-07 — smoke evidence + boundary clarifications

After the upload-anchor fix landed, the user ran a fresh audio
upload (source `41ed83ce…`, *Martín Eurnekian* /
*Corporación América Airports*) and reported back. The pipeline log
gave the diagnostic line:

```text
Pipeline completed for interview 41ed83ce-…:
  60 chunks, 7 resolved entities (from 8 raw),
  persistence gate kept 3/7 entities (ungrounded=4, dropped_by_policy=0),
  relationships kept=0 dropped=3,
  source_entities anchor=2 extraction(written=0/0,
                                      dropped_low_conf=0,
                                      dropped_unresolved=0)
```

That line decomposes the four reviewer questions cleanly:

**Anchor channel — fix confirmed.** `anchor=2` means both
`upload_anchor` rows landed (the pre-fix smoke had `anchor=0`).
`ensureUploadAnchorEntity` is doing its job at the route layer.

**Extraction channel — `0/0` is correct here, not a bug.** The
breakdown `attempted=0 / written=0 / dropped_low_conf=0 /
dropped_unresolved=0` means **the LLM emitted
`source_associations: []`** for this source. Not "filtered out at
0.9" — *not attempted*. For an interview where the upload form
already provides the primary person and org, the LLM is correctly
not duplicating those into the extraction channel. The
`source_associations` field is most useful on sources **without**
upload anchors (e.g. a published-article PDF with a byline but no
form anchors, a profile piece, a multi-source document). The audit
probes §12.17 and §12.18 stay in the cadence so this is observable
over time; if it stays at 0 across no-anchor uploads we'll re-tune
the prompt.

#### Boundary: `source_entities` vs. `entity_mentions`

The two layers are deliberately distinct:

| Layer | Granularity | Question it answers | Populated by |
|---|---|---|---|
| `entity_mentions` | Chunk-level — one row per (entity, source, chunk) grounded reference | *"Where in this source does X appear?"* | Persistence gate (exact + alias matches) |
| `source_entities` | Source-level — one row per (source, entity, link_type, origin) source-as-a-whole assertion | *"Who is this source by, who is it primarily about, which org is it primarily about?"* | `upload_anchor` (form FKs) and `extraction` (LLM source_associations ≥ 0.9 confidence) |

**We do NOT promote arbitrary `entity_mentions` rows into
`source_entities`.** Important entities that show up across many
chunks already live in `entity_mentions` and will be reachable by
the chat via Phase 2.4's `entity_intel` rewrite (which UNIONs both
layers). Promoting every interesting mention into `source_entities`
would re-create the duplication problem the persistence gate was
designed to avoid.

The intentional `source_entities` "menu" today:

- `link_type` enum (Phase 2.2): `interviewee`, `interviewee_org`,
  `author`, `primary_subject`, `subject_organization`,
  `mentioned_at_source_level`, `related_entity` — but only the
  first five have writers in PR 2.3. The last two are reserved for
  future flows (manual tags, governance promotions). They will not
  fire automatically from extraction.
- `origin` enum: today PR 2.3 writes only `upload_anchor` and
  `extraction`. Other origins (`manual_tag`, `crm_import`,
  `human_review`, `metadata_import`, `ai_inference`,
  `alias_propagation`, `prior_context`) are reserved for later
  governance / inference flows and have no writers yet.

#### Q2 fix: both upload anchors are `is_primary: true`

The reviewer flagged that `interviewee_org` was being written with
`is_primary: false` while `interviewee` was `true`. The original
default came from "interviews have one primary subject (the
person)", but the user is right: when the uploader explicitly fills
both fields, both are user-confirmed structural subjects of the
source. The schema does not constrain "at most one primary per
source" — multiple `is_primary=true` rows are allowed.

`src/lib/entities/source-entities-writer.ts`: changed the
`interviewee_org` row to `is_primary: true`. A short comment
documents the intent.

`src/lib/entities/source-entities-writer.test.ts`: updated the
"both rows" test to expect `is_primary: true` for both. Test name
updated to reference Q2 (`PR 2.3 / Q2`).

`npm test` — 150/150 passing.

#### Q3: source detail page UI follow-up

Tracking as a separate spec:
[`docs/features/to-do/source-detail-entity-cards.md`](../to-do/source-detail-entity-cards.md).
That spec covers showing the primary person + organization cards at
the top of the source detail page. It is *not* in scope for the
PR 2.3 commit — the commit is purely backend writes.

#### Sign-off readiness

- Anchor write path: confirmed via smoke (`anchor=2`).
- Extraction write path: 0/0 explained (LLM rightly returned `[]`
  when both source-level roles are already covered by upload
  anchors).
- `is_primary` semantics: fixed for the org case.
- UI follow-up: tracked separately.
- Tests: 150/150.
- Awaiting one final reviewer smoke (single fresh upload to
  confirm both rows now have `is_primary = true`), then commit.
