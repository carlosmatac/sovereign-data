---
title: "ADR — Multi-tenant model for Aksum SaaS"
status: proposed
owner: carlos
last_updated: 2026-05-08
supersedes: docs/roadmaps/database-refactor-plan.md § Phase 3a (workspaces)
related:
  - docs/roadmaps/database-refactor-plan.md
  - docs/infrastructure/database-schema.md
  - HANDOVER.md
revisions:
  - 2026-05-08 — initial draft (rename workspaces → tenants; add settings + integrations).
  - 2026-05-08 — adopt "tenant_id on every customer-owned table" as the
    foundational rule; replace transitive scoping with direct
    `tenant_id` columns + parent/child consistency enforcement.
---

# ADR — Multi-tenant model for Aksum SaaS

> **Decision point.** Phase 3a (`workspaces` plan) is paused pending this review.
> This memo compares the three viable options, evaluates them against the
> criteria that matter for this product, recommends a path, and describes
> the revised Phase 3a scope.

---

## 1. Context

After Phase 2 the schema hierarchy is:

```
auth.users
  └─ profiles
  └─ project_members ──► projects
                            └─ sources  (formerly interviews)
                            └─ source_chunks
                            └─ source_entities
                            └─ entity_mentions / entity_relationships
                            └─ reports
                            └─ chat_conversations

entities  (project_id nullable → global)
entity_aliases  (project_id nullable → global)
validated_positions  (global)
user_platform_roles  (global)
```

`projects` is currently the top-level tenant unit. There is one paying
customer, one implicit "tenant", and no tenant layer in the schema.

Phase 3a proposed adding a `workspaces` table directly above `projects`
to become the real tenancy boundary. The name "workspace" was chosen as
a product-facing label, but it is vague in a SaaS context: in Notion,
Slack, and Linear a "workspace" is the top-level account — i.e. exactly
the concept of a **tenant**. The question is whether the design is right
and only the name is wrong, or whether a deeper redesign is warranted.

---

## 2. Options

### Option A — Keep `workspaces` / `workspace_members` (current Phase 3a plan)

Add a `workspaces (id, name, created_at)` table above `projects`.
Add `workspace_id` to `projects`, `entities`, `entity_aliases`.
Add `workspace_members (workspace_id, user_id, role)`.
RLS via `is_workspace_member(p_workspace_id)` SECURITY DEFINER helper.

### Option B — Rename to `tenants` / `tenant_members` with `tenant_id`

Identical design to Option A. The **only** change is the name:

| Option A | Option B |
|---|---|
| `workspaces` | `tenants` |
| `workspace_id` | `tenant_id` |
| `workspace_members` | `tenant_members` |
| `is_workspace_member()` | `is_tenant_member()` |

Plus: add a `tenant_settings` table for configuration and
a `tenant_integrations` table for per-tenant connectors.

### Option C — Dedicated Supabase project per enterprise customer

Each paying customer gets their own Supabase project (database, auth,
storage). A global control plane (separate Supabase project or a
management service) maps customer → project URL + credentials. The
application reads `X-Tenant-ID` (or subdomain) and connects to the
correct Supabase project per request.

---

## 3. Evaluation

### 3.1 Tenant isolation and security

| Criterion | Option A (workspaces) | Option B (tenants) | Option C (dedicated DB) |
|---|---|---|---|
| **Logical isolation** | RLS on `workspace_id` — shared DB, row-level gate | Identical — same RLS design, better-named columns | Physical isolation — separate DB per customer |
| **Blast radius of RLS bug** | All customers in same DB | All customers in same DB | Customer-specific DB — breach of one does not reach others |
| **Service role key exposure** | One key grants admin across all tenants | One key grants admin across all tenants | One key per customer; breach scope limited |
| **Suitable for highly sensitive customers** | Only with strong operational discipline | Only with strong operational discipline | Yes — contractually isolated, auditable separately |
| **Suitable for current state (1 customer, small team)** | Yes | Yes | Severe over-engineering |

**Verdict:** Options A and B are equivalent on isolation. Option C is the
only path that delivers true physical isolation, but it is only relevant
once you have enterprise customers with a contractual requirement for it.

### 3.2 RLS design

The SECURITY DEFINER helper pattern (already in use for
`is_project_member()`) is the correct pattern for this codebase.
The design is identical between A and B — only names change.

Key principle preserved: all pipeline and mutation code uses
`createAdminClient()` (RLS bypass via service role). RLS protects
anon-key / cookie-authenticated reads from the dashboard UI. This split
is sacred (HANDOVER.md §3, AGENTS.md §5) and does **not** change
under any of the three options.

Option C would require a connection-routing layer before the admin
client is created — a significant architectural addition.

### 3.3 Operational complexity

| Criterion | Option A/B | Option C |
|---|---|---|
| DB infrastructure | 1 Supabase project | 1 per customer |
| Migration rollout | One migration run touches all customers | Must replay migrations per project (automation required) |
| Debugging production issues | Single DB, single log stream | Must identify which project, connect separately |
| Backup strategy | One backup policy | N backup policies (or an abstraction over them) |
| Onboarding new customer | INSERT into `tenants` + bootstrap | Provision new Supabase project, apply full migration set, configure DNS/env |
| Cost at scale | Linear in rows — vector index is the cost driver | Fixed base cost per customer (Supabase project free tier currently generous, but changes) |

Option C becomes viable only when a customer's data volume or compliance
posture justifies a dedicated project — which is a **future enterprise
tier** decision, not a Day 1 architecture decision.

### 3.4 Migrations

Options A and B are identical: 2–3 new migration files (table creation,
`workspace_id` / `tenant_id` columns with bootstrap, RLS helpers and
policies). No destructive changes to existing tables.

Option C would require an entirely new provisioning system and a
migration runner that can be replayed against arbitrary Supabase
projects. This is a multi-week infrastructure project on its own.

### 3.5 Onboarding new customers

