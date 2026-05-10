---
title: "Phase 3a — Tenants, tenant_id everywhere, RLS hardening, and tenant customization"
status: done
owner: carlos
priority: high
last_updated: 2026-05-10
related_architecture:
  - docs/architecture/tenant-model-adr.md
related_infrastructure:
  - docs/infrastructure/database-schema.md
related_features:
  - docs/features/done/chat-entity-retrieval-rpc.md
  - docs/features/on-going/source-entities-pipeline-writes.md
---

# Phase 3a — Tenants, tenant_id everywhere, RLS hardening, and tenant customization

## Problem

- There is no `tenant` concept in the schema. `projects` is the top-level unit,
  which conflates a customer account with a dataset/initiative.
- Multi-hop join scoping (`source_chunks → sources → projects → tenant`) is fragile:
  a bug in one hop silently leaks data across customers.
- RLS currently only gates at the project level. Tables like `entities`,
  `entity_aliases`, and `entity_relationships` have no project-based RLS at all.
- Tenant customization (feature flags, limits, branding, prompt config, integrations)
  has no first-class representation.

## Goals

- Introduce `tenants` as the canonical customer/account boundary above `projects`.
- Every customer-owned table row carries an explicit `tenant_id` column (NOT NULL
  for Tier A; nullable for hybrid Tier B global rows).
- RLS enforces tenancy through `tenant_id` directly — no multi-hop joins in policies.
- Parent/child tenant consistency enforced by compound `(id, tenant_id)` FKs and
  a `BEFORE INSERT/UPDATE` trigger on Tier B parents.
- `tenant_settings` and `tenant_integrations` provide first-class tenant customization
  infrastructure from day one.

## Non-goals

- Dedicated-DB-per-enterprise escape hatch (documented in ADR; implement when first
  enterprise customer requires it).
- Per-project or per-user feature flags (flags are tenant-level in Phase 3a).
- Migrations of individual tenant settings (settings table ships with JSONB defaults).
- Any product UI for tenant management (admin client / SQL only in this phase).

## Approach

Three PRs (migrations + code):

### PR 3a.1 — `00032_tenants_core.sql`
Creates `tenants`, `tenant_members`, `tenant_settings`, `tenant_integrations`, and
`is_tenant_member(p_tenant_id)` SECURITY DEFINER helper. Bootstraps one tenant + one
`tenant_settings` row. No existing tables are touched.

### PR 3a.2 — `00033_tenant_id_everywhere.sql`
Adds `tenant_id` nullable columns to every customer-owned table (Tier A + Tier B).
Backfills from the bootstrap tenant via single-hop joins. Asserts zero orphans via
`DO $$ RAISE EXCEPTION` guard. Sets NOT NULL on all Tier A tables. Adds compound
`(id, tenant_id)` UNIQUE on Tier A parent tables. Adds compound FKs from every Tier A
child to its Tier A parent. Updates the Phase 2.5 unique index on `entities` and
`entity_aliases` to use `tenant_id` instead of `project_id`. Adds hot `(tenant_id)`
and compound `(tenant_id, <parent_id>)` indexes.

**IMPORTANT:** pipeline code changes ship alongside this migration. After 00033 lands,
every new INSERT into a Tier A child table must include `tenant_id`. The compound FK
enforces this and will raise a DB error if a write omits it.

### PR 3a.3 — `00034_tenant_rls.sql` + TypeScript
Enables RLS on every Tier A/B table using `is_tenant_member(tenant_id)` (Tier A) or
`tenant_id IS NULL OR is_tenant_member(tenant_id)` (Tier B). Adds read-own-tenant
policies on `tenants`, `tenant_members`, `tenant_settings`. Admin client (service role)
continues to bypass all policies.

TypeScript changes:
- `src/lib/tenant/scope.ts` — `getSourceTenantId(supabase, sourceId)` helper
- `src/lib/tenant/settings.ts` — typed accessors for tenant config
- `src/lib/ai/pipeline.ts` + `document-pipeline.ts` — fetch `tenant_id` from source,
  propagate to every batch INSERT (chunks, mentions, relationships, source_entities,
  snippets)
- `src/lib/entities/source-entities-writer.ts` — accept and write `tenant_id`
- `src/lib/ai/content-generation.ts` — accept and write `tenant_id`
- `src/types/database.ts` — add new tables; add `tenant_id` to every Tier A/B table

## Technical notes

### Tables by tier (per ADR §3.8a)

