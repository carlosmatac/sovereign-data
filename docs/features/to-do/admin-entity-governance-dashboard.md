---
title: "Admin entity governance dashboard"
status: to-do
owner: team
priority: high
last_updated: 2026-03-22
related_architecture:
  - docs/architecture/ingestion-pipeline.md
related_infrastructure:
  - docs/infrastructure/database-schema.md
---

# Admin entity governance dashboard

## Problem

The knowledge base is built from **extracted and resolved entities** (`entities`, aliases, mentions, relationships). Real-world facts change: **leadership**, company names, org structure, etc. Example: the **CEO of Endesa** changes; analysts still need the **canonical entity** to reflect reality for search, graph, and reports.

Today, **human-in-the-loop** corrections are anchored in **interview context** via the Entity Editor ([`../done/human-in-the-loop.md`](../done/human-in-the-loop.md)): rename/merge from an interview, with project **editor/owner** gates. That is the right default for **editorial workflow** but insufficient for **operators** who must fix **canonical records** without opening a specific interview — or who need a **governed, accountable** view of what the system “believes.”

We need an **admin governance tool** framed as **knowledge-base stewardship**, **not** arbitrary SQL or raw table access.

## Goals

- Provide a **dedicated admin experience** to **find** and **update** canonical entity records (and closely related data where safe) when business reality changes.
- **Strong access control:** only **platform-level administrators** (see [`platform-user-roles-authorization.md`](./platform-user-roles-authorization.md)) can use this panel.
- **Predictable MVP scope:** clear list of **what is editable** vs **explicitly out of scope** for v1.
- **Alignment with existing architecture:** mutations continue to follow **`getUser()` verification + service role / admin client** patterns; no casual weakening of RLS for normal users ([`HANDOVER.md`](../../../HANDOVER.md)).

## Non-goals (MVP)

- **Raw database console** or arbitrary SQL.
- **End-user self-service** for this panel (not every project member).
- **Full graph data science workbench** (complex relationship editing, bulk graph algorithms).
- **Automatic propagation** to all historical narrative text in interviews (changing a canonical name does not by itself rewrite old transcript display — that may remain a separate process; see open questions).

## Who can access

- Users with the **`platform_admin`** platform role (name per [`platform-user-roles-authorization.md`](./platform-user-roles-authorization.md)).
- **Not** granted by `project_members.role` alone (a project **owner** is not automatically a platform admin unless also promoted at platform level).

## What admins can do (product intent)

**MVP — in scope (subject to implementation detail):**

- **Search and list** entities with filters helpful for ops (e.g. by name, type, project vs global, updated_at).
- **View** core fields and key related counts (e.g. aliases, mention counts — read-only summaries acceptable in v1).
- **Edit canonical fields** on `entities` that are safe to change without re-running the full pipeline:
  - **`name`** (with corresponding **`normalized_name`** maintenance per existing conventions).
  - **`description`**.
  - **`type`** (`entity_type` enum), if product accepts manual correction of misclassified entities.
  - **`metadata` (JSONB)** — only if we define **allowed keys** or a minimal structured form; otherwise defer (see out of scope).

**MVP — closely related, if low-risk:**

- **Add or remove aliases** via `entity_aliases` where it improves matching (e.g. old CEO name as alias of canonical person entity) — mirrors the spirit of the Entity Editor but from an admin lens.

**Explicitly out of scope for first version**

- **Merge two canonical entities** (complex mention/relationship remapping) — high risk; the interview Entity Editor already supports merge with clear UX; admin merge can be **phase 2** with a dedicated flow and audit.
- **Delete entities** that have mentions/relationships (CASCADE / orphan risk).
- **Bulk import/export** of entity catalogs.
- **Editing `entity_mentions` or `entity_relationships`** directly (except possibly read-only inspection).
- **Re-embedding or full pipeline reprocess** triggered from this panel (could link out to transcript review / reprocess flows instead).
- **Changing `project_id` or `canonical_entity_id`** without a dedicated merge/split spec (dangerous for graph integrity).

## Approach (strategy)

1. **Ship after** (or in tight parallel with) **platform roles** so the route and APIs are not guesswork ([`platform-user-roles-authorization.md`](./platform-user-roles-authorization.md)).
2. **New admin section** in the app (e.g. `/admin/entities` — exact path TBD) with server-side checks on every loader/action.
3. **Service role writes** only through validated server actions or route handlers, with explicit field allowlists for MVP.
4. **Auditability (stretch for MVP):** log actor, entity id, before/after for edits; if omitted in v1, document as known gap.

## User experience (optional)

- **Operator-first** UI: fast search, clear entity type badge, warning when editing **global** (`project_id` IS NULL) vs **project-scoped** entities.
- **Confirmation** on destructive-adjacent actions when they appear in later phases; MVP edits should be mostly reversible (e.g. name/description) but still confirmed for large surfaces if needed.

## Technical notes (optional)

- Schema reference: [`entities`](../../infrastructure/database-schema.md), `entity_aliases`, relations to mentions/relationships.
- **Global entities:** nullable `project_id` requires UI and authorization clarity — admins may need to edit global rows; enforce explicit rules at implementation.
- Reuse patterns from [`../done/human-in-the-loop.md`](../done/human-in-the-loop.md) where they apply (normalization, alias learning), without duplicating the interview-only UX.

## Dependencies & related docs

- **Depends on:** [`platform-user-roles-authorization.md`](./platform-user-roles-authorization.md) for gating.
- **Related shipped:** [`../done/human-in-the-loop.md`](../done/human-in-the-loop.md) (interview-scoped entity corrections).
- **Related:** [`../done/interview-transcript-review.md`](../done/interview-transcript-review.md) when source text, not just canonical records, must change.

## Risks & open questions

- **Transcript display vs canonical name:** updating `entities.name` may not update `transcript_display` or historical strings — need a product rule (acceptable for MVP vs must trigger something).
- **`metadata` JSONB:** free-form editing is error-prone; prefer structured fields or defer.
- **Performance:** listing “all entities” on large tenants may require pagination and indexes (implementation detail).

## Acceptance / how to validate (for implementation phase)

- **`member`** (platform role) cannot open admin routes or call admin mutations (consistent 403).
- **`platform_admin`** can perform allowed edits; disallowed operations remain impossible from UI and API.
- Edits persist correctly; `normalized_name` (and any invariants documented in schema) remain consistent.
- No regression to **`token_hash`** flow, SECURITY DEFINER helpers, or admin client discipline.

## Implementation log (optional)

- _Empty until work moves to `on-going/`._