| Step | Option A/B | Option C |
|---|---|---|
| Create tenant record | `INSERT INTO tenants ...` | Provision Supabase project via Management API |
| Invite first user | `INSERT INTO tenant_members ...` | Create auth user in new project |
| Apply schema | (already present — shared DB) | Run all migrations against new project |
| Apply seed data | `INSERT INTO tenant_settings ...` | Run seed against new project |
| Configure integrations | `INSERT INTO tenant_integrations ...` | Env vars in new project |
| Time to first login | Seconds | Minutes to hours |

For the foreseeable future (SaaS with tens of customers, not thousands),
Option B is the clear winner on onboarding speed.

### 3.6 Cross-project intelligence inside the same customer

This is one of the core product promises: "here's what we know about
Minister X across all your projects."

- **Options A/B:** `entities` and `entity_aliases` scoped at the
  `tenant_id` level (NULL = platform-global, tenant UUID = tenant-scoped).
  A query can JOIN entities to all sources under a `tenant_id` in a
  single SQL statement. The `entity_intel` RPC already supports a
  `p_project_id` filter — passing NULL returns all sources in the
  tenant. This is the ideal shape for cross-project intelligence.

- **Option C:** cross-project intelligence within a customer is easy
  (all data in one DB). But the cross-tenant federation that the
  platform team needs (e.g. "show me cross-customer entity counts for
  product analytics") requires either an aggregation service or
  exposing each project's API separately. This is a later problem.

### 3.7 Future enterprise requirements

Typical enterprise additions that need the model to support them:

| Requirement | Option A/B (tenant model) | Option C (dedicated DB) |
|---|---|---|
| SSO / SAML per tenant | `tenant_settings.auth_config JSONB` | Supabase Auth config per project |
| Custom domain / white-label | `tenant_settings.branding JSONB` | DNS routing per project |
| Data residency (EU, US) | Supabase region selection per tenant — not achievable in shared DB | Each project can be in the right region |
| Contractual data isolation | Not achievable without Option C | Native |
| RBAC within tenant | `tenant_members.role` + project-level `project_members.role` | Same |
| Audit log per tenant | Filter on `tenant_id` | Native |

**Conclusion:** a small fraction of future enterprise customers will
require physical isolation (data residency, contractual requirements).
The right design is to **start with Option B** and add an **escape hatch
to Option C** for those customers: the application code routes to a
per-customer Supabase URL if a `TENANT_DB_URL` override is present in
the control plane. This is a small code change at the connection layer
and is entirely forward-compatible with the Option B schema.

### 3.8 Impact on current schema objects — `tenant_id` on every customer-owned row

> **Foundational rule (added 2026-05-08).** Every table that holds
> customer-owned data carries an explicit `tenant_id UUID` column.
> RLS enforces tenancy directly through that column, **never** through
> a multi-hop join to `projects.tenant_id`. Transitive scoping is a
> performance and security liability: it depends on the parent FK
> being correct, on the join not being optimised away, and on the RLS
> policy correctly traversing every hop. A direct column is cheaper
> to query, cheaper to index, and impossible to misroute.

The trade-off is a small amount of denormalisation: every child row
duplicates its parent's tenant. The denormalisation is enforced by a
**parent/child consistency trigger** (see §3.8b) so a child row can
never point at a parent row from a different tenant.

#### 3.8a — Per-table classification

The schema groups into three tiers. **Customer-owned** (always
`tenant_id NOT NULL`), **shareable / hybrid** (`tenant_id NULL` =
platform-global), and **tenant-agnostic** (no `tenant_id`).

##### Tier A — Customer-owned (`tenant_id NOT NULL`)

These tables exist only in the context of a paying customer. Every row
**must** carry `tenant_id`. RLS uses `is_tenant_member(tenant_id)`
directly without any join.

| Table | Add `tenant_id`? | Source of `tenant_id` | Notes |
|---|---|---|---|
| `projects` | Yes, NOT NULL | `tenants.id` | The tenant root for backfill; FK → `tenants(id)`. |
| `project_members` | Yes, NOT NULL | Inherited from parent `projects.tenant_id` (denormalized; trigger-enforced) | Lets us answer "all members of tenant X" without joining `projects`. |
| `sources` | Yes, NOT NULL | Inherited from `projects.tenant_id` | Hot read path — every chat brief, dashboard, report, and graph reads sources scoped by tenant. |
| `source_chunks` | Yes, NOT NULL | Inherited from `sources.tenant_id` | Vector search predicate: filter chunks to the caller's tenant **before** the HNSW probe. Indexed alongside `(tenant_id, source_id)`. |
| `source_entities` | Yes, NOT NULL | Inherited from `sources.tenant_id` | Source-level associations are private to the tenant. |
| `entity_mentions` | Yes, NOT NULL | Inherited from `sources.tenant_id` | (Column rename `interview_id → source_id` continues to be back-compat-aliased.) |
| `entity_relationships` | Yes, NOT NULL | Inherited from `sources.tenant_id` | Same. |
| `content_snippets` | Yes, NOT NULL | Inherited from `sources.tenant_id` | Marketing assets are customer-owned. |
| `interview_review_entities` | Yes, NOT NULL | Inherited from `sources.tenant_id` | Reviewer seeds. |
| `reports` | Yes, NOT NULL | Inherited from `projects.tenant_id` | Direct access path is high-value; querying "all reports for tenant X" must be a single index scan. |
| `chat_conversations` | Yes, NOT NULL | Inherited from `projects.tenant_id` if `project_id` is set; otherwise from the user's primary tenant at creation time | Conversations may be project-less but are never tenant-less. |
| `chat_messages` | Yes, NOT NULL | Inherited from `chat_conversations.tenant_id` | Allows direct RLS without conversation join. |
| `chat_conversation_seq` | Yes, NOT NULL | Inherited from `chat_conversations.tenant_id` | Same. |
| `tenant_members` | Yes, NOT NULL | Self (`tenant_id` is a primary key column) | Membership table — `tenant_id` is intrinsic. |
| `tenant_settings` | Yes, NOT NULL UNIQUE | Self | One row per tenant. |
| `tenant_integrations` | Yes, NOT NULL | Self | Per-tenant connectors. |
| `chat_message_evidence` (Phase 4a) | Yes, NOT NULL | Inherited from `chat_messages.tenant_id` | Evidence rows ride the same tenant as the message they support. |

##### Tier B — Shareable / hybrid (`tenant_id NULLABLE`)

These tables can hold either tenant-private rows or platform-global
rows. RLS reads `tenant_id IS NULL OR is_tenant_member(tenant_id)`.

| Table | `tenant_id` | Why nullable |
|---|---|---|
| `entities` | Nullable | NULL = platform-global canonical entity (e.g. countries, ministries, well-known multinationals). Tenant-scoped entities get the tenant's id. The Phase 2.5 unique index becomes `(normalized_name, type, COALESCE(tenant_id, sentinel_uuid))` — same shape as today, just `tenant_id` instead of `project_id`. |
| `entity_aliases` | Nullable | Same: NULL = platform-global alias (e.g. "EU" → European Union); tenant-scoped aliases reference the tenant. |

> **Why hybrid for entities and aliases, but not for `validated_positions`?**
> Entities are the most-reused intelligence asset across customers — a
> "Ministry of Energy of Angola" entity should be reusable. Validated
> positions are a curated catalog the platform team manages on behalf
> of all customers, so they are tier C, not tier B.

##### Tier C — Tenant-agnostic (no `tenant_id`)

These tables intentionally have no `tenant_id` column.

| Table | Why no `tenant_id` |
|---|---|
| `tenants` | The tenant **is** the row. Adding `tenant_id` to itself is meaningless. RLS is `id = ANY(my_tenant_ids)` (or `is_tenant_member(id)`). |
| `profiles` | Users are global. A user can be a member of multiple tenants. The `tenant_members` table holds the relationship. RLS = own profile only. |
| `user_platform_roles` | Platform staff (superusers, platform admins) are by definition above tenants. RLS = own row. |
| `validated_positions` | Curated global catalog, edited only by the platform team. Reused across all tenants. RLS = SELECT for any authenticated user; INSERT/UPDATE only via admin client. |

#### 3.8b — Parent/child consistency

Adding `tenant_id` to every table introduces a new failure mode: a
child row could be inserted with a `tenant_id` that does not match its
parent's `tenant_id` (e.g. a `source_chunks` row whose `tenant_id`
differs from the `tenant_id` of its `sources` parent). This is a
silent tenancy breach.