**Tier A — NOT NULL:** `projects`, `project_members`, `sources`, `source_chunks`,
`source_entities`, `entity_mentions`, `entity_relationships`, `content_snippets`,
`interview_review_entities`, `reports`, `chat_conversations`, `chat_messages`,
`chat_conversation_seq`, `tenant_members`, `tenant_settings`, `tenant_integrations`.

**Tier B — NULLABLE (NULL = platform-global):** `entities`, `entity_aliases`.

**Tier C — No `tenant_id`:** `tenants`, `profiles`, `user_platform_roles`,
`validated_positions`. (Justification in ADR §8.)

### Bootstrap UUID strategy

Migration 00032 inserts the bootstrap tenant with `uuid_generate_v4()`. Migration
00033 resolves it dynamically: `SELECT id FROM tenants ORDER BY created_at LIMIT 1`
— safe because the DB has exactly one tenant at this point.

### RLS principal: admin client is never affected

All pipeline writes (`createAdminClient()` = service role) bypass RLS by design.
RLS protects anon/cookie reads from the dashboard UI only. Sacred pattern preserved.

### Compound FK structure (parent/child consistency)

```
projects:          UNIQUE (id, tenant_id)
sources:           UNIQUE (id, tenant_id)
chat_conversations: UNIQUE (id, tenant_id)

source_chunks:      FK (source_id, tenant_id) → sources(id, tenant_id)
source_entities:    FK (source_id, tenant_id) → sources(id, tenant_id)
entity_mentions:    FK (interview_id, tenant_id) → sources(id, tenant_id)
entity_relationships: FK (interview_id, tenant_id) → sources(id, tenant_id)
content_snippets:   FK (interview_id, tenant_id) → sources(id, tenant_id)
interview_review_entities: FK (interview_id, tenant_id) → sources(id, tenant_id)
sources:            FK (project_id, tenant_id) → projects(id, tenant_id)
reports:            FK (project_id, tenant_id) → projects(id, tenant_id)
project_members:    FK (project_id, tenant_id) → projects(id, tenant_id)
chat_messages:      FK (conversation_id, tenant_id) → chat_conversations(id, tenant_id)
chat_conversation_seq: FK (conversation_id, tenant_id) → chat_conversations(id, tenant_id)
```

Tier B (`entities`, `entity_aliases`) uses a trigger instead of a compound FK because
`tenant_id` is nullable on both.

## Dependencies

- Phase 2.5 (migration 00031) must be applied. Done.
- Back-compat `interviews` view over `sources` will automatically expose `tenant_id`
  after 00033 — no view update needed.

## Risks & open questions

- **Deployment timing:** 00033 adds compound FKs. If a pipeline run fires between
  migration apply and code deploy, and the code hasn't been updated yet, the insert
  will fail with a FK violation. Mitigate: deploy code and migration in the same
  deployment step; the single-customer setup makes this coordination trivial.
- **Global entities (tenant_id NULL):** after 00033, anchor-created orphan entities
  (no project_id) will have `tenant_id NULL` and be treated as platform-global. This
  is acceptable; the orphan-anchor reduction in PR 2.3 already minimised this set.

## Acceptance / how to validate

- [ ] `SELECT COUNT(*) FROM tenants;` returns 1.
- [ ] `SELECT COUNT(*) FROM tenant_settings;` returns 1.
- [ ] `SELECT COUNT(*) FROM projects WHERE tenant_id IS NULL;` returns 0.
- [ ] `SELECT COUNT(*) FROM sources WHERE tenant_id IS NULL;` returns 0.
- [ ] `SELECT COUNT(*) FROM source_chunks WHERE tenant_id IS NULL;` returns 0.
- [ ] `SELECT COUNT(*) FROM entity_mentions WHERE tenant_id IS NULL;` returns 0.
- [ ] `SELECT COUNT(*) FROM entity_relationships WHERE tenant_id IS NULL;` returns 0.
- [ ] Upload a new source (audio or text). Confirm it has `tenant_id` set on `sources`,
  `source_chunks`, `entity_mentions`, `entity_relationships`, `content_snippets`,
  and `source_entities` rows.
- [ ] Dashboard, Network Explorer, Interview Detail, and Chat all render without errors.
- [ ] Admin entity list still shows entities.
- [ ] Chat answers still work (entity intel RPC is unaffected).

## Implementation log

- 2026-05-08 — Phase 3a approved. Feature spec created. Implementation starting.
