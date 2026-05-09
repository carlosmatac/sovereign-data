---
title: "Phase 3b — Reprocess transactional swap"
status: on-going
owner: agent
priority: high
last_updated: 2026-05-09
migrations:
  - 00035_replace_source_derived_data.sql
  - 00036_refresh_backcompat_views.sql      (hotfix — stale views after 00033)
  - 00037_drop_duplicate_fks.sql            (hotfix — PostgREST FK ambiguity)
  - 00038_fix_replace_source_derived_data_search_path.sql (hotfix — vector type)
related_architecture:
  - docs/architecture/ingestion-pipeline.md
related_features:
  - docs/features/on-going/tenants-rls-and-customization.md
related_roadmap:
  - docs/roadmaps/database-refactor-plan.md (§5 Phase 3b)
---

# Phase 3b — Reviewed-reprocess transactional swap

## Problem

`reprocessInterviewFromReview` in `src/lib/ai/pipeline.ts` clears derived
data and re-inserts it in two separate operations:

```
1. compute all new data in memory (chunks + embeddings + entities + mentions + relationships + snippets)
2. rpc clear_source_derived_data(sourceId)   ← old data gone
3. insert source_chunks in batches of 50     ← can fail here
4. insert entity_mentions in batches
5. insert entity_relationships
6. insert content_snippets
```

If step 3–5 fail after step 2, the source ends up with `status=FAILED` and
**no derived rows at all** — zero chunks, zero mentions, zero relationships.
The source's `transcript_review_status` is left as `reprocessing` with no
path to recovery except re-triggering the review reprocess from scratch.

This is a known gap documented in the architecture audit (§5.4).

## Goal

Replace the clear + N-insert pattern with a single `SECURITY DEFINER`
Postgres function `replace_source_derived_data` that executes the DELETE and
all INSERTs inside **one transaction**. If any INSERT fails, the DELETE also
rolls back — the original derived layer remains intact.

## Non-goals

- Changing the pipeline compute logic (embeddings, entity resolution, grounding)
- Changing the `clear_source_derived_data` function (kept for other callers)
- Transactional safety for the *first* ingest (no existing derived data to preserve)
- Including `content_snippets` in the transactional payload — snippets are
  generated post-atomically by `generateContentSnippets()` (best-effort; the
  DELETE inside the function clears the old ones first)

## Design

### SQL function (migration 00035, patched by 00038)

```sql
replace_source_derived_data(
  p_source_id     uuid,
  p_chunks        jsonb,   -- array of chunk objects (see §Payload schema below)
  p_mentions      jsonb,   -- array of mention objects
  p_relationships jsonb    -- array of relationship objects (pending LLM only)
) RETURNS void
SECURITY DEFINER
SET search_path = public, extensions   -- extensions needed for ::vector cast
```

The function runs in a single implicit PL/pgSQL transaction:
1. Resolves `tenant_id` from `sources` (errors if source not found)
2. Deletes pending LLM `entity_relationships` for the source
3. Deletes all `entity_mentions` for the source
4. Deletes all `source_chunks` for the source
5. Deletes all `content_snippets` for the source
6. Deletes `source_entities` rows with `origin = 'extraction'`
7. Inserts all new chunks — embedding JSON string is cast inline via `::vector`
8. Inserts all new mentions (`ON CONFLICT DO NOTHING`)
9. Inserts all new relationships (`ON CONFLICT DO NOTHING` to protect editorial rows)

`content_snippets` are NOT re-inserted here. `generateContentSnippets()` runs
after the RPC returns and regenerates them (best-effort, non-transactional).

### JSONB payload schema

#### `p_chunks` element
```json
{
  "id": "uuid",
  "chunk_index": 0,
  "content": "raw text",
  "speaker": "Speaker A",
  "start_time": 12.5,
  "end_time": 34.1,
  "embedding": "[0.1, 0.2, ...]",   // JSON.stringify'd float array — TEXT, not array
  "metadata": { ... }
}
```

> **Implementation note:** `embedding` is passed as a **JSON string** (the result
> of `JSON.stringify(float[])` in TypeScript), not a JSON array. The SQL function
> uses `->>` (text extraction) to get the string, then `::vector` to cast it.
> This keeps the embedding out of the JSONB object graph and avoids a
> float-array round-trip through JSONB.

#### `p_mentions` element
```json
{
  "id": "uuid",
  "entity_id": "uuid",
  "chunk_id": "uuid or null",
  "context": "text excerpt or null",
  "sentiment": "positive / negative / neutral / null"
}
```

#### `p_relationships` element
```json
{
  "id": "uuid",
  "source_entity_id": "uuid",
  "target_entity_id": "uuid",
  "relation_type": "works_for",
  "confidence": 0.9,
  "evidence_text": "quoted text or null"
}
```

### TypeScript call site (`pipeline.ts`)

