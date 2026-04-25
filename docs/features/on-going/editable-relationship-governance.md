---
title: "Editable relationship governance (interview-scoped MVP + admin Phase 2)"
status: on-going
owner: ventura
priority: high
last_updated: 2026-04-19
related_architecture:
  - docs/architecture/ingestion-pipeline.md
related_infrastructure:
  - docs/infrastructure/database-schema.md
---

> **2026-04-19 follow-up (graph filtering + taxonomy v2).** See the
> "Phase 1.5 — Graph filtering + taxonomy v2" section at the bottom of
> this doc for the surgical fix that excludes `rejected` rows from active
> graph / connections / chat / report views and adds four new relation
> types (`affiliated_with`, `operates_in`, `governs`, `customer_of`)
> while keeping `business_partner` / `ally` valid as legacy values.

# Editable relationship governance (interview-scoped MVP)

## Problem

LLM-extracted relationships in `entity_relationships` are often wrong or too coarse, and editors have no way to correct them. Two compounding gaps make this dangerous today:

1. There is **no editable UI** — relationships are read-only on the interview detail page.
2. Even if we added editing, **reprocess wipes the table for the interview** (`clear_interview_derived_data` in migration `00013`) and the LLM may freely re-create the same wrong rows on the next pass.

This MVP closes both gaps for the **interview detail** page only. A global admin governance experience for relationships is intentionally deferred to a later phase.

## Goals

- Editors can **change the relation type** of any relationship of an interview they have access to.
- Editors can **reject** a relationship (editorial state, not destructive deletion).
- Editors can **approve** a relationship.
- **Human decisions survive reprocess**: rejected and human-edited rows are not wiped by `clear_interview_derived_data`.
- **Rejected relationships are not blindly recreated** by the LLM on a future reprocess of the same interview.
- The change is local to the interview detail page; existing rendering still works for read-only viewers.

## Non-goals (explicit)

- Reverse direction toggle (swap source/target).
- Manual relationship creation.
- Global cross-interview admin page for relationships.
- Global suppression of a relationship across all interviews.
- Taxonomy redesign (we keep the current 10-value `relation_type` enum; UI is generic so we can extend later).

## Approach

### 1. Schema (migration `00023_relationship_editorial.sql`)

Add minimal editorial metadata on `entity_relationships`:

- `review_status relationship_review_status NOT NULL DEFAULT 'pending'` — enum `pending | approved | rejected`.
- `origin relationship_origin NOT NULL DEFAULT 'llm'` — enum `llm | human_created | human_edited`.
- `reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL`.
- `reviewed_at timestamptz`.
- `updated_at timestamptz NOT NULL DEFAULT now()` + standard `update_updated_at()` trigger.

Update `clear_interview_derived_data` so that **only LLM-pending** rows are deleted on reprocess:

```sql
DELETE FROM entity_relationships
 WHERE interview_id = p_interview_id
   AND review_status = 'pending'
   AND origin = 'llm';
```

Mentions, chunks and snippets continue to be wiped fully (they are not editorial state).

### 2. Persistence gate

`applyPersistenceGate` (`src/lib/ai/persistence-gate.ts`) gains an optional `rejectedRelationshipKeys: Set<string>` input (`source|target|relation_type`). Any newly-extracted row whose key is in that set is filtered out. Stats expose `relationshipsSuppressedByEditorial`.

### 3. Pipeline

`runIntelPipelineFromCanonicalSource` (`src/lib/ai/pipeline.ts`):

1. After `clear_interview_derived_data` (or unconditionally if not clearing), pre-fetch every rejected `(source, target, relation_type)` for the interview.
2. Pass them into `applyPersistenceGate`.
3. Insert rows with explicit `origin: 'llm'` and `review_status: 'pending'` on `Insert` (defaults make this redundant but explicit is safer for tests).

### 4. Editorial actions (`src/app/actions/relationship-editorial.ts`)

- `updateRelationshipType(relationshipId, newType)` — flips current row to `rejected` (editorial intent: this exact triple is wrong) and inserts a new `(source, target, newType)` row with `origin='human_edited'` + `review_status='approved'`.
- `rejectRelationship(relationshipId)` — sets `review_status='rejected'`.
- `approveRelationship(relationshipId)` — sets `review_status='approved'`.
- `restoreRelationship(relationshipId)` — back to `pending` (lets editors undo a click).

Permissioning reuses the **interview-editor** pattern from `interview-speakers.ts`: `getUser()` → admin-client membership lookup → owner/editor only.

