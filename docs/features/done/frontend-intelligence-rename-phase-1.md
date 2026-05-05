---
title: "Frontend Knowledge Rename"
status: on-going
owner: team
priority: medium
last_updated: 2026-05-06
related_architecture: []
related_infrastructure: []
---

# Frontend Knowledge Rename

## Problem

The app now supports audio interviews, text interviews, internal notes, PDFs/documents, and pasted text. Phase 1 moved visible source-library copy away from interview-only language to `Intelligence`; product direction now frames that area as company information and knowledge, so the visible product area should be `Knowledge`.

## Goals

- Rename the visible product area from Intelligence / Source language to Knowledge / Source language.
- Keep existing `/interviews` routes, backend tables, APIs, and component filenames unchanged.
- Make dashboard, project, reports, upload, chat, and settings copy source-agnostic where the UI is describing the product area, company knowledge, or uploaded item.

## Non-goals

- No route rename from `/interviews` to `/intelligence`.
- No route rename from `/interviews` to `/knowledge`.
- No database, API, ingestion, graph, report-generation, or component/file renames.
- No source-type filter redesign or semantic source-type changes.

## Approach

- Sidebar: show `Knowledge` while keeping the route at `/interviews`.
- Library page: show `Knowledge Library`, `Add Source`, and neutral source/item labels.
- Upload flow: show `Add Source` and source-type copy, while keeping interview-specific labels only where they describe interview transcript metadata.
- Dashboard and project pages: use Knowledge / source framing for KPIs, recent lists, CTAs, empty states, and quick actions.
- Reports, chat, and settings: use knowledge wording where the UI refers to the product layer, generated reports, or the AI engine.

## Acceptance / how to validate

- Sidebar navigation shows `Knowledge`.
- `/interviews` page title is `Knowledge Library`.
- Main upload CTA is `Add Source`.
- Dashboard recent list is `Recent Knowledge` with `Latest uploaded sources`.
- Project pages and report selection no longer describe all source material as interviews.
- Existing `/interviews`, `/interviews/upload`, and `/interviews/[id]` URLs still work unchanged.

## Implementation log

- 2026-05-01: Phase 1 visible copy update implemented on `ventura/all-interviews-to-intelligence`.
- 2026-05-06: Phase 2 visible copy update implemented on `ventura/fix-languages-assembly-ai`, changing the product area from `Intelligence` to `Knowledge` while preserving existing `/interviews` routes and internal names.
