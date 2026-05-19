---
title: "User-Created Entities and Relationships"
status: to-do
owner: team
priority: low
last_updated: 2026-05-18
related_architecture:
  - docs/architecture/ingestion-pipeline.md
related_infrastructure:
  - docs/infrastructure/database-schema.md
---

# User-Created Entities and Relationships

## Problem

The platform currently relies entirely on LLM extraction and anchor matching to build the entity graph. Users have no way to:

- Add an entity the LLM missed.
- Correct a missing or wrong relationship.
- Record a known relationship that is not stated explicitly in any source (e.g. an informal connection known to the analyst).
- Prepare entities before uploading a source.

As a result, gaps in LLM extraction are invisible and unrecoverable without re-ingesting the source.

The existing Entity Editor (shipped, in `docs/features/done/human-in-the-loop.md`) handles alias corrections, but not creation of new entities or relationships from scratch.

## Goals

- Owners and editors can create a new entity from the UI (name, type, description, optional aliases).
- Owners and editors can create a relationship between any two existing entities (type, direction, optional evidence note).
- Manually created entities and relationships are clearly distinguished from LLM-extracted ones via an `origin` field.
- Manual relationships can optionally be linked to a source or chunk as evidence.
- The feature is non-destructive: it does not alter or remove existing extraction data.

## Non-goals

- Bulk import of entities or relationships (e.g. CSV upload) is out of scope.
- Admin-level overrides that bypass team-scoped access control are out of scope.
- Automated suggestions for what entities or relationships to create are out of scope.
- This feature does not replace the LLM extraction step — it is a correction layer on top.

## Approach

This should be built as a **governance/review feature**, not a quick inline action. The surface area should be a dedicated review UI, not a popover on the graph.

### Phase 1 — Manual entity creation

1. Add a "Create entity" action on the Entities page (owner/editor only).
2. A form collects: name, entity type (from the existing taxonomy), description, aliases.
3. On submit, write to the `entities` table with `origin: 'manual'` and the creating user's ID.
4. The new entity is immediately available in source upload autocomplete and the Network Explorer.

### Phase 2 — Manual relationship creation

1. Add a "Create relationship" action on the entity detail page or Network Explorer (owner/editor only).
2. A form collects: source entity, target entity, relationship type (from the taxonomy), direction, evidence note (free text), optional source link.
3. On submit, write to `entity_relationships` with `origin: 'manual'`, confidence `1.0`, and the creating user's ID.
4. Optionally link to a `source_id` or `chunk_id` as evidence grounding.

### Phase 3 — Review queue (future)

- Flag manual entries for periodic review so stale or incorrect manual data does not accumulate silently.
- Allow owners to promote manual data to "verified" or delete it.

### Constraints

- All writes use the admin client pattern (HANDOVER.md §3).
- RLS: only project members with owner or editor role may create. Viewers may not.
- `origin` field must be added to `entities` and `entity_relationships` tables via a migration if not already present. Check schema first.

## User experience

- Creating an entity: accessible from Entities list page → "New entity" button → modal or dedicated page.
- Creating a relationship: accessible from entity detail page → "Add relationship" button → modal with entity search autocomplete.
- Manual items are marked with a badge (e.g. "Manual") in the entity list and graph to distinguish them from extracted data.
- Confirmation prompt before creating to prevent accidental duplicates (show existing entities with similar names before submitting).

## Technical notes

- Check `docs/infrastructure/database-schema.md` for whether `origin` already exists on `entity_relationships`; the ingestion pipeline may already set it.
- The entity autocomplete used in the source upload form can be reused for the relationship creation form.
- Consider a uniqueness guard: before inserting a manual entity, check for an existing entity with the same name and type in the same project.

## Dependencies & related docs

- `docs/features/done/human-in-the-loop.md` — existing Entity Editor (alias corrections); this feature extends rather than replaces it.
- `docs/features/to-do/entity-relationship-extraction.md` — LLM extraction improvements; manual creation is the correction layer on top.
- `docs/infrastructure/database-schema.md` — `entities`, `entity_relationships` table definitions.

## Risks & open questions

- Do manually created relationships require evidence (a source or chunk link)? If evidence is optional, low-quality relationships may accumulate. Recommend making evidence strongly encouraged but not required in Phase 2.
- Should manual entities be project-scoped or global? Likely project-scoped to match the existing entity ownership model.
- Can a viewer propose an entity (for owner approval) rather than directly create one? This governance model is more complex — defer to Phase 3.
- Should manual data feed back into future LLM extraction as few-shot examples or training signal? Interesting but out of scope for this iteration.

## Acceptance / how to validate

- As an editor, open the Entities page and create a new entity with name, type, and description. The entity appears in the list with a "Manual" badge.
- The new entity is available in the source upload participant autocomplete.
- As an editor, open the entity detail page and add a relationship to another entity. The relationship appears in the Network Explorer with the correct direction and type.
- As a viewer, the "Create entity" and "Add relationship" actions are not visible or are disabled.
- Manually created relationship rows in `entity_relationships` have `origin = 'manual'` and `confidence = 1.0`.
- LLM-extracted entities and relationships are unaffected by the new UI.
