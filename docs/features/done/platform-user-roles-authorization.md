---
title: "Platform user roles & authorization layer"
status: done
owner: carlos mata
priority: high
last_updated: 2026-03-23
related_architecture: []
related_infrastructure:
  - docs/infrastructure/database-schema.md
---

# Platform user roles & authorization layer

## Problem

**Project membership** (`project_members.role`: owner / editor / viewer) answers “what can this user do **within project X**?” It does not model **platform-wide** capabilities or separate **identity governance** from **knowledge governance**.

## Goals

- Exactly **three** global roles: **`member`**, **`platform_admin`**, **`superuser`** — no further global roles without a new spec.
- **Separation of duties:**
  - **`platform_admin`** → **entity / knowledge governance** only (structured KB, canonical entities). **Cannot** manage users or global roles.
  - **`superuser`** → **user & global role management** **and** everything `platform_admin` can access for Platform Administration.
- **Default:** every account gets **`member`** until elevated.
- Sacred patterns from [`HANDOVER.md`](../../../HANDOVER.md): **admin client after `getUser()`**, **`token_hash`**, **SECURITY DEFINER helpers** (unchanged).

## Governance & operating model

| Topic | Decision |
|-------|----------|
| **Role set** | **`member`**, **`platform_admin`**, **`superuser`** only. |
| **Default** | **`member`** on signup (`handle_new_user`). |
| **Bootstrap** | First **superuser** (or first elevated user) may be created via **SQL / service role**. Migration **`00018`** maps legacy **`platform_admin`** rows to **`superuser`** so existing full admins are not locked out of user management. |
| **Ongoing** | **`superuser`** grants/revokes **`platform_admin`** and **`superuser`** in-app at **`/admin/users`** — see [`platform-user-role-management.md`](./platform-user-role-management.md). |
| **Project vs platform** | **Project owner ≠ superuser** and **≠ platform_admin**. |

## Role semantics (authoritative)

| Role | Meaning |
|------|--------|
| **`member`** | Normal authenticated user; product features gated by **project** roles as today. No Platform Administration. |
| **`platform_admin`** | **Entity / knowledge governance** surfaces (`/admin/entities` and future entity admin tools). **No** `/admin/users`, no grant/revoke of global roles. |
| **`superuser`** | **Users & global roles** (`/admin/users`) **plus** entity governance. Sees **administration hub** at `/admin` with both destinations. |

## Non-goals

- Fourth global role, per-resource RBAC designers, or merging with `project_members.role`.

## UI / IA

- Sidebar: **System → Platform Administration** if `platform_admin` **or** `superuser` (`hasEntityGovernanceAccess` / `hasPlatformAdministrationAccess`).
- **Routing** (see app implementation):
  - **`platform_admin` only:** `/admin` → redirect **`/admin/entities`** (single useful destination).
  - **`superuser`:** `/admin` → **hub** (cards: Users & global roles, Entity governance).
- Nav labels use **product names**, not raw enum strings.

## Areas by role

| Area | `member` | `platform_admin` | `superuser` |
|------|----------|------------------|-------------|
| Main product (projects, interviews, chat, …) | ✓ (per project) | ✓ | ✓ |
| `/admin` layout (entity gov gate) | ✗ | ✓ | ✓ |
| `/admin/entities` | ✗ | ✓ | ✓ |
| `/admin/users` | ✗ | ✗ | ✓ |

## Technical notes (shipped)

- **Migrations:** `00016_platform_user_roles.sql`, `00018_platform_role_superuser.sql` (enum `superuser`, migrate old `platform_admin` → `superuser`, `is_superuser()`, `has_entity_governance_access()`, drop `is_platform_admin()`).
- **App:** `src/lib/auth/platform-roles.ts` — `fetchPlatformRolesForUser`, `canManageGlobalPlatformRoles`, `hasEntityGovernanceAccess`, `hasPlatformAdministrationAccess`, `requireSuperuser`, `requireEntityGovernanceUser`.
- **Types:** `PlatformRole` in `src/types/database.ts`.

### Bootstrap / break-glass (SQL)

**First superuser** (full administration):

```sql
INSERT INTO user_platform_roles (user_id, role)
VALUES ('<profile uuid>', 'superuser')
ON CONFLICT (user_id, role) DO NOTHING;
```

**Entity-only operator** (`platform_admin` without user management):

```sql
INSERT INTO user_platform_roles (user_id, role)
VALUES ('<profile uuid>', 'platform_admin')
ON CONFLICT (user_id, role) DO NOTHING;
```

## Dependencies & related docs

- [`platform-user-role-management.md`](./platform-user-role-management.md) (superuser-only).
- [`admin-entity-governance-dashboard.md`](../to-do/admin-entity-governance-dashboard.md) (`platform_admin` + `superuser`).

## Implementation log

- **2026-03-22:** `00016`, initial `/admin` gating, sidebar.
- **2026-03-23:** Sidebar IA, role-management UI, hub routing iterations.
- **2026-03-23 (pm):** **`superuser`** role; split **entity governance** vs **user/role governance**; `00018`; `/admin` hub vs redirects; `/admin/entities` placeholder.
- **2026-03-23:** Validated; moved to **`done/`**.
