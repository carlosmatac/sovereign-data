---
title: "Dashboard project-scoped stats (visibility bug)"
status: to-do
owner: team
priority: high
last_updated: 2026-05-10
related_infrastructure:
  - docs/infrastructure/database-schema.md
related_features:
  - docs/features/done/platform-user-roles-authorization.md
---

# Dashboard project-scoped stats (visibility bug)

## Problem

The dashboard currently shows **global aggregate counts** (total sources, total entities, total relationships, etc.) regardless of which projects the logged-in user is a member of. This means:

1. A user who is a member of only one project can see counts that include data from all other projects — breaking data isolation between clients or teams on the same platform.
2. Clicking on a source or entity that belongs to a project the user is not a member of leads to a **404** page, because the detail route's data fetch correctly applies project-scoped RLS and returns nothing.
3. The counts shown are therefore misleading and sometimes unusable.

With Phase 3a's tenant model now in place, the correct behaviour is: the dashboard shows only the counts for projects the user belongs to, within their tenant.

## Goals

- Dashboard aggregate counts (sources, entities, relationships, and any other summary stats) must reflect only the projects the current user is a member of.
- A user cannot navigate from the dashboard to a source/entity/report they do not have access to (no more 404 paths from the dashboard).
- The fix must be consistent with the existing RLS model (`is_project_member`, `is_tenant_member`) and the admin client pattern (mutations only; reads can use the user's anon/cookie session).

## Non-goals

- A UI for browsing other projects or requesting access.
- Changing RLS policies (they are already correct; the bug is in how the dashboard query aggregates — likely bypassing RLS via service role or using a too-broad query).
- Per-project breakdowns on the dashboard (nice-to-have, separate feature).

## Approach

1. **Audit the dashboard data-fetch:** identify which API route(s) or server component(s) produce the aggregate counts. Determine whether they use the admin (service role) client — if so, they bypass RLS and return global counts.
2. **Scope the queries to the user's projects:** replace the unscoped aggregate with a query that:
   - Resolves the user's project membership via `project_members` (filtered by `user_id = auth.uid()` within the user's session client, or via an explicit `getUser()` + project list using the admin client).
   - Aggregates counts only for those project IDs.
3. **Ensure navigation links on the dashboard only point to accessible resources:** the listing queries that power the clickable rows should also be scoped. If a row has no RLS-safe path, it must not be rendered.
4. **Verify the fix with a multi-project setup:** log in as a user who is a member of only one project and confirm counts match that project's data.

## Technical notes

- The correct read pattern for user-scoped queries: use `createServerClient()` (the cookie-based session client), not `createAdminClient()`. The user session client applies RLS automatically.
- If the dashboard aggregation currently uses `createAdminClient()` for reads (which bypasses RLS), it must be switched to the session client for this feature — this is the likely root cause.
- `project_members` RLS: users can read their own membership rows (`user_id = auth.uid()`), so `SELECT project_id FROM project_members WHERE user_id = auth.uid()` is safe to run as the user.
- Tenant boundary: within Phase 3a, users are also scoped by `tenant_id`. If the aggregation goes tenant-wide, check that `is_tenant_member(tenant_id)` is evaluated.

## Risks & open questions

- **Admin client misuse for reads:** if many dashboard components use the admin client for read performance (a common shortcut), switching to the session client may require per-route changes. Audit thoroughly before starting.
- **Open question:** does the dashboard have a "global admin" view that intentionally shows all data (for `superuser` / `platform_admin` roles)? If so, the scoping logic must preserve that behavior for privileged roles while restricting ordinary members. See [`platform-user-roles-authorization.md`](../done/platform-user-roles-authorization.md) for role definitions.

## Acceptance / how to validate

- [ ] Log in as a user who is a member of exactly one project; confirm dashboard counts match only that project's sources/entities/relationships.
- [ ] Confirm every clickable source/entity/report card on the dashboard leads to a valid detail page (no 404s).
- [ ] Log in as a `superuser`/`platform_admin`; confirm they still see the expected broad view (if applicable per role spec).
- [ ] No regression on the Network Explorer or Interview Detail pages.