```typescript
const { error: rpcError } = await supabase.rpc("replace_source_derived_data", {
  p_source_id:     interviewId,
  p_chunks:        chunksPayload,        // unknown[] — passed directly, NO JSON.stringify
  p_mentions:      mentionsPayload,
  p_relationships: relationshipsPayload,
});
```

Payloads are plain JavaScript arrays. The Supabase JS client serialises them
to JSON when building the HTTP body; PostgREST passes them through as JSONB
arrays. **Do not wrap in `JSON.stringify()`** — that causes double-serialisation
and Postgres receives a JSONB string scalar instead of an array.

### database.ts type declaration

```typescript
replace_source_derived_data: {
  Args: {
    p_source_id:     string;
    p_chunks:        unknown[];   // JSONB array — NOT string
    p_mentions:      unknown[];
    p_relationships: unknown[];
  };
  Returns: undefined;
};
```

---

## Post-deployment incidents (2026-05-08 — 2026-05-09)

Three separate errors appeared when the first real reprocess was attempted
after Phase 3a + Phase 3b migrations were applied. Each was a distinct bug
that revealed the next only after the previous was fixed.

---

### Incident 1 — `more than one relationship was found for 'interviews' and 'projects'`

**What failed:** Every query that used PostgREST relationship embedding syntax
(e.g. `from("interviews").select("..., projects(country)")`) was rejected at
the API layer. This broke the initial source fetch in `reprocessInterviewFromReview`
with a misleading "Interview not found" error, and also made the `/interviews`
list page return empty results (silently — HTTP 200, zero rows).

**Root cause:** Migration 00033 (`tenant_id_everywhere`) added compound FKs
of the form `(project_id, tenant_id) REFERENCES projects(id, tenant_id)` on
every child table. The original single-column FKs from those same tables to the
same parent tables were never dropped. PostgREST found two FK paths from
`sources` to `projects` (and from every other child to its parent) and refused
to choose one — it requires exactly one unambiguous path for `table(column)`
embedding syntax.

**Fix (migration 00037):** Dropped the 11 redundant original single-column FKs.
The compound FKs remain; they are strictly stronger (they enforce both the
parent reference AND tenant consistency), so referential integrity is fully
maintained.

**Brittleness check:** Clean. No workaround. The compound FK is the correct
FK to keep; the original single-column FK was redundant from the moment the
compound FK was added.

**Verification:**
```sql
-- Should return exactly one FK per (table_name, ref_table) pair
SELECT table_name, constraint_name, ccu.table_name AS ref_table
FROM information_schema.table_constraints tc
JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
JOIN information_schema.key_column_usage ccu ON rc.unique_constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
  AND tc.table_name IN ('sources','source_chunks','entity_mentions','entity_relationships',
                        'project_members','reports','chat_messages')
GROUP BY table_name, constraint_name, ccu.table_name
ORDER BY table_name, ccu.table_name;
-- sources → projects: only sources_project_tenant_fkey
-- source_chunks → sources: only source_chunks_source_tenant_fkey
-- etc.
```

**Follow-up risk:** None for this specific bug. However, the `interviews`
back-compat view (see §Technical debt below) was the query surface that made
this error appear as "Interview not found" instead of a more informative
message. The view itself was also stale — see Incident 2.

---

### Incident 2 — `type "vector" does not exist`

**What failed:** `replace_source_derived_data` threw on the first chunk INSERT
because the `::vector` cast failed.

**Root cause:** The function was defined with `SET search_path = public`, which
is the SECURITY DEFINER sacred pattern from HANDOVER.md. However, the `vector`
type (from `pgvector`) is installed in the `extensions` schema, not `public`.
With only `public` in the search path, Postgres cannot resolve the type name.

**Fix (migration 00038):** Changed `SET search_path = public` to
`SET search_path = public, extensions` in the function definition.
The `public` schema remains first, preserving the SECURITY DEFINER security
intent. The `extensions` schema is read-only from within the function.

The source migration 00035 was also updated to match so local replays are
consistent.

**Brittleness check:** Clean. Adding `extensions` to the search path is the
standard fix for this class of problem in Supabase. It does not weaken the
SECURITY DEFINER isolation — the function cannot modify the `extensions`
schema, it can only resolve type names from it.

**Verification:**
```sql
SELECT proname, proconfig
FROM pg_proc
WHERE proname = 'replace_source_derived_data'
  AND pronamespace = 'public'::regnamespace;
-- proconfig should include: "search_path=public, extensions"
```

---

### Incident 3 — `cannot extract elements from a scalar`

**What failed:** `jsonb_array_elements()` inside `replace_source_derived_data`
received a JSONB string value (`"[{...}]"`) instead of a JSONB array (`[{...}]`).
Every reprocess attempt failed with this error after Incident 2 was fixed.

**Root cause (two-layer):**

1. The `database.ts` type declaration for the RPC typed `p_chunks`,
   `p_mentions`, and `p_relationships` as `string` instead of `unknown[]`.
