---
title: "Platform user & role management"
status: done
owner: carlos mata
priority: high
last_updated: 2026-03-23
related_architecture: []
related_infrastructure:
  - docs/infrastructure/database-schema.md
---

# Platform user & role management

## Problem

Global **platform roles** live in `user_platform_roles`. **User and role governance** must be **separate** from **entity / knowledge governance**: only **`superuser`** should assign global roles.

## Goals

- **`superuser`** manages **`platform_admin`** and **`superuser`** assignments from the product.
- **`platform_admin`** **never** uses this UI or the underlying mutations (enforced server-side).
- Search/list users, view roles, grant/revoke **`platform_admin`** and **`superuser`**.
- Global model stays **three roles** only: `member`, `platform_admin`, `superuser`.

## Non-goals

- Extra global roles, project team management (`project_members`), bulk CSV, full audit product.

## Who can access

- **`superuser`** only for **`/admin/users`** and server actions in `platform-role-management.ts`.
- **`platform_admin`** without superuser: redirected to **`/admin/entities`** if they hit `/admin/users`.
- **`member`:** no access; actions return **Forbidden**.

## Shipped behavior

- **List / paginate** Auth users; **search** email + profile name (500-user scan cap).
- **Grant / revoke** **`platform_admin`** and **`superuser`** via `grantPlatformRole` / `revokePlatformRole`.
- **`member`** row ensured before elevating a user.

## Safety rules

- **Last superuser:** cannot revoke **`superuser`** when only one remains (UI + server). Break-glass: SQL in Supabase.
- **`platform_admin`** revoke has **no** “last one” rule (does not control this panel).

## Approach

- After **`getUser()`**, verify **`canManageGlobalPlatformRoles`** (superuser); mutations use **`createAdminClient()`**.

## Files

- `src/app/actions/platform-role-management.ts`
- `src/app/(dashboard)/admin/users/page.tsx`
- `src/components/admin/platform-users-table.tsx`
- `src/lib/admin/load-platform-users.ts`

## Dependencies

- [`platform-user-roles-authorization.md`](./platform-user-roles-authorization.md)

## Implementation log

- **2026-03-23:** Initial ship (platform_admin-only callers).
- **2026-03-23 (pm):** **Superuser-only** access; grant/revoke **both** `platform_admin` and `superuser`; last-**superuser** guard.
- **2026-03-23:** Validated; moved to **`done/`**.
