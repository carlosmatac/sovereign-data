---
title: "Platform user roles & authorization layer"
status: on-going
owner: carlos mata
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
- Implementation respects sacred patterns from [`HANDOVER.md`](../../../HANDOVER.md): **admin client after `getUser()`**, **`token_hash` auth**, **SECURITY DEFINER RLS helpers** (not replaced).

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

**Implemented (initial):**

- **`/admin`**: `layout.tsx` allows content only if the user has `platform_admin`; otherwise an access-restricted message (project owners are **not** auto-granted).
- **Sidebar**: “Platform admin” link only when `platform_admin` is present.
- **DB**: `user_platform_roles` with RLS **SELECT** own rows; no user-facing INSERT/UPDATE (promotion via service role / SQL).

**Still to wire (as other features land):**

- Admin entity governance dashboard mutations should call `requirePlatformAdminUser` (or equivalent) and use the **admin client** pattern for writes per [`HANDOVER.md`](../../../HANDOVER.md).

**Likely `member`-only (no `platform_admin` required)** — unchanged from today, still gated by **project** role where applicable:

- Dashboard, interviews, chat, network explorer, reports, transcript review, **Entity Editor** on interview pages (editor/owner on that project per current behavior).

**Likely `platform_admin`-only (new or tightened)**

- **Admin entity governance dashboard** (see [`admin-entity-governance-dashboard.md`](../to-do/admin-entity-governance-dashboard.md)).
- Any future **global config**, **impersonation**, **bulk data repair**, or **cross-project merge** tools should default to this tier unless given their own role.

## Approach (strategy)

1. **Model** platform roles in the database — **implemented:** `platform_role` enum + `user_platform_roles` (unique `(user_id, role)`); source of truth is the DB (not JWT claims for MVP).
2. **Server-side enforcement** for sensitive mutations: after `getUser()`, verify platform role; use **service role** where required for admin tools.
3. **UI**: hide admin navigation unless `platform_admin`; server remains the authority.
4. **Tests / validation**: matrix of “member vs platform_admin” × critical routes — optional follow-up.

## Technical notes (shipped)

- **Migration:** `supabase/migrations/00016_platform_user_roles.sql` — enum, table, RLS, `handle_new_user` assigns `member`, backfill for existing `profiles`.
- **Helper:** `public.is_platform_admin()` SECURITY DEFINER (for future RLS / RPC; app currently reads roles via `user_platform_roles` with session client).
- **App:** `src/lib/auth/platform-roles.ts` — `fetchPlatformRolesForUser`, `hasPlatformAdminRole`, `requirePlatformAdminUser`.
- **Types:** `PlatformRole`, table `user_platform_roles` in `src/types/database.ts`.

### Promote a user to `platform_admin` (operators)

Use the **service role** or Supabase SQL editor (not the anon key):

```sql
INSERT INTO user_platform_roles (user_id, role)
VALUES ('<profile uuid>', 'platform_admin')
ON CONFLICT (user_id, role) DO NOTHING;
```

## Dependencies & related docs

- **Blocks (conceptually)** clean gating of [`admin-entity-governance-dashboard.md`](../to-do/admin-entity-governance-dashboard.md).
- Related shipped behavior: [`../done/human-in-the-loop.md`](../done/human-in-the-loop.md) (Entity Editor — project-scoped).

## Risks & open questions

- **JWT claims:** not used in MVP; role changes are effective on next request when reading from DB.
- **Overlap with project owner:** UI copy on `/admin` denial states project ownership does not grant platform admin.

## Acceptance / how to validate

- New user receives **only** default (`member`) platform role.
- User with `platform_admin` can open `/admin` and see the sidebar link; `member` cannot (denial page, no nav link).
- Magic-link auth and existing RLS helpers unchanged.

## Implementation log

- **2026-03-22:** Migration `00016_platform_user_roles.sql`; app helpers; dashboard layout + sidebar gating; `/admin` placeholder layout + page; types updated; `database-schema.md` updated.