### 5. UI (interview detail page)

A new client component `RelationshipsList` replaces the inline UL inside the existing Relationships card on `/interviews/[id]`.

- Renders all relationships, including rejected (with reduced opacity + status badge) so the user sees what was suppressed.
- Each row gets a small action menu when `canEdit` is true: change type (popover with the canonical relation types), reject, approve, restore.
- Status / origin badges render generically; type list is sourced from a single `RELATION_TYPE_VALUES` constant so future taxonomy expansion is one-line.

## Constraints

- **Sacred rules** from `HANDOVER.md` respected: admin client after `getUser()`; SECURITY DEFINER helper updated, not replaced; no RLS rewrite.
- Pipeline upserts continue to use the existing unique key `(source_entity_id, target_entity_id, relation_type, interview_id)`.

## Likely code paths

- `supabase/migrations/00023_relationship_editorial.sql` (new)
- `src/types/database.ts`
- `src/lib/ai/persistence-gate.ts`
- `src/lib/ai/pipeline.ts`
- `src/app/actions/relationship-editorial.ts` (new)
- `src/components/interviews/relationships-list.tsx` (new)
- `src/app/(dashboard)/interviews/[id]/page.tsx`
- `src/__tests__/relationship-editorial.test.ts` (new)

## Acceptance / how to validate

- A rejected relationship does **not** reappear after `reprocessInterviewFromReview` for the same interview.
- A relation-type edit (`ally → business_partner`) survives reprocess; the original `(ally)` triple is rejected and not re-extracted.
- Pending LLM relationships still regenerate normally on reprocess.
- Interview Detail page: editor can change a relation type and reject/approve rows; viewer sees no controls.
- Existing relationship rendering still works (network/graph pages untouched).

## Phase 2 (out of scope)

- Global admin relationships page across interviews.
- Reverse-direction toggle.
- Manual relationship creation.
- Cross-interview suppression.
- Auditable history table for editorial events.

---

## Phase 1.5 — Graph filtering + taxonomy v2 (2026-04-19)

Two scoped follow-ups on top of the MVP.

### A. Graph filtering: rejected ≠ active

**Problem.** After the MVP, editors could reject a relationship on the
interview detail page but it kept showing up as an active edge in the
Network Explorer (graph + side panel), in the chat agent's relationship
lookups, in report intelligence, and in the dashboard counts. The
editorial state existed but wasn't enforced anywhere downstream.

**Rule.** A relationship is **active** iff `review_status IN ('pending',
'approved')`. `rejected` rows survive in the DB for editorial workflows
(interview-detail review UI, suppression on reprocess) and are visible
on the interview-detail Relationships card, but never appear elsewhere.

The canonical constant for this rule lives in `src/types/database.ts`:

```ts
export const ACTIVE_RELATIONSHIP_REVIEW_STATUSES: readonly RelationshipReviewStatus[] = [
  "pending",
  "approved",
];
```

**Where the filter was added.** Every `entity_relationships` query that
feeds an active view now includes `.neq('review_status', 'rejected')`:

| File | Surface | Change |
|------|---------|--------|
| `src/app/api/graph/[projectId]/route.ts` | Network Explorer graph edges + connections panel | `.neq('review_status', 'rejected')` |
| `src/lib/ai/entity-lookup.ts` (`getRelationships`) | Chat agent tool calls | `.neq('review_status', 'rejected')` on both incoming + outgoing queries |
| `src/lib/reports/intelligence-layer.ts` | Report generation (active intelligence) | `.neq('review_status', 'rejected')` |
| `src/app/(dashboard)/dashboard/page.tsx` | Dashboard relationship count | `.neq('review_status', 'rejected')` |

**Intentionally untouched (editorial / governance reads):**

- `src/app/(dashboard)/interviews/[id]/page.tsx` — already shows all rows including rejected (correct for the editorial UI).
- `src/app/actions/relationship-editorial.ts` — must read all rows.
- `src/lib/admin/load-governance-entities.ts`, `src/components/admin/governance-entity-detail.tsx` — governance/admin counts include all rows.
- `src/app/actions/entities.ts` — entity-merge logic must operate on every row.
- `src/lib/ai/pipeline.ts` — already correctly reads only `rejected` rows (suppression list).

### B. Taxonomy v2 — minimal upgrade

**Migration `00024_relationship_taxonomy_v2.sql`** adds four new values
to the `relation_type` Postgres enum, idempotently via `ADD VALUE IF
NOT EXISTS`:

