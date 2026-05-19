---
title: "Entity Autocomplete — Fix Misleading Scope Label"
status: to-do
owner: team
priority: low
last_updated: 2026-05-18
related_architecture: []
related_infrastructure: []
---

# Entity Autocomplete — Fix Misleading Scope Label

## Problem

In the Add Source form, the entity autocomplete suggestion rows always display `Project` as the label regardless of the entity's actual type. This is misleading: `Project` is the entity's scope (which project it belongs to), not its type (Person, Company, Government, Country, etc.).

A user searching for a CEO autocomplete result and seeing `Project` labelled next to every suggestion has no useful information to distinguish between candidates.

## Goals

- Each autocomplete suggestion shows the entity's real type (e.g. `Person`, `Company`, `Government`, `Country`).
- The label is visually distinct (a small badge or chip, not inline text that blends with the entity name).
- Optionally: if the entity is project-scoped vs. global, this can be shown separately — but it must not replace the type label.

## Non-goals

- Changing the autocomplete search logic or ranking is out of scope.
- Adding new entity types is out of scope.
- Redesigning the Add Source form beyond this label fix is out of scope.

## Approach

This is a small, self-contained UI fix:

1. Locate the autocomplete component used in the Add Source form (likely a Combobox or Popover in `src/components/` or `src/app/(dashboard)/`).
2. Find where each suggestion item is rendered. Identify the prop or field that is currently rendering the `Project` label.
3. Replace with the entity's `type` field (already present on the entity object).
4. Style the type as a badge (use the existing Shadcn badge component or a similar chip) so it is visually secondary to the entity name.
5. If scope (project-scoped vs. global) is also relevant to display, show it as a separate, lower-prominence label — clearly different from the type badge.

### Constraints

- No backend changes required — the entity `type` field is already available in the query response.
- Dark theme must be respected; badge colours should use existing Tailwind tokens from `globals.css`.

## Technical notes

- The Add Source form likely lives under `src/app/(dashboard)/` — search for the `Combobox` or autocomplete component that renders entity suggestions.
- Entity type values are likely `PERSON`, `COMPANY`, `GOVERNMENT`, `COUNTRY`, or similar — check the `entities` table schema or TypeScript types for the exhaustive list.
- Consider mapping type values to display labels (e.g. `PERSON` → `Person`) and a colour token per type for quick visual scanning.

## Dependencies & related docs

- No architecture or infrastructure docs needed for this fix.
- Related entity form patterns may exist in `docs/features/done/human-in-the-loop.md` (Entity Editor).

## Risks & open questions

- What does the current `Project` label actually render? Is it the project name or literally the word "Project"? Needs a quick code read to confirm before fixing.
- Are there other places in the UI (e.g. Network Explorer entity list, Reports) where the same misleading label appears? If so, fix them in the same PR.

## Acceptance / how to validate

- Open the Add Source form and type a partial entity name in the participant autocomplete.
- Each suggestion shows the entity name and a badge displaying its real type (e.g. `Person`, `Company`).
- The badge does not say `Project`.
- Two entities of different types are visually distinguishable at a glance in the dropdown list.
- The dark theme is respected — badge colours are legible on the dark background.
