---
title: "Platform user roles & authorization layer"
status: to-do
owner: team
priority: high
last_updated: 2026-03-22
related_architecture: []
related_infrastructure:
  - docs/infrastructure/database-schema.md
---

# Platform user roles & authorization layer

## Problem

Today, **authorization inside the product** is expressed mainly through **project membership** (`project_members.role`: owner / editor / viewer). That model answers “what can this user do **within project X**?” but not “what **platform-wide** capabilities does this user have?”

We need a **platform-level role system** so we can:

- Grant a small set of users **elevated privileges** (e.g. governance tools that span or sit above single-project workflows).
- Keep **everyone else** on a safe default with **no accidental admin surface**.
- Avoid overloading **project roles** with concerns that are not about a single tenant/project (e.g. global knowledge-base governance).

Without this, features such as an **admin entity governance** UI either ship as insecure (open to all authenticated users), rely on ad-hoc allowlists, or conflate “project owner” with “platform administrator” in ways that do not match the business.

## Goals

- Each authenticated user has **one or more platform roles** (MVP may implement a **single primary role** per user if that reduces complexity, as long as the data model does not forbid multiple roles later).
- **Default for all new and existing users:** the **standard / non-admin** role only, until explicitly promoted.
- **Clear naming** that does not collide with SQL/RLS vocabulary or existing **`user_role`** on `project_members`.
- **Documented** map of which **areas and actions** are restricted by platform role (MVP list + placeholders for growth).
- Implementation later must respect sacred patterns from [`HANDOVER.md`](../../../HANDOVER.md): **admin client after `getUser()`**, **`token_hash` auth**, **SECURITY DEFINER RLS helpers** (this spec does not prescribe replacing them).

## Non-goals (this feature doc / initial delivery)

- Replacing **project membership** (owner/editor/viewer) or merging it into platform roles.
- Full **attribute-based access control (ABAC)** or per-resource policies beyond what we explicitly list.
- **Customer-defined roles** or self-service role administration UI (possible later).
- **Auditing / compliance** exports as a full product (basic audit trail may be a follow-up).

## Role naming assessment

Initial idea: **`SYSADMIN`** and **`PUBLIC`**.

| Name | Concern |
|------|--------|
| **`PUBLIC`** | In PostgreSQL and RLS mental models, “public” often reads as **unauthenticated or universal**. All our subjects here are **authenticated product users**. The name is easy to misread in code reviews and ops. |
| **`SYSADMIN`** | Strongly suggests **infrastructure / database superuser**, not “trusted operator of the intelligence knowledge base.” It collides with how engineers talk about Supabase and OS accounts. |

**Recommendation (platform roles, distinct from `project_members.role`):**

| Role key (suggested) | Meaning |
|---------------------|--------|
| **`member`** | Default authenticated user. Full product use **subject to project membership** (owner/editor/viewer per project). No platform-admin surfaces. |
| **`platform_admin`** | Elevated operator: may use platform-wide governance tools (e.g. admin entity dashboard), subject to whatever additional checks we add (project scoping, audit, etc.). |

**Display labels** in UI can read “Member” / “Platform administrator” without using the SQL-fraught terms above.

**If you prefer shorter enums:** `member` + `admin` is acceptable if documented and disambiguated from project `owner`. Prefer **`platform_admin`** in code when ambiguity matters.

## Initial role model

- **`member`** — default; baseline platform access.
- **`platform_admin`** — elevated; access to admin/governance experiences defined in other specs.

Future extensions (not MVP): e.g. `billing_admin`, `support`, read-only auditor, multi-tenant org roles — to be added only with separate specs.

## Default role behavior

- **On signup / first profile creation:** assign **`member`** only (or ensure equivalent “no admin” state).
- **Existing users** when the feature ships: **backfill as `member`** unless explicitly listed for promotion (operations decision).
- **Promotion to `platform_admin`:** explicit, human-controlled process (script, Supabase dashboard + migration, or small internal admin flow — implementation detail in `on-going` phase).

## Areas / actions to restrict by platform role (MVP map)

Documented here as **product intent**; exact enforcement (RLS, route guards, server actions) comes at implementation time.

**Likely `member`-only (no `platform_admin` required)** — unchanged from today, still gated by **project** role where applicable:

- Dashboard, interviews, chat, network explorer, reports, transcript review, **Entity Editor** on interview pages (editor/owner on that project per current behavior).

**Likely `platform_admin`-only (new or tightened)**:

- **Admin entity governance dashboard** (see [`admin-entity-governance-dashboard.md`](./admin-entity-governance-dashboard.md)): search/list entities across the knowledge base, edit canonical fields outside the normal interview-scoped UX, and other governance actions defined there.
- Any future **global config**, **impersonation**, **bulk data repair**, or **cross-project merge** tools should default to this tier unless given their own role.

**Explicitly not decided in this doc (open at implementation):**

- Whether `platform_admin` bypasses project RLS for reads/writes or must still be a member of a project for some tables — product/security choice; likely “admin tools use **service role + explicit checks**” per existing admin client pattern rather than weakening RLS for all users.

## Approach (strategy)

1. **Model** platform roles in the database (e.g. join table `user_platform_roles` or array/column on `profiles`) and/or propagate a **claim** to the session if we adopt JWT custom claims — **tradeoffs** to be decided in `on-going` (source of truth should be single and auditable).
2. **Server-side enforcement** for every sensitive mutation: after `getUser()`, verify platform role, then use established **service role** patterns where `auth.uid()` is null in PostgREST.
3. **UI**: hide admin navigation entries unless the user has `platform_admin`; server remains the authority.
4. **Tests / validation**: matrix of “member vs platform_admin” × critical routes.

## User experience (optional)

- No dedicated “role management” UI in MVP unless trivial (e.g. internal-only page). Users see no difference except absence/presence of **Admin** entry points.
- Copy should say **“Platform admin”** or **“Administrator”** in UI, not “sysadmin.”

## Technical notes (optional, non-binding)

- **Naming collision:** PostgreSQL enum `user_role` already means project member role — platform roles should use a **different enum/type name** (e.g. `platform_role`).
- **Multi-role:** schema should allow multiple rows or an array; MVP product behavior might treat “has any `platform_admin`” as admin.
- Link for schema context: [`database-schema.md`](../../infrastructure/database-schema.md) (`profiles`, `project_members`, `entities`).

## Dependencies & related docs

- **Blocks (conceptually)** clean gating of [`admin-entity-governance-dashboard.md`](./admin-entity-governance-dashboard.md) — that feature should assume **`platform_admin`** (or successor) exists.
- Related shipped behavior: [`../done/human-in-the-loop.md`](../done/human-in-the-loop.md) (Entity Editor — project-scoped, not a substitute for this).

## Risks & open questions

- **Source of truth:** DB-only vs JWT claims — consistency and revocation when roles change.
- **Overlap with project owner:** CEOs may expect “owner = god mode”; product must clarify **project power ≠ platform power**.
- **Global vs project-scoped entities:** `entities.project_id` nullable — admin tools need clear rules for **global** rows.

## Acceptance / how to validate (for implementation phase)

- New user receives **only** default (`member`) platform role.
- User promoted to `platform_admin` can reach admin-only surfaces; `member` cannot (API returns 403 / consistent denial).
- No regression to magic-link auth or RLS helper patterns without an explicit architecture review.

## Implementation log (optional)

- _Empty until work moves to `on-going/`._