- `affiliated_with` — preferred PERSON ↔ ORG/COMPANY/GOVERNMENT generic association (executives, directors, ministry officials, marketing leads, spokespersons, senior staff). Replaces overuse of `business_partner` for person↔org links.
- `operates_in` — preferred COMPANY/ORG ↔ LOCATION/COUNTRY operational presence. Replaces overuse of `business_partner` / `ally` for org↔country links.
- `governs` — GOVERNMENT/regulator ↔ COMPANY/ORG/COUNTRY institutional control.
- `customer_of` — commercial buyer ↔ vendor/supplier counterpart for `supplier`.

`business_partner` and `ally` are kept valid in the DB and TS so no
historical row breaks. The extraction prompt and Zod enum are updated to
prefer the v2 values over them.

**Files updated for the taxonomy:**

- `supabase/migrations/00024_relationship_taxonomy_v2.sql` (new)
- `src/types/database.ts` — `RelationType` and `RELATION_TYPE_VALUES` reordered with v2 first, legacy at the end.
- `src/lib/ai/persistence-gate.ts` — `ExtractedRelationship.relation_type` now imports `RelationType` from the type file (single source of truth).
- `src/lib/ai/extraction.ts` — Zod enum extended; per-value selection guidance added to `.describe()` and the prompt's INSTRUCTIONS block.

The relation-type dropdown on the interview detail page surfaces the v2
values first because it iterates `RELATION_TYPE_VALUES` in declaration
order — no UI change required.

### C. Tests

- `src/__tests__/relationship-active-filter.test.ts` (new) — contract tests for `ACTIVE_RELATIONSHIP_REVIEW_STATUSES` and the predicate that mirrors the DB filter; guards against regressions where someone copies an active query without the filter.
- `src/__tests__/relationship-editorial.test.ts` — extended with a regression test that confirms the persistence gate accepts the new v2 enum values.

### D. Acceptance / how to validate

1. Reject a relationship on `/interviews/[id]`; refresh `/network`. The edge and the side-panel row disappear. The interview-detail card still shows the row with the "Rejected" badge.
2. Run `vitest`: every test (89) passes including the two new contract tests.
3. Trigger a fresh extraction and inspect the resulting `relation_type` distribution: person↔org links default to `affiliated_with` and org↔country links default to `operates_in` instead of `business_partner` / `ally`.
4. Existing rows with `business_partner` / `ally` still render and are still editable (the dropdown lists every enum value, v2 first).

### E. Out of scope for Phase 1.5

- Bulk-rewriting historical `business_partner` / `ally` rows to v2 types.
- Removing legacy values from the DB or TS.
- Redesigning graph coloring / edge styling for the new types.
- Global admin relationships page (still phase 2).

---

## Phase 2 — Admin entity governance Relationships section (2026-04-19)

Adds an editable Relationships section **inside** the existing Entity
Governance detail panel at `/admin/entities/[id]`. Intentionally
**not** a standalone `/admin/relationships` route — that would balloon
into a different product. Reuses the editorial model (`review_status`,
`origin`, etc.) and the existing relationship editorial server actions.

### A. Problem

After Phase 1 + 1.5, admins could see a `relationship_count` on an
entity in `/admin/entities/[id]` but had **no way to inspect or manage
the actual rows**. The interview-detail page only edits relationships
of a single interview, and platform admins are not always project
members of the interviews where a problematic edge originated.

### B. Approach

1. **New admin loader** (`src/lib/admin/load-governance-relationships.ts`)
   returns paginated rows for one entity (incoming + outgoing,
   **including rejected**). Distinct from `getRelationships` in
   `src/lib/ai/entity-lookup.ts` which is chat-oriented and excludes
   rejected rows.
   - Stable row shape `GovernanceRelationshipRow` — relationship id,
     source/target ids + names + types, relation type, confidence,
     evidence, interview id + title, `review_status`, `origin`,
     `reviewed_at`, `reviewed_by`, `updated_at`, `direction`
     (`incoming`/`outgoing` relative to the queried entity), and the
     `related_entity_*` triple (the entity on the OTHER side of the
     edge — convenience for the admin table).
   - Filters: `statusFilter` (`all` | `active` | `pending` | `approved`
     | `rejected`), `directionFilter` (`all` | `incoming` | `outgoing`).
   - Pagination via `page` + `pageSize`
     (`GOVERNANCE_RELATIONSHIPS_PAGE_SIZE = 25`).
   - Service-role only — call after `hasEntityGovernanceAccess`.

