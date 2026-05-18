---
title: "Sales War Room — Remove or Replace Mock CRM Metrics"
status: to-do
owner: team
priority: medium
last_updated: 2026-05-18
related_architecture: []
related_infrastructure:
  - docs/infrastructure/database-schema.md
---

# Sales War Room — Remove or Replace Mock CRM Metrics

## Problem

The Sales War Room currently displays static mock data for CRM-style commercial metrics (e.g. cash, revenue, pipeline value). This data:

- Is the same across all projects, regardless of what is actually known about each account.
- Cannot be edited or overridden per project.
- Creates confusion for users who expect to see real or project-specific data.
- Has no clear path to real CRM integration at this stage.

This is a product presentation problem that damages trust and clarity. It needs a product decision before implementation.

## Goals

- The War Room does not show misleading static metrics that appear real but are not.
- Whatever is shown is either clearly labelled as demo data, editable per project, or derived from real ingested knowledge.
- The feature remains useful and presentable to clients/prospects even without a CRM integration.

## Non-goals

- A full HubSpot or CRM integration is out of scope for this spec (the codebase notes the War Room is "ready for HubSpot integration" as a future phase).
- Automated revenue or pipeline extraction from transcripts is out of scope.
- Redesigning the War Room layout is out of scope unless the metric removal creates obvious gaps.

## Approach

This spec defines three options. A **product decision is required** before implementing any of them.

### Option A — Remove mock metrics entirely

Remove the static CRM metric cards (cash, revenue, pipeline value) from the War Room UI. Replace with a placeholder section: "CRM data coming soon" or similar.

**Effort:** low.  
**Risk:** the War Room may feel empty without these cards.

### Option B — Mark as demo / clearly label mock data

Add a visible "Demo data" or "Placeholder" badge to each mock metric card. The numbers remain but are clearly framed as illustrative.

**Effort:** very low.  
**Risk:** still potentially misleading; does not fix the underlying problem.

### Option C — Make metrics editable per project (recommended)

Replace the static mock values with per-project editable fields. Owners can enter real or estimated CRM metrics for each project (e.g. deal size, pipeline stage, estimated close date).

1. Add a `war_room_metrics` JSONB column to `projects` (or a separate `project_crm_metrics` table) via migration.
2. Add an edit UI on the War Room page (owner-only) to set these values.
3. Metrics are stored per project and surfaced only for that project.
4. If no metrics have been set for a project, show an empty state with an "Add metrics" prompt rather than mock data.

**Effort:** medium.  
**Risk:** low; additive change, no existing feature broken.

### Option D — Replace with source-grounded project intelligence

Remove CRM metrics and instead surface AI-generated intelligence from ingested sources: key themes, top entities, recent activity, sentiment signals.

**Effort:** high (requires new extraction or query layer).  
**Risk:** medium; depends on extraction quality.

### Constraints

- Admin client pattern for any DB writes (HANDOVER.md §3).
- Do not break the existing War Room page layout for projects that have not yet set custom metrics.

## User experience

- Option C UX: War Room shows metric cards in view mode; an "Edit" button (owner only) opens an inline edit form. Saving updates the project row. Non-owners see the metrics in read-only mode.
- If no metrics are set: show empty state cards with "—" values and a prompt to add them (owner only).

## Technical notes

- The War Room page is at `src/app/(dashboard)/war-room/` or similar — verify exact path before editing.
- Mock data is likely hardcoded in the component or a local constants file. Locate and remove/replace.
- If going with Option C, a Supabase migration is required. Follow the existing migration naming convention in the migrations folder.

## Dependencies & related docs

- `docs/infrastructure/database-schema.md` — `projects` table schema.
- HANDOVER.md §2 — War Room is listed as a shipped feature ("mock CRM data, ready for HubSpot integration").

## Risks & open questions

- **Product decision required**: which option (A, B, C, or D) should be implemented? This spec should not be moved to `on-going` until the team has decided.
- If Option C: should these fields be visible to editors and viewers, or owners only? Viewing vs editing permissions need to be decided.
- If Option D: does the team want to invest in a dedicated intelligence layer for the War Room, or keep it simple for now?

## Acceptance / how to validate

- Option A: open the War Room for any project. No mock CRM metric cards are visible. No static numbers appear.
- Option B: mock cards are visible but carry a clear "Demo" or "Placeholder" label that is unambiguous.
- Option C: create two projects. Set different metric values for each. Open both War Room pages — each shows only its own values. Open a third project where no metrics have been set — the empty state is shown, not mock data.
- Option C: as a viewer, the "Edit" action is not visible.
