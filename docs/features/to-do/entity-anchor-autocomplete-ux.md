---
title: "Entity-anchor autocomplete UX in Add Source form"
status: to-do
owner: unassigned
priority: medium
last_updated: 2026-05-07
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

**The autocomplete works, but it is not discoverable.** During
manual smoke testing, the user did not realize it was active because:

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

## Approach (sketch — refine before implementing)

1. **Loading state.** While the debounced fetch is in flight, render
   a small spinner inside the popover (or right-aligned inside the
   input).
2. **Empty-but-queried state.** If the fetch returned but
   `results.length === 0`, render a `<li role="option">` row that
   says e.g. *"No existing match — submitting will create
   {kind} '{value}' in this project."* It's not selectable, but
   visible.
3. **Project-vs-global tag.** Each suggestion row gets a small badge
   (`Project` / `Global`) so the user knows the scope. The search
   API already returns enough for this — extend the response if not.
4. **Selected-state affordance.** When a suggestion is picked, show
   a subtle indicator on the input ("Linked to existing entity"
   chip with a clear ✕ to revert to a free-text/will-create state).

## Acceptance criteria

- Typing without picking: clear visual "will create" cue.
- Picking a suggestion: clear "linked" cue.
- Visual project-vs-global differentiation in suggestions.
- Tested via Playwright/RTL on the Add Source page in all three
  source types.

## Risks

- Behavioural drift: changing the `onChange`/`onSelectedEntityIdChange`
  contract risks breaking the route flow. Keep the form's submit
  payload unchanged.
- Performance: more visual states should not change the existing
  300ms debounce or fire extra requests.

## Notes

- This spec is the follow-up to the PR 2.3 sign-off discussion
  (2026-05-07). The functional regression has been fixed by
  `ensureUploadAnchorEntity`; this feature is purely UX.