We protect against it three ways, in order of strength:

1. **Compound foreign keys with `tenant_id`.**
   Where Postgres allows it, add `(parent_id, tenant_id)` as a unique
   constraint on the parent and reference the **pair** from the child:

   ```sql
   -- Parent
   ALTER TABLE sources
     ADD CONSTRAINT sources_id_tenant_unique UNIQUE (id, tenant_id);

   -- Child
   ALTER TABLE source_chunks
     ADD CONSTRAINT source_chunks_source_tenant_fkey
     FOREIGN KEY (source_id, tenant_id) REFERENCES sources(id, tenant_id)
     ON DELETE CASCADE;
   ```

   This makes mismatched tenants **structurally impossible** at the
   database level. We use this pattern wherever the parent has a
   single non-nullable `tenant_id` and the child is in tier A.

2. **`BEFORE INSERT/UPDATE` triggers** for tier B parents (`entities`,
   `entity_aliases`) where the parent's `tenant_id` may be NULL:

   ```sql
   CREATE OR REPLACE FUNCTION enforce_tenant_consistency_<child>()
   RETURNS TRIGGER LANGUAGE plpgsql AS $$
   DECLARE
     parent_tenant UUID;
   BEGIN
     SELECT tenant_id INTO parent_tenant FROM <parent> WHERE id = NEW.<parent>_id;
     -- A child of a tier-A parent must match its parent's tenant.
     -- A child of a tier-B parent (entities) with NULL parent tenant is
     -- allowed only if the child is itself a global row (NEW.tenant_id IS NULL).
     IF parent_tenant IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM parent_tenant THEN
       RAISE EXCEPTION 'tenant_id mismatch: child=%, parent=%', NEW.tenant_id, parent_tenant;
     END IF;
     RETURN NEW;
   END;
   $$;
   ```

