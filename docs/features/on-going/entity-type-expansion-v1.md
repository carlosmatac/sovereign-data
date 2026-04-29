---
title: "Entity Type Expansion V1"
status: on-going
owner: team
priority: high
last_updated: 2026-04-29
related_architecture:
  - ../../architecture/ingestion-pipeline.md
related_infrastructure:
  - ../../infrastructure/database-schema.md
---

# Entity Type Expansion V1

## Problem

The original flat entity taxonomy (`PERSON`, `COMPANY`, `GOVERNMENT`, `ORGANIZATION`, `LOCATION`, `EVENT`) is too narrow for Sovereign's frontier-markets intelligence use cases. Real entities such as Nigeria, Natural Gas, Petroleum Industry Act, NNPC, TCN, and Reuters are forced into broad or incorrect categories, which harms extraction quality, matching, graph interpretation, admin correction, and downstream chat/report context.

## Goals

- Keep the current flat enum model and add the most useful V1 distinctions.
- Add `COUNTRY`, `SECTOR`, `COMMODITY`, `PUBLIC_INSTITUTION`, `STATE_OWNED_ENTERPRISE`, `LAW_OR_POLICY`, and `MEDIA_OR_PUBLICATION` end-to-end.
- Centralize entity type constants/helpers so DB/TS/Zod/UI/API logic no longer depends on scattered hardcoded arrays.
- Treat `PUBLIC_INSTITUTION`, `STATE_OWNED_ENTERPRISE`, and `MEDIA_OR_PUBLICATION` as org-like where upload anchors and position prefetch expect institutions.

## Non-goals

- No `entity_subtype`.
- No hierarchy or subtype tables.
- No backfill or bulk reclassification of existing entities.
- No mass admin correction workflow.
- No relationship taxonomy redesign.

## Approach

- Add migration `00025_entity_type_expansion.sql` with additive `ALTER TYPE entity_type ADD VALUE IF NOT EXISTS ...` statements.
- Use `src/types/database.ts` as the runtime/type source of truth with:
  - `ENTITY_TYPE_VALUES`
  - `isEntityType`
  - `ORG_LIKE_ENTITY_TYPES`
  - `isOrgLikeEntityType`
- Update extraction schema and prompt guidance so the LLM has concrete examples for the new categories.
- Replace local type allowlists in admin, review, search, and network surfaces.
- Keep unknown/future values rendering safely where components use visual maps.

## Technical Notes

Likely code paths updated:

- `supabase/migrations/00025_entity_type_expansion.sql`
- `src/types/database.ts`
- `src/lib/ai/extraction.ts`
- `src/lib/entities/resolve.ts`
- `src/lib/entities/validate-interview-anchor.ts`
- `src/app/api/projects/[projectId]/entities/search/route.ts`
- `src/app/actions/admin-entity-governance.ts`
- `src/lib/admin/load-governance-entities.ts`
- `src/components/admin/*`
- `src/components/interviews/*entity*`
- `src/components/network/*`
- `src/app/api/chat/route.ts`

## Acceptance / How To Validate

- `ENTITY_TYPE_VALUES` includes the six legacy values plus the seven V1 values.
- `EntityTypeSchema` accepts every value in `ENTITY_TYPE_VALUES`.
- Search route allowlists accept new types and reject unknown values.
- `isOrgLikeEntityType` accepts `PUBLIC_INSTITUTION`, `STATE_OWNED_ENTERPRISE`, and `MEDIA_OR_PUBLICATION`.
- Admin/review/network dropdowns render from the central constant.
- TypeScript and focused Vitest tests pass.

## Implementation Log

- 2026-04-29: Started PR on branch `ventura/add-entities`; added migration, centralized constants/helpers, updated extraction guidance, org-like helpers, UI/API consumers, and focused tests.
