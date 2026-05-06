---
title: "Chat entity-centered retrieval RPC (Phase 1 / PR 1.1)"
status: done
owner: team
priority: high
last_updated: 2026-05-06
related_architecture:
  - docs/architecture/agentic-rag.md
related_infrastructure:
  - docs/infrastructure/database-schema.md
related_audits:
  - docs/audits/database-retrieval-architecture-audit.md
related_roadmap:
  - docs/roadmaps/database-refactor-plan.md
---

# Chat entity-centered retrieval RPC (Phase 1 / PR 1.1)

## Problem

The chat tool `lookupMentions(entityId)` is the only path the Copilot has for
"give me the interviews where this entity matters." Today it reads only
`entity_mentions`. The April 2026 persistence gate (see
[`docs/features/done/fix-context-entity-ingestion.md`](../done/fix-context-entity-ingestion.md))
deliberately drops `anchor_context` and `fuzzy` mentions, so an entity that is
the **interviewee** of an interview can have **zero** rows in `entity_mentions`
for that interview. The chat says "no interviews mention this person" even
though `interviews.interviewee_entity_id` points right at it. The audit
documents this as a structural gap in `lookupMentions`
([§13](../../audits/database-retrieval-architecture-audit.md#13-known-symptom-analysis));
[Phase 0 baseline](./database-retrieval-refactor-baseline.md) shows §12.1 = 0
on the current dataset, so the fix is **preventive**, not reactive — but the
structural cause persists and will fire on any new upload that uses
fuzzy-only matches.

The same pattern affects entities that only show up via
`entity_relationships` (no chunk-level mention exists yet — Phase 4a /
"Soon" S1 fixes that) and orgs that are anchor-only.

## Goals

- When a user asks "what do we know about X" / "before this meeting" / "show
  me Y's history with us", the chat finds **every** interview where X is
  the interviewee, the org of the interviewee, mentioned in a chunk, OR a
  party in any non-rejected `entity_relationships` row — through a single
  retrieval call.
- The fix is structural: `lookupMentions` returns the union, not just the
  textual-mention slice.
- The change is **schema-additive only** — one SECURITY DEFINER function,
  no table change, no column drop, no breaking type change.
- Forward-compatible with Phase 2.1's rename (`interviews → sources`,
  `interview_chunks → source_chunks`): the function references pre-rename
  names; after Phase 2.1 those become back-compat views.

## Non-goals

- No `source_entities` table (Phase 2.2).
- No removal or change of `entity_mentions` / `entity_relationships`.
- No prompt-builder rewrite beyond updating `lookupMentions` copy.
- No multi-result `lookupEntity` (Defer D5).
- No persisted chat citations (Phase 4a).
- No RLS hardening on `entities` / `entity_aliases` (Phase 3a).

## Approach

### Phase 1 / PR 1.1 in three pieces

1. **Migration `00026_entity_intel_rpc.sql`** — a `SECURITY DEFINER`
   function `entity_intel(p_entity_id UUID, p_project_id UUID DEFAULT NULL)`
   returning a UNION ALL of:
   - rows from `entity_mentions JOIN interviews JOIN interview_chunks`
     (today's behaviour, plus chunk content as `evidence` and the
     mention sentiment),
   - rows from `interviews` where `interviewee_entity_id = p_entity_id`
     (`role = 'interviewee'`),
   - rows from `interviews` where `interviewee_org_entity_id = p_entity_id`
     (`role = 'interviewee_org'`),
   - rows from `entity_relationships` where source/target = `p_entity_id`
     **and** `review_status <> 'rejected'` (preserves the editorial
     active-only filter that
     [`relationship-active-filter.test.ts`](../../../src/__tests__/relationship-active-filter.test.ts)
     guards across every active query site).

   Return columns: `(source_id UUID, source_title TEXT, role TEXT, kind
   TEXT, evidence TEXT NULL, chunk_id UUID NULL, sentiment TEXT NULL,
   conducted_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ NOT NULL)`.

   Naming: `role ∈ {mention, interviewee, interviewee_org,
   related_via_relationship}` is the semantic label the chat shows;
   `kind ∈ {mention, anchor, relationship}` is the row's table-of-origin
   for diagnostics and future surface differentiation.

   Grants: `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO service_role,
   authenticated`. The chat uses the service-role admin client today;
   `authenticated` is granted now to keep the function callable from
   non-admin code paths once Phase 3a flips RLS on entity tables.

2. **TypeScript** — extend `Database["public"]["Functions"]` in
   [`src/types/database.ts`](../../../src/types/database.ts) with
   `entity_intel`. Hand-edited (matching the file's existing style; see
   audit §3 — types are not generated here).

3. **Application** — rewrite `getMentions` in
   [`src/lib/ai/entity-lookup.ts`](../../../src/lib/ai/entity-lookup.ts)
   to call the RPC, drop the old direct-table queries, and extend
   `MentionRecord` with `role` + `kind`. The chat tool wrapper
   `lookupMentions` in
   [`src/app/api/chat/route.ts`](../../../src/app/api/chat/route.ts) keeps
   the same input schema; its response now exposes `role` per mention so
   the LLM knows whether the source is "interviewee of" / "mentioned in" /
   "related via" the entity. Update the tool description and the prompt
   copy in
   [`src/lib/chat/prompt-builder.ts`](../../../src/lib/chat/prompt-builder.ts).

### Constraints (sacred patterns preserved)

- **Admin client pattern** — the chat route still uses
  `createAdminClient()` for the RPC call.
- **`token_hash` magic-link auth** — untouched.
- **SECURITY DEFINER RLS helpers** — `entity_intel` itself is `SECURITY
  DEFINER` (sacred pattern), with `SET search_path = public` per the
  rest of the codebase, mirroring `clear_interview_derived_data` in
  [`00013_interview_transcript_review.sql`](../../../supabase/migrations/00013_interview_transcript_review.sql).
- **`stopWhen: stepCountIs(5)` + `tool({inputSchema})`** — untouched in
  the chat tool definition.
- **Similarity threshold `0.25`** — untouched.

### Forward-compat with Phase 2.1

After Phase 2.1 (in-place rename `interviews → sources`,
`interview_chunks → source_chunks`) ships, this function continues to
work without code change because Phase 2.1 also creates back-compat
views named `interviews` and `interview_chunks` over the renamed tables.
PR 2.4 then rewrites the function body to read `source_entities`
directly, but the **callable signature is unchanged**.

## User experience

No new screens, no UI copy change. The visible effect is in chat:

- Before: "I don't have any interviews where Persona X appears" when X is
  the interviewee but the gate dropped fuzzy/anchor matches.
- After: "Persona X is the interviewee of [interview-Y](…); other
  related sources include [interview-Z](…)."

## Technical notes

- **Files to add:**
  - `supabase/migrations/00026_entity_intel_rpc.sql`
  - This spec moves to `docs/features/on-going/` once coding starts (it
    starts at the same time Phase 0 promotes).
- **Files to modify:**
  - `src/lib/ai/entity-lookup.ts` — `getMentions` + `MentionRecord`
  - `src/app/api/chat/route.ts` — `lookupMentions` tool description +
    response shape (adds `role`)
  - `src/lib/chat/prompt-builder.ts` — TOOL USE PRIORITY copy for
    `lookupMentions`
  - `src/types/database.ts` — `entity_intel` function signature
- **Tests** (Vitest, pure-function style — matches repo convention):
  - `src/lib/ai/entity-lookup.test.ts` (new) — mock the RPC at the
    boundary; assert the consumer maps row shapes correctly across
    all four roles.
- **Migration validation** before `supabase db push` (in order):
  1. `npx supabase db push --dry-run --db-url $DATABASE_URL_DIRECT` —
     confirms `00026` is detected as pending.
  2. Transactional dry-run: a small one-off using `pg` runs the
     migration body inside a `BEGIN; … ROLLBACK;` so syntax errors
     surface against the actual remote schema without persisting.
  3. `npx supabase db push` (real apply).
  4. Re-run `scripts/audit/database-baseline.ts` and append a row to
     the cadence table in
     [`database-retrieval-refactor-baseline.md`](./database-retrieval-refactor-baseline.md).

## Dependencies & related docs

- Audit (motivation): [`database-retrieval-architecture-audit.md`](../../audits/database-retrieval-architecture-audit.md)
  — see §1, §3, §13.
- Plan (this is Phase 1 of): [`database-refactor-plan.md`](../../roadmaps/database-refactor-plan.md)
  §3.
- Phase 0 baseline (re-run target): [`database-retrieval-refactor-baseline.md`](./database-retrieval-refactor-baseline.md).
- Sacred patterns: [`HANDOVER.md`](../../../HANDOVER.md) §3 + §7 and
  [`AGENTS.md`](../../../AGENTS.md) §5.

## Risks & open questions

- **Risk: editorial filter regression.** If the relationship branch
  forgets `review_status <> 'rejected'`, rejected relationships leak into
  chat. Mitigated by mirroring the SQL filter that
  [`relationship-active-filter.test.ts`](../../../src/__tests__/relationship-active-filter.test.ts)
  documents and keeping a vitest contract test for the RPC's relationship
  branch.
- **Risk: response-shape change breaks the LLM's tool reasoning.** We add
  `role` to each mention; we keep `interview_title`, `interview_id`,
  `sentiment`, `context` field names. Mitigated by a one-line prompt
  update describing what `role` means.
- **Open question: kind / role redundancy.** Plan §3 lists both columns;
  in practice the chat surface only needs `role`. Keeping both for
  forward-compat with Phase 2.4 (when the RPC reads `source_entities`,
  whose `link_type` enum is richer than the four roles here).
- **Open question: dedup.** An entity can be both interviewee of
  interview X AND mentioned in chunk A of interview X. Phase 1 emits
  both rows; the chat tool de-dups by `(interview_id, role)` precedence
  (`interviewee` > `mention` > `related_via_relationship`) when
  presenting to the LLM. Implementation lives in `getMentions`.

## Acceptance / how to validate

- [x] `supabase/migrations/00026_entity_intel_rpc.sql` applies cleanly
      via `supabase db push` (after `--dry-run` and the transactional
      pre-flight via `scripts/db/migration-dry-run.ts`).
- [x] `entity_intel(p_entity_id, p_project_id)` exists on remote and
      returns `(source_id, source_title, role, kind, evidence, chunk_id,
      sentiment, conducted_at, created_at)`.
- [ ] An entity with `interviewee_entity_id` set on a `COMPLETED`
      interview — and **zero** `entity_mentions` for that interview —
      surfaces a row with `role='interviewee'` from the RPC.
      *(Vitest covers the contract; live verification deferred until a
      new upload populates the FK — see Implementation log 2026-05-05.)*
- [x] The RPC's relationship branch never returns
      `review_status='rejected'` rows (mirrored at the consumer side in
      `src/__tests__/relationship-active-filter.test.ts`; the SQL
      filter `review_status <> 'rejected'` is in
      [`00026_entity_intel_rpc.sql`](../../../supabase/migrations/00026_entity_intel_rpc.sql)).
- [x] Chat tool `lookupMentions` returns the new `role` field per
      mention; existing `sentiment`, `context`, `interview_title`
      fields are unchanged.
- [x] Tests pass: `npm test` (15 files / 125 tests, including
      9 new tests in `src/lib/ai/entity-lookup.test.ts`) and
      `npx tsc --noEmit` — both green.
- [x] Phase 1 cadence row is appended to
      [`database-retrieval-refactor-baseline.md`](./database-retrieval-refactor-baseline.md)
      after the migration is pushed.
- [x] Spec moves to `docs/features/on-going/` with `status: on-going`
      when coding starts; moves to `done/` only after the
      live-verification item above is signed off by the human reviewer.

## Implementation log

- 2026-05-05 — Spec drafted; migration body, type extension, and
  `getMentions` rewrite to follow in the same change set.
- 2026-05-05 — Migration `00026_entity_intel_rpc.sql` written. Validated
  via `scripts/db/migration-dry-run.ts` (transactional `BEGIN; … apply;
  probe; ROLLBACK;` against the live DB). New finding from the probe:
  on this dataset, **no interview has `interviewee_entity_id` or
  `interviewee_org_entity_id` set** (`with_interviewee_fk = 0`,
  `with_org_fk = 0` across all 5 interviews). That's the actual reason
  baseline §12.1 / §12.2 came back 0 — the FKs introduced by `00015` are
  simply not populated by any code path that wrote the existing rows.
  This makes the interviewee branch of the RPC a forward-looking fix:
  it will start firing as soon as a new upload uses the autocomplete
  for `interviewee_entity_id`. The relationship branch is **already
  active**: probing the most-mentioned entity in the DB (94 mentions)
  via `entity_intel` returned 97 rows = 94 `mention` + 3
  `related_via_relationship`. Those 3 rows are net-new chat visibility
  Phase 1 already provides on the current data. RPC pushed via
  `supabase db push`; baseline re-run with no regressions (Phase 1
  cadence row appended in
  [`database-retrieval-refactor-baseline.md`](./database-retrieval-refactor-baseline.md)).

## Live verification report — manual chat tests, 2026-05-06

Three real-entity prompts were run against the live chat (Angola
project, `c624337f-2737-4b54-8520-c1a5f3dec880`). The user logged the
verbatim responses; the analysis below was produced from read-only DB
diagnostics that re-execute `entity_intel(...)` with the same project
scope the chat uses.

### Test 1 — Angola — *PASS, with caveats*

Prompt: "What do we know about Angola? Give me the top 3 organizations
linked to it."

Response (user):

> Angola is navigating a significant economic transition, prominently
> focused on diversifying away from its oil dependence into sectors
> like agriculture, logistics, and digital services. Interviews reveal
> a strong emphasis on enhancing local production to reduce imports,
> alongside the need for improved governance, infrastructure
> development, and partnership with international investors to build
> local capacities. Key challenges include bureaucratic delays and the
> complexity of managing foreign investments amidst a volatile
> economic climate.
>
> Top 3 Organizations Linked to Angola:
>
> ANPG (National Oil, Gas and Biofuels Agency) — Central to Angola's
> oil and gas sector management.
>
> Banco Angolano de Investimentos (BAI) — Plays a strategic role in
> financing and supporting investments in various sectors.
>
> Total Energies — A major player in Angola's energy landscape,
> involved in oil production and investments.

Attribution:
- The top-3 list is plausibly grounded in Phase 1 retrieval: ANPG and
  BAI are real entities in the project with active relationships to
  Angola; **Total Energies is suspect** — diagnostics show no entity
  by that name in the DB and no relationship row connecting it to
  Angola. This is a likely LLM extrapolation, not an `entity_intel`
  finding. See related-finding §6 below.
- Lobito Corridor (the second-strongest structural link to Angola: 11
  mentions + 4 relationships) was correctly omitted because the user
  asked for *organizations* and Lobito Corridor is typed `LOCATION`.
  Type-aware filtering is doing its job here, even when it's
  performed by the LLM rather than the SQL.

### Test 2 — One World Media — *FAIL (not a Phase 1 regression)*

Prompt: "What does the database say about One World Media's role and
relationships?"

Response (user):

> Section 1 — What Aksum Knows
>
> One World Media is a media organization involved in editorial
> processes in both Angola and Mozambique. However, there are no
> specific connections or relationships to other entities noted in
> the database. No interviews or mentions directly referencing One
> World Media have been found, indicating a lack of detailed insights
> into its activities or collaborations.

Root cause (DB-confirmed): there are **two canonical `entities` rows
with `normalized_name = 'one world media'`** in the Angola project,
differing only in `type`:

| id | type | description | rows in `entity_intel(id, angolaProj)` |
|----|------|-------------|----------------------------------------|
| `e5d6c73b-…` | `COMPANY` | "A media organization involved in editorial processes in Angola and Mozambique." | **0 (no mentions, no relationships)** |
| `ce66ccd5-…` | `ORGANIZATION` | "A media organization involved in gathering and disseminating information related to various markets." | **4 = 1 `mention` + 3 `related_via_relationship`** |

`findEntity('One World Media', projectId)` matches exactly on
`(normalized_name, project_id, canonical_entity_id IS NULL)` and
`.limit(1)` — when two rows tie, the one returned is whichever the
planner orders first. In this case the chat picked the **COMPANY**
row, which is a duplicate with zero coverage, so `entity_intel`
correctly returned an empty set. The description shown in the answer
("editorial processes in both Angola and Mozambique") matches the
empty-coverage row, confirming which entity was used.

This is **not a Phase 1 retrieval regression** — `entity_intel` is
behaving exactly as specified. It is a **resolver / data-quality bug**
caused by `entities.UNIQUE(name, type)` allowing two canonical rows
for the same name+project to differ only by type. Phase 2.5 of the
plan (swap `(name, type)` → `(project_id, normalized_name)`)
structurally prevents new occurrences but **does not auto-merge
existing duplicates**.

The same class of duplication exists for **`Banco Angolano de
Investimentos`** — three canonical variants (`COMPANY`,
`ORGANIZATION`, `PUBLIC_INSTITUTION`) in the Angola project. Test 1
got lucky and `findEntity` picked a row with coverage; Test 2 did not.

Audit gap detected: §12.10's probe groups by `(normalized_name, type)`
so **same-name / different-type duplicates score 0** there. We need a
§12.10b probe (group by `normalized_name` only). Tracked under
[`entity-cross-type-deduplication.md`](../to-do/entity-cross-type-deduplication.md).

### Test 3 — AMC — *PARTIAL pass (entity surfaced; data quality questioned)*

The user reports that AMC was extracted from an interview, the name
was later corrected manually, but a meaningful "AMC" entity still
exists. Read-only diagnostics confirm:

- Exactly **one** canonical `entities` row with name `AMC` exists
  (`9eedf8a5-…`, `ORGANIZATION`, project = Angola, description = 92
  chars).
- `entity_intel(amcId, angolaProj)` returns **1 row** with
  `role = 'related_via_relationship'`. So Phase 1's relationship
  branch is the **only** thing connecting AMC to any source on the
  current dataset — without Phase 1, the chat would have shown zero
  evidence for AMC.
- The user's "duplicate" intuition is real but takes a different shape
  than expected: the *correction* created a separate canonical entity
  somewhere (we cannot identify it without knowing the corrected
  name), and the legacy AMC entity stayed behind because there is no
  entity-correction governance flow that demotes / merges / aliases
  the old row. Tracked under
  [`entity-correction-governance.md`](../to-do/entity-correction-governance.md).

This is also **not a Phase 1 retrieval regression** — Phase 1 in fact
made AMC visible at all. The remaining issue is *editorial /
post-correction housekeeping*, which is out of Phase 1 scope.

### Test 4 — Paulino Jerónimo (interviewee) — *FAIL, structural*

Prompt: "Have we ever interviewed Paulino Jerónimo?"

Response (user, paraphrased): "No, we have not."

DB ground truth (read-only diagnostics):

- Interview "Angola 7" (`141b0793-…`, COMPLETED, Angola project) has
  `interviewee_name = 'Paulino Jerónimo'` and
  `interviewee_org = 'ANPG'` set as **plain text**.
- The two FKs added by migration `00015` are **NULL on this row**
  (`interviewee_entity_id IS NULL`, `interviewee_org_entity_id IS
  NULL`). This matches the dataset-wide stat already documented in the
  2026-05-05 implementation log (`with_interviewee_fk = 0` across all
  5 interviews).
- The canonical entity `Paulino Jerónimo` (`1128fb3d-…`, `PERSON`,
  Angola project, decent description: "CEO of ANPG, overseeing
  Angola's energy strategy and investments.") **does** exist.
- However `entity_intel(paulinoId, angolaProj)` returns **0 rows** —
  no mentions, no anchors, no relationships. The persistence gate
  dropped his anchor matches during ingestion (the audit's expected
  pattern P5 / §5.3), so he is a "free-floating" canonical entity
  with no edge to any source on this dataset.

Attribution: this is **the exact case Phase 1's `interviewee` /
`interviewee_org` branches were designed to cover**, but it cannot
fire on the current data because the FKs that branch reads are NULL.
There are two complementary remediations:

1. **Backfill the FKs once.** A small one-off SQL that joins
   `interviews.interviewee_name` (and `interviewee_org`) to
   `entities` by `(project_id, normalized_name)` would activate the
   anchor branch for every existing interview where the entity row
   exists. For Paulino + ANPG this would immediately restore the
   "have we interviewed him?" answer. *Proposed as a sign-off-deferred
   companion migration `00027_backfill_interviewee_fks.sql`; not
   shipped yet pending decision below.*
2. **Make new uploads always populate the FK.** This belongs to the
   upload UX, not Phase 1. Tracked implicitly by Phase 2.2 of the
   plan (source_entities) and by upload-form changes outside the
   refactor scope.

### Per-finding ledger

The user enumerated seven discrete findings; mapping each to scope:

| # | Finding (user wording) | Phase 1 regression? | Where it actually belongs |
|---|------------------------|----------------------|---------------------------|
| 1 | Duplicate / stale AMC after manual correction | **No** — Phase 1 made AMC more visible, not less. | New spec [`entity-correction-governance.md`](../to-do/entity-correction-governance.md). Plus baseline §12.10b gap noted above. |
| 2 | `entities.metadata` is empty across the board (0/56 canonical entities have non-empty metadata; descriptions on 55/56, avg 83 chars). | **No** — `entity_intel` does not read `metadata`. | New spec [`entity-metadata-and-descriptions.md`](../to-do/entity-metadata-and-descriptions.md). Subsumes finding #7. |
| 3 | "Have we interviewed Paulino Jerónimo?" → wrong "no" | **Partial** — Phase 1's anchor branch is correct in SQL but cannot fire because `interviewee_entity_id` is NULL on every existing interview. | Optional companion `00027_backfill_interviewee_fks.sql` *now* (recommended for Phase 1 sign-off); upload-time FK population belongs to a separate upload-UX fix. |
| 4 | Source links rendered as `example.com/…` then `aksum.ai/...` 404 | **No** — chat code emits relative paths `/interviews/{uuid}` (see [`src/app/api/chat/route.ts:349`](../../../src/app/api/chat/route.ts) and [`prompt-builder.ts:128`](../../../src/lib/chat/prompt-builder.ts)). The LLM is hallucinating an absolute host despite the prompt rule. | New spec [`chat-citation-routing.md`](../to-do/chat-citation-routing.md). |
| 5 | Positive observation: AMC was at least related to its interview | **Yes** — direct evidence that Phase 1's `related_via_relationship` branch is doing what we shipped it to do. | Recorded; no follow-up. |
| 6 | Responses feel short | **No** — small dataset (5 interviews, 56 canonical entities) is the dominant cause. The Total Energies hallucination in Test 1 also suggests the LLM extends sparse evidence with prior knowledge rather than refusing. | Out of scope for the refactor; revisit once Phase 2.x grows the substrate. Captured here for visibility. |
| 7 | Description / metadata fields are too thin to leverage at retrieval time | **No** — same root cause as #2. | Folded into [`entity-metadata-and-descriptions.md`](../to-do/entity-metadata-and-descriptions.md). |

### Sign-off question

Two viable paths to closing Phase 1:

- **(a) Sign off as-is.** Phase 1's contract held in every test —
  including the cases that look like failures (Test 2 was a resolver
  bug; Test 4 was a missing FK; both are explicitly out of Phase 1
  scope). Move to Phase 2.1 and queue the four spawned to-do specs.
- **(b) Sign off after a tiny companion migration
  `00027_backfill_interviewee_fks.sql`** that joins
  `interviews.interviewee_name`/`interviewee_org` to `entities` by
  normalized name within the same project. This would un-block the
  Paulino-Jerónimo / ANPG anchor branch on the existing dataset
  *today* and is genuinely the "complete" form of Phase 1 on
  pre-existing rows.

Recommendation: **(b)** — the backfill is read-mostly, idempotent,
and small. It pairs naturally with the 00026 migration as the
"activate anchor branch on legacy rows" companion. Awaiting decision.

## Sign-off

- 2026-05-06 — Phase 1 **signed off as-is** by the human reviewer
  (option (a) in the sign-off question above). Phase 1's contract
  held in every manual test; the failing surfaces (Test 2 dupes,
  Test 4 missing FKs) are explicitly out of scope and tracked under
  the four follow-up specs:
  - [`entity-cross-type-deduplication.md`](../to-do/entity-cross-type-deduplication.md)
  - [`entity-correction-governance.md`](../to-do/entity-correction-governance.md)
  - [`entity-metadata-and-descriptions.md`](../to-do/entity-metadata-and-descriptions.md)
    (folds findings #2 + #7)
  - [`chat-citation-routing.md`](../to-do/chat-citation-routing.md)

  The companion `00027_backfill_interviewee_fks.sql` migration was
  **not** taken in this phase and is not currently planned; if the
  Paulino-Jerónimo / ANPG anchor case re-surfaces in product use,
  reopen as a follow-up.

  Spec moved to `docs/features/done/`. Next refactor phase: **Phase
  2.1** in [`database-refactor-plan.md`](../../roadmaps/database-refactor-plan.md).