3. **`CHECK` constraint via `tenant_id` set in pipeline writes.**
   The pipeline always sets `tenant_id` from a single source of truth
   (the source's `tenant_id`, fetched once). Combined with #1 and #2
   above, this makes drift impossible without bypassing all three
   layers.

**Recommendation:** use #1 (compound FK) for every tier A parent →
tier A child relationship. Use #2 (trigger) for tier A → tier B and
tier B → tier B. Document #3 as the application invariant.

#### 3.8c — Performance and storage cost

Storing `tenant_id` (16 bytes) on every row of every customer-owned
table adds ~16 bytes per row. For the largest tables today:

| Table | Approx row count (current) | Added storage |
|---|---|---|
| `source_chunks` | ~5 K | ~80 KB |
| `entity_mentions` | ~3 K | ~48 KB |
| `entity_relationships` | ~1.5 K | ~24 KB |
| `chat_messages` | ~2 K | ~32 KB |
| All others | < 1 K each | negligible |

Total: under 1 MB even at our largest scale point. Storage cost is
not a real consideration; the win in clarity, RLS simplicity, and
index quality is overwhelming.

We add a `(tenant_id)` index on every customer-owned table, plus a
compound `(tenant_id, <hot_query_column>)` index where it pays off
(e.g. `(tenant_id, project_id)` on `sources`,
`(tenant_id, source_id)` on `source_chunks`). The Phase 2.5 unique
index on `entities` swaps `project_id` for `tenant_id`.

### 3.9 Option A vs Option B — is this just a rename?

**Mostly yes, but the rename carries meaning.** `workspace` is ambiguous:
it could mean a tenant (the company), a project (a working context), or
a UI layout (like VS Code's workspace). In a B2B SaaS:

- `tenant` = the paying customer / company. Unambiguous to developers,
  DBAs, security auditors, and compliance reviewers.
- `project` = a dataset, market, initiative, or campaign within that
  customer. Already established in the codebase.

Using `workspace` at the tenant level while `project` means a dataset
creates a confusing three-level hierarchy (`workspace → project →
source`) where the top level has a UX-flavored name and the second level
has an analytics-flavored name.

Renaming to `tenant` costs nothing now (no production multi-tenant
customers exist) and saves confusion in every future schema discussion,
migration, RLS review, and sales conversation.

**The design is right. The name is wrong. Change the name.**

---

## 4. Tenant customization layer

The principle: **one product, many configurations**. No per-customer
code forks. No per-customer schema forks.

### 4.1 What tenants will need to customize

| Category | Examples | Mechanism |
|---|---|---|
| **Limits** | Max sources per project, max users, max chat messages/month | `tenant_settings.limits JSONB` |
| **Branding** | Logo URL, primary color, product name override, email sender | `tenant_settings.branding JSONB` |
| **Feature flags** | Enable/disable modules (Reports, War Room, Network Explorer, Copilot), beta features | `tenant_settings.feature_flags JSONB` |
| **Module config** | Default extraction model, similarity threshold override, chunk size | `tenant_settings.module_config JSONB` |
| **Prompt / workflow** | Custom extraction instructions, persona override for Copilot, custom entity types to bias toward | `tenant_settings.prompt_config JSONB` |
| **Custom field schemas** | Extra metadata on sources or entities (e.g. "deal stage", "priority", "region") | `tenant_settings.custom_schemas JSONB` |
| **Auth / SSO** | SAML provider config, allowed email domains, enforced MFA | `tenant_settings.auth_config JSONB` (evaluated at auth middleware) |
| **Integrations** | HubSpot, Salesforce, Slack, email, calendar — enabled per tenant with credentials | `tenant_integrations` table |

### 4.2 Proposed `tenant_settings` table

```sql
CREATE TABLE tenant_settings (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  -- hard limits
  limits        JSONB NOT NULL DEFAULT '{}',
  -- branding overrides (logo_url, primary_color, display_name, etc.)
  branding      JSONB NOT NULL DEFAULT '{}',
  -- feature flags: { "reports": true, "war_room": false, "copilot_web_search": true }
  feature_flags JSONB NOT NULL DEFAULT '{}',
  -- module configuration: { "extraction_model": "gpt-4o", "chunk_size": 800 }
  module_config JSONB NOT NULL DEFAULT '{}',
  -- prompt / workflow config: { "copilot_persona": "...", "extraction_hints": [...] }
  prompt_config JSONB NOT NULL DEFAULT '{}',
  -- custom field schemas per object type: { "source": [...], "entity": [...] }
  custom_schemas JSONB NOT NULL DEFAULT '{}',
  -- auth config: { "sso_provider": "...", "allowed_domains": [...] }
  auth_config   JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**One row per tenant** (UNIQUE on `tenant_id`). All columns are JSONB
with safe defaults so new tenants get working defaults without explicit
configuration.

This avoids a `key/value` EAV anti-pattern. Individual JSONB keys
within each column are defined and validated in application code
(`src/lib/tenant/settings.ts`) with a typed schema (Zod), not
free-form.

### 4.3 Proposed `tenant_integrations` table

Integrations have a more complex lifecycle than settings (enabled state,
credentials, sync status, error tracking), so they deserve their own
table:

```sql
CREATE TABLE tenant_integrations (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_type TEXT NOT NULL,  -- 'hubspot' | 'salesforce' | 'slack' | 'email' | ...
  enabled          BOOLEAN NOT NULL DEFAULT false,
  config           JSONB NOT NULL DEFAULT '{}',   -- non-sensitive config
  credentials_ref  TEXT NULL,  -- reference to encrypted secret store (not the secret itself)
  sync_status      TEXT NULL,  -- 'idle' | 'syncing' | 'error'
  last_sync_at     TIMESTAMPTZ NULL,
  last_error       TEXT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, integration_type)
);
```

Credentials are **never** stored in plaintext in the DB. The
`credentials_ref` column points to a secret in Supabase Vault or an
external secret manager.

### 4.4 Reading tenant configuration in application code

A lightweight helper module (`src/lib/tenant/settings.ts`) exposes
typed accessors:

```typescript
getTenantSettings(tenantId: string): Promise<TenantSettings>
isFeatureEnabled(tenantId: string, flag: FeatureFlag): Promise<boolean>
getTenantLimits(tenantId: string): Promise<TenantLimits>
getTenantPromptConfig(tenantId: string): Promise<PromptConfig>
```

These are called at request boundaries (API routes, pipeline entry
points) and cached briefly (per request or via a short TTL in-memory
cache) to avoid per-operation DB round-trips.

### 4.5 What this is NOT

- It is **not** a dynamic feature flag service (LaunchDarkly, Unleash).
  It is a simple per-tenant configuration table. Dynamic rollout to
  percentages of users can be added later if needed.
- It is **not** per-user flags. Flags are at the tenant level.
  User-level feature states (e.g. "user has seen onboarding") live
  elsewhere.
- It is **not** a schema fork. Custom fields are metadata stored in
  `source_entities.source_metadata JSONB` or a `custom_fields JSONB`
  column on `sources` (already in scope as `source_metadata`). The
  schema does not change per tenant.

---

## 5. Dedicated DB per enterprise — when and how

This is a **future enterprise tier** decision, not a Phase 3 decision.
Design it as an escape hatch:

1. `tenants` table gains an optional `db_url_override TEXT NULL` column
   (or this lives in the control plane / environment config, not in the
   shared DB).
2. The Supabase client factory (`src/lib/supabase/`) checks for a
   tenant-specific URL before falling back to the default.
3. No schema change in the shared DB is required. The per-customer DB
   is a standalone Supabase project with the same migration set applied.
4. A provisioning script (not a migration) creates and seeds the
   per-customer project on demand.

This pattern is sometimes called a "silo model" alongside the "pool
model" and is well documented in AWS multi-tenant SaaS guides. The two
models can coexist: standard customers on the shared DB (pool), high-
sensitivity enterprise customers on dedicated projects (silo).

**Trigger:** implement this escape hatch when the first enterprise
customer with a contractual isolation requirement signs. Not before.

---

## 6. Verdict

| Question | Answer |
|---|---|
| **Should `workspaces` be renamed to `tenants`?** | **Yes.** Not cosmetic — it eliminates the naming ambiguity between tenant, project, and workspace. Do it now while zero production multi-tenant rows exist. |
| **Should `tenant_id` be on every customer-owned table by default?** | **Yes.** Every row carries its own tenant boundary. RLS enforces tenancy through `tenant_id` directly, never through multi-hop joins. Parent/child consistency is enforced via compound FKs and triggers. |
| **Does the structural design of Phase 3a otherwise need to change?** | **No.** Tenant → projects → sources hierarchy stays. The SECURITY DEFINER `is_tenant_member()` RLS helper is the right pattern. |
| **Should `tenant_settings` and `tenant_integrations` be added?** | **Yes.** Add them in Phase 3a alongside the core tables. They have safe JSONB defaults; adding them early costs nothing and unlocks customization from Day 1. |
| **Should `workspaces` coexist with `tenants`?** | **No.** They represent the same concept. There is nothing to coexist. The migration creates `tenants`, not `workspaces`. |
| **Should we design for dedicated DB per enterprise now?** | **No.** Document the escape hatch pattern; implement it when the first enterprise customer requires it. |
| **Does this replace the current `workspaces` plan?** | **Yes, entirely.** Phase 3a is rewritten to say `tenants` throughout, propagate `tenant_id` to every customer-owned table, enforce parent/child consistency, and include `tenant_settings` + `tenant_integrations`. The PR count grows by one (from 3 → 4) to absorb the wider column rollout safely. |

---

## 7. Revised Phase 3a scope

Four PRs (was three). The added PR isolates the wider `tenant_id`
column rollout from the core tenancy tables, and from the RLS swap.
Each PR is independently reviewable and revertible.

### PR 3a.1 — Core tenancy tables + customization scaffolding

**Migration `00032_tenants_core.sql`**

```sql
-- 1. Tenant root
CREATE TABLE tenants (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tenant membership (compound PK = intrinsic tenant_id)
CREATE TABLE tenant_members (
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member',  -- 'owner' | 'admin' | 'member'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id)
);

-- 3. Tenant settings (one row per tenant)
CREATE TABLE tenant_settings (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  limits        JSONB NOT NULL DEFAULT '{}',
  branding      JSONB NOT NULL DEFAULT '{}',
  feature_flags JSONB NOT NULL DEFAULT '{}',
  module_config JSONB NOT NULL DEFAULT '{}',
  prompt_config JSONB NOT NULL DEFAULT '{}',
  custom_schemas JSONB NOT NULL DEFAULT '{}',
  auth_config   JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Tenant integrations
CREATE TABLE tenant_integrations (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_type TEXT NOT NULL,
  enabled          BOOLEAN NOT NULL DEFAULT false,
  config           JSONB NOT NULL DEFAULT '{}',
  credentials_ref  TEXT NULL,
  sync_status      TEXT NULL,
  last_sync_at     TIMESTAMPTZ NULL,
  last_error       TEXT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, integration_type)
);

-- 5. Bootstrap: one tenant for the existing customer
INSERT INTO tenants (id, name, slug) VALUES (
  'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  'Sovereign Data',
  'sovereign-data'
);

INSERT INTO tenant_settings (tenant_id) VALUES ('xxxxxxxx-...');

-- 6. SECURITY DEFINER membership helper (sacred pattern, mirrors is_project_member)
CREATE OR REPLACE FUNCTION is_tenant_member(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_members
    WHERE tenant_id = p_tenant_id AND user_id = auth.uid()
  )
$$;
```

**Risk:** low. New tables only, no existing rows touched. The bootstrap
tenant has no behavioural effect until PR 3a.3 enables RLS.

---

### PR 3a.2 — Propagate `tenant_id` to every customer-owned table (with consistency)

**Migration `00033_tenant_id_everywhere.sql`**

This is the structural PR. It runs in five clearly separated steps so
that each step can be verified before the next runs. Backfills are
asserted with row-count checks; the migration aborts on mismatch.

#### Step 1 — Add `tenant_id` columns (NULLABLE for now)

```sql
-- Tier A — customer-owned
ALTER TABLE projects                  ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE project_members           ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE sources                   ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE source_chunks             ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE source_entities           ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE entity_mentions           ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE entity_relationships      ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE content_snippets          ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE interview_review_entities ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE reports                   ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE chat_conversations        ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE chat_messages             ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE chat_conversation_seq     ADD COLUMN tenant_id UUID REFERENCES tenants(id);

-- Tier B — hybrid (NULL = global)
ALTER TABLE entities                  ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE entity_aliases            ADD COLUMN tenant_id UUID REFERENCES tenants(id);
```

#### Step 2 — Backfill from the bootstrap tenant

Every existing customer-owned row goes to the bootstrap tenant. Tier B
rows that are currently scoped to a project inherit the tenant; rows
with `project_id IS NULL` (true global) stay `tenant_id IS NULL`.

```sql
-- Tier A: blanket assignment to bootstrap tenant
UPDATE projects                  SET tenant_id = 'xxxxxxxx-...' WHERE tenant_id IS NULL;
UPDATE project_members pm        SET tenant_id = p.tenant_id FROM projects p WHERE pm.project_id = p.id AND pm.tenant_id IS NULL;
UPDATE sources s                 SET tenant_id = p.tenant_id FROM projects p WHERE s.project_id = p.id AND s.tenant_id IS NULL;
UPDATE source_chunks sc          SET tenant_id = s.tenant_id FROM sources s WHERE sc.source_id = s.id AND sc.tenant_id IS NULL;
UPDATE source_entities se        SET tenant_id = s.tenant_id FROM sources s WHERE se.source_id = s.id AND se.tenant_id IS NULL;
UPDATE entity_mentions em        SET tenant_id = s.tenant_id FROM sources s WHERE em.interview_id = s.id AND em.tenant_id IS NULL;
UPDATE entity_relationships er   SET tenant_id = s.tenant_id FROM sources s WHERE er.interview_id = s.id AND er.tenant_id IS NULL;
UPDATE content_snippets cs       SET tenant_id = s.tenant_id FROM sources s WHERE cs.interview_id = s.id AND cs.tenant_id IS NULL;
UPDATE interview_review_entities ire SET tenant_id = s.tenant_id FROM sources s WHERE ire.interview_id = s.id AND ire.tenant_id IS NULL;
UPDATE reports r                 SET tenant_id = p.tenant_id FROM projects p WHERE r.project_id = p.id AND r.tenant_id IS NULL;

-- Conversations: derive from project if set; otherwise from primary tenant of the user.
UPDATE chat_conversations cc
   SET tenant_id = COALESCE(
     (SELECT p.tenant_id FROM projects p WHERE p.id = cc.project_id),
     (SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = cc.user_id ORDER BY tm.created_at LIMIT 1)
   )
 WHERE cc.tenant_id IS NULL;

UPDATE chat_messages cm          SET tenant_id = cc.tenant_id FROM chat_conversations cc WHERE cm.conversation_id = cc.id AND cm.tenant_id IS NULL;
UPDATE chat_conversation_seq cs  SET tenant_id = cc.tenant_id FROM chat_conversations cc WHERE cs.conversation_id = cc.id AND cs.tenant_id IS NULL;

-- Tier B: inherit from project where present
UPDATE entities e
   SET tenant_id = p.tenant_id
  FROM projects p
 WHERE e.project_id = p.id
   AND e.tenant_id IS NULL;

UPDATE entity_aliases a
   SET tenant_id = p.tenant_id
  FROM projects p
 WHERE a.project_id = p.id
   AND a.tenant_id IS NULL;

-- Anchor-only orphan entities with no project_id stay tenant_id = NULL (treated as global).
-- This is the same trade-off as today; the orphan-anchor reduction in PR 2.3
-- already minimised this set.

-- Bootstrap tenant_members from project_members (idempotent)
INSERT INTO tenant_members (tenant_id, user_id, role)
SELECT DISTINCT 'xxxxxxxx-...'::uuid, pm.user_id,
  CASE WHEN pm.role = 'owner' THEN 'owner' ELSE 'member' END
FROM project_members pm
WHERE pm.user_id IS NOT NULL
ON CONFLICT DO NOTHING;
```

#### Step 3 — Row-count assertion (abort on mismatch)

```sql
DO $$
DECLARE
  v_orphans INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_orphans FROM projects WHERE tenant_id IS NULL;
  IF v_orphans > 0 THEN RAISE EXCEPTION 'projects.tenant_id orphans: %', v_orphans; END IF;

  SELECT COUNT(*) INTO v_orphans FROM sources WHERE tenant_id IS NULL;
  IF v_orphans > 0 THEN RAISE EXCEPTION 'sources.tenant_id orphans: %', v_orphans; END IF;

  -- ... repeat for every Tier A table (chunks, mentions, rels, snippets,
  -- review_entities, reports, chat_*).
END $$;
```

#### Step 4 — `SET NOT NULL` on Tier A; keep Tier B nullable

```sql
ALTER TABLE projects                  ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE project_members           ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE sources                   ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE source_chunks             ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE source_entities           ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE entity_mentions           ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE entity_relationships      ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE content_snippets          ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE interview_review_entities ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE reports                   ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE chat_conversations        ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE chat_messages             ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE chat_conversation_seq     ALTER COLUMN tenant_id SET NOT NULL;
-- entities and entity_aliases stay nullable (Tier B)
```

#### Step 5 — Compound FKs and consistency triggers

```sql
-- Compound uniqueness on Tier A parents (enables compound FKs from children)
ALTER TABLE projects ADD CONSTRAINT projects_id_tenant_unique UNIQUE (id, tenant_id);
ALTER TABLE sources  ADD CONSTRAINT sources_id_tenant_unique  UNIQUE (id, tenant_id);
ALTER TABLE chat_conversations
  ADD CONSTRAINT chat_conversations_id_tenant_unique UNIQUE (id, tenant_id);

-- Compound FKs from children (parent and child must agree on tenant)
ALTER TABLE source_chunks
  ADD CONSTRAINT source_chunks_source_tenant_fkey
  FOREIGN KEY (source_id, tenant_id) REFERENCES sources(id, tenant_id) ON DELETE CASCADE;

ALTER TABLE source_entities
  ADD CONSTRAINT source_entities_source_tenant_fkey
  FOREIGN KEY (source_id, tenant_id) REFERENCES sources(id, tenant_id) ON DELETE CASCADE;

ALTER TABLE entity_mentions
  ADD CONSTRAINT entity_mentions_source_tenant_fkey
  FOREIGN KEY (interview_id, tenant_id) REFERENCES sources(id, tenant_id) ON DELETE CASCADE;

ALTER TABLE entity_relationships
  ADD CONSTRAINT entity_relationships_source_tenant_fkey
  FOREIGN KEY (interview_id, tenant_id) REFERENCES sources(id, tenant_id) ON DELETE CASCADE;

ALTER TABLE content_snippets
  ADD CONSTRAINT content_snippets_source_tenant_fkey
  FOREIGN KEY (interview_id, tenant_id) REFERENCES sources(id, tenant_id) ON DELETE CASCADE;

ALTER TABLE interview_review_entities
  ADD CONSTRAINT interview_review_entities_source_tenant_fkey
  FOREIGN KEY (interview_id, tenant_id) REFERENCES sources(id, tenant_id) ON DELETE CASCADE;

ALTER TABLE sources
  ADD CONSTRAINT sources_project_tenant_fkey
  FOREIGN KEY (project_id, tenant_id) REFERENCES projects(id, tenant_id);

ALTER TABLE reports
  ADD CONSTRAINT reports_project_tenant_fkey
  FOREIGN KEY (project_id, tenant_id) REFERENCES projects(id, tenant_id);

ALTER TABLE project_members
  ADD CONSTRAINT project_members_project_tenant_fkey
  FOREIGN KEY (project_id, tenant_id) REFERENCES projects(id, tenant_id);

ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_conversation_tenant_fkey
  FOREIGN KEY (conversation_id, tenant_id) REFERENCES chat_conversations(id, tenant_id) ON DELETE CASCADE;

ALTER TABLE chat_conversation_seq
  ADD CONSTRAINT chat_conversation_seq_conversation_tenant_fkey
  FOREIGN KEY (conversation_id, tenant_id) REFERENCES chat_conversations(id, tenant_id) ON DELETE CASCADE;

-- Tier B parents (entities) cannot use compound-FK because tenant_id is nullable.
-- Use a BEFORE INSERT/UPDATE trigger instead on every child that references entities:
--   entity_mentions, entity_relationships, source_entities, entity_aliases.
-- Pattern: see §3.8b.

-- Phase 2.5 unique index migrates from project scope to tenant scope
DROP INDEX IF EXISTS entities_name_type_scope_unique;
CREATE UNIQUE INDEX entities_name_type_scope_unique
  ON entities (normalized_name, type,
    COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid));

DROP INDEX IF EXISTS entity_aliases_alias_scope_unique;
CREATE UNIQUE INDEX entity_aliases_alias_scope_unique
  ON entity_aliases (entity_id, alias_normalized,
    COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Hot-path indexes
CREATE INDEX idx_sources_tenant_id          ON sources (tenant_id);
CREATE INDEX idx_source_chunks_tenant_id    ON source_chunks (tenant_id);
CREATE INDEX idx_source_chunks_tenant_source ON source_chunks (tenant_id, source_id);
CREATE INDEX idx_entity_mentions_tenant_id  ON entity_mentions (tenant_id);
CREATE INDEX idx_entity_relationships_tenant_id ON entity_relationships (tenant_id);
CREATE INDEX idx_reports_tenant_id          ON reports (tenant_id);
CREATE INDEX idx_chat_conversations_tenant_id ON chat_conversations (tenant_id);
-- ... etc.
```

**Risk:** medium. Backfill must equal source-of-truth row counts
exactly. The compound FKs mean a downstream pipeline that forgets to
write `tenant_id` will fail loudly, not silently — this is a feature.
The pipeline write path must be updated to set `tenant_id` on every
INSERT (PR 3a.3).

---

### PR 3a.3 — Pipeline writes + RLS swap + read-path scoping

**Migration `00034_tenant_rls.sql`**

```sql
-- Enable RLS on Tier A tables that didn't have it; harden Tier B
ALTER TABLE entities          ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_aliases    ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_chunks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_mentions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_relationships ENABLE ROW LEVEL SECURITY;
-- ... etc. (full list below)

-- Tier A pattern: direct tenant check, no joins
CREATE POLICY "sources_select" ON sources
  FOR SELECT USING (is_tenant_member(tenant_id));

CREATE POLICY "source_chunks_select" ON source_chunks
  FOR SELECT USING (is_tenant_member(tenant_id));

CREATE POLICY "entity_mentions_select" ON entity_mentions
  FOR SELECT USING (is_tenant_member(tenant_id));

-- ... mirror SELECT/INSERT/UPDATE for every Tier A table.

-- Tier B pattern: NULL is global, otherwise direct tenant check
CREATE POLICY "entities_select" ON entities
  FOR SELECT USING (
    tenant_id IS NULL
    OR is_tenant_member(tenant_id)
  );

CREATE POLICY "entities_insert" ON entities
  FOR INSERT WITH CHECK (
    tenant_id IS NULL
    OR is_tenant_member(tenant_id)
  );

CREATE POLICY "entity_aliases_select" ON entity_aliases
  FOR SELECT USING (
    tenant_id IS NULL
    OR is_tenant_member(tenant_id)
  );
-- ...

-- Tenancy meta-tables (read-own-tenant)
CREATE POLICY "tenants_select_own" ON tenants
  FOR SELECT USING (is_tenant_member(id));

CREATE POLICY "tenant_members_select_own" ON tenant_members
  FOR SELECT USING (is_tenant_member(tenant_id));

CREATE POLICY "tenant_settings_select_own" ON tenant_settings
  FOR SELECT USING (is_tenant_member(tenant_id));
```

**Pipeline / app code:**

- Every `createAdminClient()` write that today INSERTs into a Tier A
  table must also set `tenant_id`. Helper:

  ```typescript
  // src/lib/tenant/scope.ts
  export async function getSourceTenantId(
    supabase: SupabaseClient,
    sourceId: string
  ): Promise<string> {
    const { data, error } = await supabase
      .from("sources")
      .select("tenant_id")
      .eq("id", sourceId)
      .single();
    if (error || !data) throw new Error(`source ${sourceId} not found`);
    return data.tenant_id;
  }
  ```

  Pipeline writes (chunks, mentions, relationships, source_entities,
  snippets) take the source's `tenant_id` once at the top of
  `runIntelPipelineFromCanonicalSource` and set it on every batch
  insert.

- New module `src/lib/tenant/settings.ts` with typed accessors:
  `getTenantSettings`, `isFeatureEnabled`, `getTenantLimits`,
  `getTenantPromptConfig`. Cached per-request.

- Read-path updates:
  - `src/app/(dashboard)/dashboard/page.tsx` — counts scoped by
    `tenant_id` directly (single SELECT, no transitive join).
  - `src/app/(dashboard)/admin/entities/` — entity list filtered by
    `tenant_id`.
  - Chat brief builders (`buildProjectIntelBrief`,
    `buildWorkspaceIntelBriefForUser`) — replace any "workspace"
    naming with `tenant_id`.

- `src/types/database.ts` regenerated to include `tenant_id` on every
  Tier A and Tier B table plus the new tenancy tables.

**Risk:** medium-high. RLS swap is the highest-risk step in the whole
plan because it changes what the anon/cookie client is allowed to read.
Mitigations:

1. Pipeline writes (`createAdminClient()`) bypass RLS — sacred pattern,
   unchanged. So write paths cannot regress from this PR.
2. The single bootstrap tenant means every existing user is a member
   of every existing row's tenant — RLS reads the same rows it
   would have read before, just through a different predicate.
3. Smoke test every dashboard page + admin page + chat thread with the
   anon client before merging.
4. Each Tier A table's policy is enabled in a single transaction; if
   any policy regresses a UI page, the whole transaction can be
   reverted with one migration.

---

### PR 3a.4 — Phase 4a-aware: `chat_message_evidence` includes `tenant_id` from day one

When Phase 4a (chat evidence persistence) lands, the new
`chat_message_evidence` table is created with `tenant_id NOT NULL`
from day one and a compound FK to `chat_messages(id, tenant_id)`. No
backfill needed. (This isn't strictly part of Phase 3a — listed here
for forward-compatibility.)

---

## 8. Tables that intentionally do **not** receive `tenant_id` (and why)

Called out explicitly per the requirement:

| Table | Why no `tenant_id` |
|---|---|
| `tenants` | The tenant **is** the row — adding `tenant_id` to itself is meaningless. The primary key serves the same role. |
| `profiles` | Users are global identities. A user can belong to multiple tenants, so `profiles` cannot have a single `tenant_id`. The membership relationship lives in `tenant_members`. RLS = own profile only. |
| `user_platform_roles` | Platform staff (superusers, platform admins) are by definition above tenants — adding a `tenant_id` would imply a tenant boundary that should not exist for platform-level capabilities. RLS = own row. |
| `validated_positions` | Curated global catalog of person↔org titles, intentionally shared across all tenants. The platform team edits these centrally; tenants only read. RLS = SELECT for any authenticated user; INSERT/UPDATE only via admin client. |
| `entities` (NULLABLE only) | Hybrid — Tier B. Most entity rows **will** carry a `tenant_id`. NULL is reserved for true platform-global canonical entities (e.g. countries, well-known multinationals, ministries) that are deliberately reusable across customers. The unique index on `(normalized_name, type, COALESCE(tenant_id, sentinel))` keeps name collisions correctly partitioned. |
| `entity_aliases` (NULLABLE only) | Same logic as `entities`. NULL aliases are global lookup terms ("EU" → European Union). Tenant-scoped aliases carry the tenant. |

Everything else — sources, chunks, mentions, relationships, snippets,
reports, chat — has `tenant_id NOT NULL`.

---

## 9. What this does NOT change

- **Admin client pattern**: every pipeline mutation keeps using
  `createAdminClient()`. RLS is for anon/cookie reads.
- **`token_hash` auth flow**: untouched.
- **SECURITY DEFINER helpers** (`is_project_member()` etc.): kept, not
  replaced. New `is_tenant_member()` is added alongside them.
- **`sources`, `source_chunks`, `source_entities`** naming and shape:
  untouched. Phase 2 work is preserved exactly. Tenant-id is added as
  a new column; existing columns are unchanged.
- **`entity_intel` RPC**: untouched in shape. May gain an optional
  `p_tenant_id UUID DEFAULT NULL` filter as a later additive change
  for cross-project intelligence within a tenant.
- **`hybrid_search` RPC**: untouched in shape. Will gain a
  `filter_tenant_id` predicate as a small additive change so vector
  search filters before the HNSW probe.
- **Phase 3b, 4a, 4b** are independent of this work and proceed
  unchanged after 3a ships.

---

## 10. Summary of files this revised Phase 3a will touch

| Surface | Files |
|---|---|
| Migrations | `supabase/migrations/00032_tenants_core.sql`, `00033_tenant_id_everywhere.sql`, `00034_tenant_rls.sql` |
| Types | `src/types/database.ts` (regenerate to include `tenant_id` on every Tier A and Tier B table) |
| New modules | `src/lib/tenant/scope.ts`, `src/lib/tenant/settings.ts` |
| Pipeline | `src/lib/ai/pipeline.ts`, `src/lib/ai/document-pipeline.ts` (set `tenant_id` on every batch INSERT — chunks, mentions, relationships, source_entities, snippets) |
| Routes | `src/app/api/interviews/route.ts`, `src/app/api/interviews/from-pdf/route.ts`, `src/app/api/interviews/from-text/route.ts`, `src/app/api/reports/`, `src/app/api/chat/route.ts` (set `tenant_id` on row creation) |
| Read paths | `src/app/(dashboard)/dashboard/page.tsx`, `src/app/(dashboard)/admin/entities/`, `src/lib/chat/` (replace any "workspace" references with `tenant_id`) |
| Entity layer | `src/lib/entities/match.ts`, `src/lib/entities/resolve.ts` (resolve to a tenant scope, not a project scope, for the entity-name uniqueness check) |
| Docs | This file, `docs/infrastructure/database-schema.md`, `docs/roadmaps/database-refactor-plan.md` (update Phase 3a description) |

---

## 11. Decision record

| Field | Value |
|---|---|
| Status | **Proposed** — awaiting human approval before implementation begins |
| Decision | (a) Rename `workspaces` → `tenants` throughout Phase 3a. (b) Add `tenant_id` as a NOT NULL column on every customer-owned table; NULLABLE on the two hybrid Tier B tables (`entities`, `entity_aliases`); absent on the four explicitly tenant-agnostic tables (`tenants`, `profiles`, `user_platform_roles`, `validated_positions`). (c) Enforce parent/child consistency via compound `(id, tenant_id)` FKs where possible, triggers where Tier B nullability blocks compound FKs. (d) RLS uses `is_tenant_member(tenant_id)` directly — no multi-hop joins. (e) Add `tenant_settings` + `tenant_integrations` tables. (f) Defer dedicated-DB escape hatch to a future enterprise phase. |
| Author | AI agent |
| Date | 2026-05-08 (revised same day to add tenant_id-everywhere principle) |
| Next action | Human approves → create feature spec `docs/features/to-do/tenants-rls-and-customization.md` → move to `on-going/` when coding begins |