2. Because the type said `string`, the implementation wrapped each payload in
   `JSON.stringify()` before passing it to `supabase.rpc()`.
3. The Supabase JS client then JSON-serialised the whole request body. A
   JavaScript string containing a JSON array serialises to a JSON string
   literal — i.e. `"\"[{...}]\""`. Postgres received a JSONB string scalar.

`JSON.stringify(array)` → JS string → second JSON serialisation →
JSONB string scalar. The type definition was the original sin.

**Fix:** Removed `JSON.stringify()` from the three payload arguments in
`pipeline.ts`. Passed the JS arrays directly. Changed the type declaration in
`database.ts` from `string` to `unknown[]`. Updated two tests that used
`JSON.parse()` on the call args to assert the arrays directly.

**Brittleness check:** Clean. Passing arrays directly is the correct contract.
The only remaining "string inside the array" is the `embedding` field on each
chunk element — that one is intentionally a string because it is the output of
`JSON.stringify(float[])` and the SQL function extracts it with `->>` before
casting to `::vector`. This is documented in the payload schema above and
tested by the `chunk payload carries pre-assigned UUID and serialised embedding`
test.

**Verification:** Run a review reprocess from the UI; check the terminal
for `Pipeline completed for interview ...` with chunk and entity counts.

---

## Acceptance criteria

- [x] Migration 00035 applied to remote
- [x] Migration 00036 applied to remote (back-compat view refresh)
- [x] Migration 00037 applied to remote (duplicate FK removal)
- [x] Migration 00038 applied to remote (search_path fix)
- [x] `npx tsc --noEmit` clean — 0 errors
- [x] `npm test` — all pipeline tests pass (5 Phase 3b tests, 4 smoke tests)
- [x] Test: `replace_source_derived_data` throws → `status=FAILED`,
      `transcript_review_status` reset to `ready`
- [x] Test: first-ingest path does NOT call `replace_source_derived_data`
- [x] Test: chunk payload carries pre-assigned UUID + serialised embedding string
- [ ] **Smoke (manual):** trigger a review reprocess from the UI; confirm
      `status=COMPLETED`, entities and chunks visible in the app

---

## Technical debt

### TD-1 — `interviews` back-compat view used by 28 source files

The `interviews` view (`SELECT * FROM sources`) was created in migration 00027
as a transition shim. It is marked `DEPRECATED` in its SQL comment. As of
2026-05-09, **28 source files** still read from `from("interviews")` or
`from("interview_chunks")` instead of `from("sources")` / `from("source_chunks")`.

The view has caused two production incidents:
- Migration 00033 added `tenant_id` to `sources`, but Postgres did not
  auto-expand the view's `SELECT *` capture — required hotfix migration 00036.
- Any future `ALTER TABLE sources ADD COLUMN` will repeat this pattern.

**Risk:** Medium. Each new column on `sources` or `source_chunks` requires a
companion view-refresh migration or the view silently lags behind.

**Recommended fix:** Migrate all 28 read callers to `sources` / `source_chunks`
directly, then drop the views. This is a safe, mechanical refactor but touches
many files; it should be a dedicated PR, not done opportunistically.

**Files:** see `grep -r 'from("interviews")' src/` for the full list.

### TD-2 — `interview_chunks` view aliases `source_id` as `interview_id`

The `interview_chunks` view exposes the column as `interview_id` for legacy
callers that predate the rename. Any caller reading `interview_id` from
`interview_chunks` is silently reading the `source_id` column. This is
intentional back-compat but hides the real column name.

**Risk:** Low until the view is dropped. Tracked as part of TD-1.

### TD-3 — Feature spec incorrectly described `p_snippets` as a 4th parameter

The original design doc for Phase 3b included `p_snippets` as a 4th JSONB
parameter. The implementation deliberately excluded it — snippets are
regenerated post-atomically by `generateContentSnippets()`. The spec has been
corrected in this pass.

**Risk:** None (corrected). Noted here because the mismatch existed between spec
and implementation for ~1 day.

---

## Files touched

| File | Change |
|------|--------|
| `supabase/migrations/00035_replace_source_derived_data.sql` | New function; search_path corrected to include extensions |
| `supabase/migrations/00036_refresh_backcompat_views.sql` | Refresh stale back-compat views after 00033 |
| `supabase/migrations/00037_drop_duplicate_fks.sql` | Drop 11 redundant single-column FKs |
| `supabase/migrations/00038_fix_replace_source_derived_data_search_path.sql` | Applies the search_path correction to remote |
| `src/lib/ai/pipeline.ts` | Pass payloads as arrays; remove JSON.stringify |
| `src/types/database.ts` | Fix RPC type: string → unknown[] for JSONB params |
| `src/__tests__/pipeline-reprocess-txn.test.ts` | Fix two tests that asserted JSON string args |
| `docs/features/on-going/reprocess-transactional-swap.md` | This file — postmortem + debt |