2. **Shared editorial actions** (`src/app/actions/relationship-editorial.ts`).
   The existing `approve / reject / restore / updateRelationshipType`
   server actions now accept either auth path:
   - project owner / editor (existing interview-detail flow), OR
   - `platform_admin` / `superuser` (new admin governance flow).
   Pure predicate extracted to `src/lib/auth/relationship-editor.ts`
   (`canEditRelationship`) so the rule is unit-testable without
   Supabase. After every mutation we now `revalidatePath` both the
   interview path AND `/admin/entities` plus `/admin/entities/[source]`
   and `/admin/entities/[target]` so admin surfaces refresh.

3. **New admin UI section**
   (`src/components/admin/governance-relationships-section.tsx`)
   rendered below the Aliases section in the existing
   `GovernanceEntityDetailPanel`. It is a simple table:
   direction badge, related entity (linked to its admin detail), relation
   type + evidence preview, status badge, origin, confidence, source
   interview (linked to `/interviews/[id]#relationships`), action menu
   (change type / approve / reject / restore). Rejected rows render
   visually de-emphasized but remain visible. Status + direction
   selectors are URL-driven via `?rel_status=…&rel_direction=…&rel_page=…`
   so the page is refreshable / linkable.

4. **Interview detail anchor**. Added `id="relationships"` to the
   Relationships card on `/interviews/[id]` so admin links from the
   governance table jump directly to the editable card.

### C. Files touched

**New:**
- `src/lib/admin/load-governance-relationships.ts`
- `src/lib/auth/relationship-editor.ts`
- `src/components/admin/governance-relationships-section.tsx`
- `src/__tests__/governance-relationships-loader.test.ts`
- `src/__tests__/relationship-editor-permissions.test.ts`

**Updated:**
- `src/app/actions/relationship-editorial.ts` (auth gate widened, admin
  paths revalidated)
- `src/components/admin/governance-entity-detail.tsx` (renders new section)
- `src/app/(dashboard)/admin/entities/[id]/page.tsx` (loads relationships,
  parses `rel_status` / `rel_direction` / `rel_page` search params)
- `src/app/(dashboard)/interviews/[id]/page.tsx` (adds `#relationships`
  anchor on the Relationships card)

### D. Acceptance / how to validate

1. Open `/admin/entities/[id]` for an entity with several connected
   relationships — the Relationships table renders all of them,
   including any `rejected` rows (de-emphasized).
2. Approve / reject / restore from the action menu → the row re-renders
   with the new status badge after revalidate.
3. Change relation type → the original row becomes `rejected (Edited)`,
   a new approved row carries the new type. Same behavior as the
   interview-detail flow because the same server actions are used.
4. Status filter (`Rejected only`) shows only rejected rows; direction
   filter (`Incoming` / `Outgoing`) restricts accordingly. Filters
   compose; page resets to 1 when a filter changes.
5. Source interview link navigates to `/interviews/[id]#relationships`
   and lands on the editable card.
6. As a platform admin who is **NOT** a project member of the source
   interview, all editorial actions still succeed. As a project viewer
   with no platform role, all actions still fail with `Insufficient
   permissions` (regression guard in `relationship-editor-permissions.test.ts`).
7. `vitest run` is green (112 tests including the 23 new ones).

### E. Tests

- `src/__tests__/governance-relationships-loader.test.ts` — 13 tests
  covering: invalid id short-circuit, incoming + outgoing inclusion,
  rejected rows visible by default, hydrated metadata (`direction`,
  `related_entity_*`, `interview_title`), status filter (all four
  modes), direction filter, combined filters, and pagination
  (`totalCount` / `totalPages` / no overlap between pages).
- `src/__tests__/relationship-editor-permissions.test.ts` — 10 tests
  covering: project owner/editor allowed (existing behavior), project
  viewer rejected, no project + no platform role rejected,
  `platform_admin` and `superuser` allowed even without project
  membership, combined paths.

### F. Out of scope (still deferred)

- Standalone `/admin/relationships` route or cross-entity browser.
- Manual relationship creation from the admin panel.
- Reverse-direction toggle (swap source/target).
- Bulk approve / reject.
- Cross-interview suppression of a `(source, target, relation_type)`
  triple.
- Admin override of project-editor restrictions on the interview
  detail page itself (admins still need read access via the project to
  view a full interview).
- Relationship history / audit log.
- Graph redesign.
