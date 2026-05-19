---
title: "Knowledge Library — Organized Source Browser"
status: to-do
owner: team
priority: medium
last_updated: 2026-05-18
related_architecture:
  - docs/architecture/ingestion-pipeline.md
related_infrastructure:
  - docs/infrastructure/database-schema.md
---

# Knowledge Library — Organized Source Browser

## Problem

The Knowledge page is a flat, unbounded list of all sources. As the number of interviews, documents, notes, reports, and emails grows across projects, this layout becomes unusable:

- No way to filter by source type, project, status, topic, entity, or date.
- No search within the source list.
- No pagination or bounded scrolling — the list grows infinitely.
- Cross-project sources are mixed together with no visual grouping.
- Importance and relevance signals are ignored in presentation order.

The page needs to become a proper knowledge library, not a dump.

## Goals

- Users can filter the source list by: source type, project, processing status, topic tag, entity, and date range.
- The list is bounded: pagination or virtual scroll — no infinite DOM growth.
- A search input filters sources by title, summary, or transcript content.
- The default sort is recency; users can switch to relevance or source type.
- The experience works for 10 sources and for 1,000 sources without layout degradation.

## Non-goals

- Semantic search across source content is handled by the Copilot, not this page.
- Source editing or re-processing is out of scope (handled by existing source detail flow).
- Saved collections / smart folders are out of scope for this iteration (see `chat-scope-selection.md` for related concept).
- Mobile-optimised layout is a lower priority but should not regress.

## Approach

### Phase 1 — Filter bar + bounded list

Replace the flat list with a filter bar at the top and a paginated/scrollable card grid below:

1. **Filter controls**: source type (multi-select), project (multi-select if global view), status (pending / processing / done / failed), date range picker.
2. **Search input**: client-side filter on source title and summary; server-side full-text if needed.
3. **Pagination**: 20–30 items per page with prev/next controls, or an infinite-scroll with a hard cap and a "load more" trigger.
4. **Card redesign**: each card should show title, source type badge, project name, processing status, date, and a short summary excerpt. Cards have a fixed height — no variable-height blowout.

### Phase 2 — Entity and topic filters

Once Phase 1 is stable:

1. **Entity filter**: multi-select of entities present in sources (join through `source_entities`).
2. **Topic filter**: if topic tags are stored on sources, surface them as a filter chip group.
3. **Sort by relevance**: add a sort option that ranks by source importance signal (if available) or defaults to recency.

### Constraints

- All data fetching uses the admin client pattern for any mutations; reads may use the anon client with RLS.
- Do not change the underlying `interviews` table schema in Phase 1.
- UI tokens and dark theme must stay consistent with `globals.css` and `app-theme-provider.tsx`.

## User experience

- The filter bar is sticky or docked at the top of the source list — users should not scroll past it.
- Active filters are shown as dismissible chips so users know what is applied.
- Empty state: when filters match nothing, show a helpful message and a "clear filters" action.
- Loading state: skeleton cards, not a full-page spinner.
- Roles: all roles (owner / editor / viewer) see the same library UI; editing actions remain gated by role.

## Technical notes

- Sources live in the `interviews` table (name is legacy from audio-first origins, now multi-type).
- Filtering by entity requires a join through `source_entities`.
- Consider URL-searchparams to make filters bookmarkable and shareable.
- Pagination can be implemented with Supabase `.range()` and a count query, or with cursor-based pagination.
- The filter state should be managed with `useSearchParams` / `router.push` for bookmarkability, or local `useState` if simpler for Phase 1.

## Dependencies & related docs

- `docs/infrastructure/database-schema.md` — `interviews` and `source_entities` table schemas.
- `docs/features/to-do/chat-scope-selection.md` — related concept of scoping knowledge for Copilot.

## Risks & open questions

- Should this page be cross-project (all sources the user can see) or project-scoped (sources within a selected project)? Currently the Knowledge page is scoped — confirm intended scope before building filters.
- Are "topic tags" a first-class field on `interviews`, or must they be derived from extraction? Needs schema check before implementing the topic filter.
- What is the importance/relevance signal for sort-by-relevance? Not yet defined — defer to Phase 2.

## Acceptance / how to validate

- Open the Knowledge page with 50+ sources across 3+ projects. The page loads without visible layout degradation.
- Apply a source type filter — only sources of that type are shown.
- Apply a project filter — only sources from that project are shown.
- Type in the search box — the list filters in real time (or near real time) by title/summary.
- Navigate to page 2 of results and back to page 1 — URL reflects the page state.
- Clear all filters — full list returns.
- A project with zero sources matching the active filter shows an empty state message.
