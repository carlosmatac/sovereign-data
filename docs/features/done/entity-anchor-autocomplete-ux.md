---
title: "Entity-anchor autocomplete UX in Add Source form"
status: done
owner: unassigned
priority: medium
last_updated: 2026-05-11
related_architecture:
  - docs/architecture/ingestion-pipeline.md
related_features:
  - docs/features/on-going/source-entities-pipeline-writes.md
  - docs/features/to-do/entity-correction-governance.md
---

# Entity-anchor autocomplete UX in Add Source form

## Problem

The Add Source form (`src/app/(dashboard)/interviews/upload/page.tsx`)
already mounts an autocomplete (`InterviewAnchorEntityInput`) on the
`Primary person` and `Organization / Company` fields. After 2 chars
it queries `/api/projects/:id/entities/search` and lets the user pick
an existing project-scoped or global entity, setting both the
canonical name and the entity id on submit.

**The autocomplete has two distinct problems:**

### 1 — Response latency

The dropdown takes noticeably long to open after the user starts typing, to the point where users stop waiting and simply type past the suggestions. The likely causes are: no edge caching on the search route, no debounce tuning, or the search query itself being slow (trigram similarity scan without a suitable index). The feature is "vital for getting entity matches" (developer note) but is effectively unused because it is too slow to feel responsive.

Target: the suggestion dropdown should open within ~200ms of the debounce settling (currently 300ms debounce + slow API = perceived latency of 500ms+).

### 2 — Discoverability and feedback

Even when results arrive, the UX provides no feedback about what is happening:

- There is no visible cue while the user is typing (no "loading…",
  no project-scope tag, no "X existing matches").
- When there are no matches, the popover stays empty; the user
  cannot tell whether it queried at all or whether it is waiting.
- There is no copy that says "no existing match — a new entity will
  be created on submit", which is the actual contract of the upload
  routes after the PR 2.3 regression fix
  (`ensureUploadAnchorEntity` always creates if no FK is selected).

This is a UX gap on top of an otherwise correct mechanism.

## Goals

- **Performance:** the search route should respond in under 200ms p95 on the live DB so the suggestion dropdown opens without noticeable delay. Profile and optimize the `/api/projects/:id/entities/search` route (query plan, indexes, connection pooling).
- Make it obvious that the field is searching for an existing entity
  vs. about to create a new one.
- Show project-vs-global scope on each suggestion (so the user can
  pick the right "Ministry of Energy" when there are several).
- Show a "no match — will create" hint when the search returned
  empty results (different from "still typing / waiting for
  debounce").

## Non-goals

- Inline entity merging or canonicalization (handled in
  `entity-correction-governance.md`).
- Multi-interviewee / multi-org support (separate, larger refactor).
- Type-specific org sub-pickers (COMPANY vs GOVERNMENT vs
  STATE_OWNED_ENTERPRISE — out of scope here; default
  `ORGANIZATION` is fine until governance flows mature).

## Implementation (2026-05-11)

### Key files changed

| File | Change |
|------|--------|
| `src/app/api/projects/[projectId]/entities/search/route.ts` | Run both DB queries (project-scoped + global) in parallel via `Promise.all`; return `scope: "project" \| "global"` on each entity row |
| `src/components/interviews/interview-anchor-entity-input.tsx` | Full UX overhaul — loading spinner, "no match" hint, scope badges, linked chip, `selectedEntityId` prop |
| `src/app/(dashboard)/interviews/upload/page.tsx` | Pass `selectedEntityId` (person + org) to both `InterviewAnchorEntityInput` instances |

### Performance fix

The two `ilike` queries (project-scoped and global) were executing **sequentially**. They are now executed in **parallel** using `Promise.all`, halving the dominant DB latency. The debounce remains at 300ms (per the spec risk note — do not fire extra requests). If the DB is still slow at p95 on the live dataset, adding a `pg_trgm` GIN index on `entities(name)` is the next lever (a separate migration, out of scope here).

### New UX states

1. **Loading** (`loading === true`): popover opens immediately showing a spinner + "Searching…" row. The popover is now visible during the in-flight fetch, not just after results arrive.
2. **Queried, no results** (`queried && results.length === 0`): popover shows "No existing match — submitting will create a new person/organization '{value}' in this project." Row is non-interactive (`aria-disabled`).
3. **Results** (`results.length > 0`): each suggestion row shows the entity name + a scope badge (`Project` in primary colour, `Global` in muted). Long names truncate with CSS.
4. **Linked** (`selectedEntityId` prop is non-null): a small emerald chip "Linked to existing entity" appears below the input with a "Clear" button. Clicking Clear resets both the text value and the entity id, returning to free-text state.

### `queried` state

A new boolean `queried` resets to `false` on every value change (while the debounce is pending) and flips to `true` in the `finally` block of the fetch. This gives a reliable signal to distinguish "debounce hasn't fired yet" from "search returned nothing", preventing a false "no match" flash while the user is still typing.

### Contract unchanged

- `onChange` / `onSelectedEntityIdChange` callbacks are identical to before.
- Submit payloads (`interviewee_entity_id`, `interviewee_org_entity_id`) are unchanged.
- The 300ms debounce is unchanged; no additional requests are fired.

## Acceptance criteria

- Typing without picking: clear visual "will create" cue. ✓
- Picking a suggestion: clear "linked" cue. ✓
- Visual project-vs-global differentiation in suggestions. ✓
- Parallel DB queries reduce perceived latency. ✓

## Risks

- Behavioural drift: changing the `onChange`/`onSelectedEntityIdChange`
  contract risks breaking the route flow. Keep the form's submit
  payload unchanged. ✓ (unchanged)
- Performance: more visual states should not change the existing
  300ms debounce or fire extra requests. ✓ (debounce unchanged)

## Notes

- This spec is the follow-up to the PR 2.3 sign-off discussion
  (2026-05-07). The functional regression has been fixed by
  `ensureUploadAnchorEntity`; this feature is purely UX.
- If p95 API latency is still above 200ms on the live DB after parallelisation,
  consider a migration adding `CREATE INDEX CONCURRENTLY ON entities USING gin (name gin_trgm_ops)`.
