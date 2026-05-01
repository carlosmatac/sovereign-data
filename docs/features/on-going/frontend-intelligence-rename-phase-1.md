---
title: "Frontend Intelligence Rename Phase 1"
status: on-going
owner: team
priority: medium
last_updated: 2026-05-01
related_architecture: []
related_infrastructure: []
---

# Frontend Intelligence Rename Phase 1

## Problem

The app now supports audio interviews, text interviews, internal notes, PDFs/documents, and pasted text, but several frontend surfaces still framed the source library as interview-only.

## Goals

- Rename the visible product area from interview-only language to Intelligence / Source language.
- Keep existing `/interviews` routes, backend tables, APIs, and component filenames unchanged.
- Make dashboard, project, reports, upload, and admin relationship copy source-agnostic where the UI is describing the product area or uploaded item.

## Non-goals

- No route rename from `/interviews` to `/intelligence`.
- No database, API, ingestion, graph, report-generation, or component/file renames.
- No source-type filter redesign or semantic source-type changes.

## Approach

- Sidebar: show `Intelligence` while keeping the route at `/interviews`.
- Library page: show `Intelligence Library`, `Add Source`, and neutral source/item labels.
- Upload flow: show `Add Source` and source-type copy, while keeping interview-specific labels only where they describe interview transcript metadata.
- Dashboard and project pages: use Intelligence / source framing for KPIs, recent lists, CTAs, empty states, and quick actions.
- Reports and admin relationships: use source-material wording where the UI refers to selected/generated source evidence.

## Acceptance / how to validate

- Sidebar navigation shows `Intelligence`.
- `/interviews` page title is `Intelligence Library`.
- Main upload CTA is `Add Source`.
- Dashboard recent list is `Recent Intelligence` with `Latest uploaded sources`.
- Project pages and report selection no longer describe all source material as interviews.
- Existing `/interviews`, `/interviews/upload`, and `/interviews/[id]` URLs still work unchanged.

## Implementation log

- 2026-05-01: Phase 1 visible copy update implemented on `ventura/all-interviews-to-intelligence`.
