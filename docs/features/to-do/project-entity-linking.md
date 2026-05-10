---
title: "Project-entity direct linking (many-to-many)"
status: to-do
owner: team
priority: medium
last_updated: 2026-05-10
related_infrastructure:
  - docs/infrastructure/database-schema.md
related_features:
  - docs/features/done/source-entities-table-and-backfill.md
---

# Project-entity direct linking (many-to-many)

## Problem

Entities are currently reachable from a project only through the source chain: `projects → sources → source_entities → entities`. There is no direct project-entity link. This means:

1. An entity cannot be explicitly associated with a project unless it appears in at least one source within that project.
2. There is no way to say "this person is relevant to this project" independent of whether they have been interviewed or mentioned in a document.
3. An entity cannot span multiple projects in a structured way — a person who is relevant to both a "West Africa" and an "East Africa" project has no explicit cross-project record; their presence is inferred only through whichever sources happen to mention them.
4. Future analytics (e.g. "which entities are most strategically important to Project X?") are harder to build without an explicit project-entity join table.

## Goals

- Introduce a `project_entities` join table that creates an explicit many-to-many link between `projects` and `entities`.
- An entity can be linked to zero, one, or many projects directly (independently of source mentions).
- A project can have many directly-linked entities.
- The link carries at minimum a `relevance` or `note` field so users can annotate why the entity is relevant to the project.
- An entity can be linked to multiple projects simultaneously (no single-project constraint).

## Non-goals

- Replacing the `source_entities` path — the source-based chain remains the primary pipeline-produced link; `project_entities` is an additional, user-managed or system-inferred layer.
- Automatic population of `project_entities` from `source_entities` (could be a future feature; not in this spec).
- A full UI for managing project-entity links (the initial implementation may be admin-client-only or a minimal inline action in the entity detail page).
- Changing how the Network Explorer renders entities (additive; the graph can optionally highlight directly-linked entities in a future enhancement).

## Approach

### Phase 1 — Schema

1. New table `project_entities`:
   ```sql
   CREATE TABLE project_entities (
     id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     entity_id  UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
     tenant_id  UUID NOT NULL,
     note       TEXT,
     created_by UUID REFERENCES profiles(id),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (project_id, entity_id)
   );
   ```
2. Compound FK `(project_id, tenant_id) → projects(id, tenant_id)` for Phase 3a consistency.
3. RLS: `is_project_member(project_id)` for reads; `is_project_owner(project_id)` or `editor` role for writes.
4. Index on `(project_id)`, `(entity_id)`, `(tenant_id)`.

### Phase 2 — Write path (minimal UI)

1. On the entity detail page, add a "Link to project" action that lets users associate the entity with any project they are a member of, with an optional note.
2. On the project overview page (or a future "Entities" tab), list directly-linked entities alongside source-derived ones.

### Phase 3 — Retrieval integration (future)

1. The `entity_intel` RPC or a new `project_entity_context` RPC can surface `project_entities` rows alongside `source_entities` so the Copilot can use direct project links as additional context.

## Technical notes

- The `note` field is the lightweight equivalent of the `context` field on `source_entities` — it records why this entity is linked to this project.
- `created_by` allows attribution (useful for audit and for future "who linked this?" display).
- Because `entities.tenant_id` is nullable (Tier B), the compound FK must handle the NULL case — use a trigger or a check constraint rather than a compound FK if nullability causes issues.
- Consider whether `project_entities` rows should be scoped by tenant only, or by project membership. The latter is more restrictive and correct for the current multi-tenant model.

## Risks & open questions

- **Scalability of manual linking:** for large entity databases, manual project-entity association does not scale. An auto-suggest ("this entity appears in 5 sources in Project X — link it?") would help but is a future enhancement.
- **Open question:** should an entity automatically be linked to a project when it first appears in a source within that project? This would make the `project_entities` table a denormalized cache of the source chain — useful but creates a maintenance burden (what happens when a source is deleted?).
- **Open question:** is there a notion of "primary project" for an entity, or are all project links equal weight?
- **Open question:** how does this interact with the tenant model? If `entity.tenant_id IS NULL` (global entity), can it be linked to a project in a specific tenant?

## Acceptance / how to validate

- [ ] `project_entities` table exists after migration with the correct schema.
- [ ] A `platform_admin` or project owner can link an entity to a project.
- [ ] The link survives: deleting the source that originally mentioned the entity does not remove the project-entity link.
- [ ] An entity can be linked to multiple projects simultaneously.
- [ ] RLS prevents a user from seeing `project_entities` rows for projects they are not a member of.
