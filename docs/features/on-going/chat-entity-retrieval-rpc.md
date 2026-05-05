---
title: "Chat entity-centered retrieval RPC (Phase 1 / PR 1.1)"
status: on-going
owner: team
priority: high
last_updated: 2026-05-05
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
