---
title: "Platform users as entities"
status: to-do
owner: team
priority: low
last_updated: 2026-05-10
related_infrastructure:
  - docs/infrastructure/database-schema.md
related_features:
  - docs/features/done/platform-user-roles-authorization.md
  - docs/features/done/source-entities-table-and-backfill.md
---

# Platform users as entities

## Problem

Aksum users — the analysts, editors, and project managers who use the platform — are not first-class entities in the knowledge graph. This creates a gap:

1. If an Aksum user participated in an interview as an interviewer, moderator, or researcher, there is no structured way to link them to sources or entities.
2. The system is unaware of who is logged in at query time. A user asking the Copilot a question gets a generic answer, even though personalizing around their role, their projects, or their known relationships could dramatically improve relevance.
3. Future relationship mapping (e.g. "which contacts does this user already know?", "which entities has this analyst researched?") is impossible without linking users to the entity graph.

## Goals

- When a user is created or their profile is updated, automatically create or link an `entities` row representing them (type: `PERSON`).
- The user's `profiles` row includes a reference to their `entity_id` (or the entity has a reference back to the `profile_id`).
- The Copilot is aware of the logged-in user's identity and can personalize answers by referencing their linked entity (e.g. "as someone who has researched Angola extensively, here are sources you might not have seen yet").
- Users can be tagged as participants in sources (using the multi-participant feature) by selecting their own user entity.

## Non-goals

- Exposing the user-entity link in the public graph (users' entities should be private / profile-scoped by default).
- Automatic relationship inference between user entities and source entities (future enhancement).
- Replacing the `profiles` table with an entity row — `profiles` remains the auth-linked record; the entity is the knowledge-graph record.

## Approach

### Phase 1 — Link profiles to entities

1. Add an `entity_id UUID REFERENCES entities(id)` column to `profiles` (nullable; populated progressively).
2. When a user registers or their profile name is set, create a `PERSON` entity for them (or match an existing one by name if already in the graph) using the admin client.
3. Store the `entity_id` back on `profiles`.

### Phase 2 — Copilot user awareness

1. In the chat route, after resolving the user via `getUser()`, look up the user's `entity_id` from their profile.
2. Inject a brief user context block into the system prompt: name, role, linked projects. Scope it carefully — do not leak data the user shouldn't see.
3. The LLM can then refer to the user by name and tailor responses to their role/project context.

### Phase 3 — User entity in the graph (optional, future)

1. Display the user's own entity card on their profile page with a summary of their graph connections.
2. Allow users to enrich their own entity (add bio, area of expertise) in the settings page.

## Technical notes

- The entity created for a user should be scoped to the user's `tenant_id` (Tier B — `entity.tenant_id` is nullable for global entities, but user entities should be tenant-scoped).
- Matching logic: when creating the user entity, first check if an entity with the user's `normalized_name` and type `PERSON` already exists in the same tenant. If so, link the profile to that entity rather than creating a duplicate.
- Privacy: the user entity row should not be surfaced in the global entity explorer by default. Use a flag or a separate entity sub-type to distinguish internal users from externally-mentioned entities.

## Constraints

- Admin client pattern for the entity creation / profile update (mutation path).
- Do not break existing entity resolution logic — the user-entity is just another `PERSON` entity with a special back-reference to a profile.

## Risks & open questions

- **Name collisions:** a user named "Carlos Matac" may already exist as an entity (if they were mentioned in a source). The matching heuristic must be careful not to create a duplicate.
- **Open question:** should all users automatically get an entity, or only users who opt in (e.g. "Create my entity profile")?
- **Open question:** how does the Copilot user-context block interact with the existing system prompt length and the `stopWhen: stepCountIs(5)` constraint?
- **Open question:** what data about the user is safe to include in the Copilot system prompt vs. sensitive?

## Acceptance / how to validate

- [ ] After setting up a profile, a `PERSON` entity exists in the DB linked to the user's profile.
- [ ] No duplicate entities are created for a user whose name was already in the entity graph.
- [ ] The Copilot system prompt includes the user's name and role when logged in.
- [ ] A user can be tagged as a participant in a source using their linked entity (once the multi-participant feature ships).
