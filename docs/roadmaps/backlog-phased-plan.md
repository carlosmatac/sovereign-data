---
title: "Backlog — phased implementation plan"
last_updated: 2026-05-10
---

# Backlog — phased implementation plan

> This document groups the 14 queued `to-do/` specs into implementation phases and explains the ordering logic. It is a **planning reference**, not a task list. Move a spec to `on-going/` when work begins, and update this file if the order changes.

---

## Phase 0 — Security / correctness

**Goal:** fix production-grade problems that exist right now — a data exposure risk, a data-isolation bug, and an architectural mismatch. None of these require the knowledge-model improvements in later phases; they must be fixed regardless.

| Spec | What it fixes |
|------|--------------|
| [`private-storage-for-assemblyai.md`](../features/to-do/private-storage-for-assemblyai.md) | Confidential interview audio in a public Supabase bucket — anyone with a URL can download it. |
| [`dashboard-project-scoped-stats.md`](../features/to-do/dashboard-project-scoped-stats.md) | Dashboard shows global aggregate counts to users with limited project access; clicking those numbers leads to 404s. |
| [`remove-tavily-web-search.md`](../features/to-do/remove-tavily-web-search.md) | Copilot silently falls back to public web results, mixing unverified external data into a proprietary intelligence platform. |

**Why first:** two of these are security or data-leakage issues; one erodes the platform's core value proposition (internal knowledge only). None depend on anything else in the backlog.

---

## Phase 1 — Operational UX fixes

**Goal:** fix the three biggest day-to-day friction points for the people who operate the platform. These are standalone UI/UX changes that do not require schema migrations or knowledge-model work.

| Spec | What it fixes |
|------|--------------|
| [`reprocess-ux-overhaul.md`](../features/to-do/reprocess-ux-overhaul.md) | 3-step reprocess flow with no feedback, no error recovery, and the ability to get silently stuck. |
| [`entity-anchor-autocomplete-ux.md`](../features/to-do/entity-anchor-autocomplete-ux.md) | Autocomplete in the Add Source form is too slow to be useful and gives no feedback — the most critical entity-matching signal is currently ignored by users. |
| [`transcript-review-entity-panel-sidebar.md`](../features/to-do/transcript-review-entity-panel-sidebar.md) | Entity correction panel is below the transcript — usable only by scrolling past a 90-minute interview; cannot see transcript and panel simultaneously. |

**Why second:** these are pure frontend / API-surface changes. They make the platform usable enough to populate good data for the knowledge-model improvements in Phase 2. The autocomplete fix is especially important before Phase 2 work, because better entity pre-tagging at upload time directly improves retrieval quality.

**Dependencies:** none on later phases. `transcript-review-entity-panel-sidebar` benefits from `source-all-related-entities-panel` (Phase 2) shipping first — the sidebar shows the pre-existing entity list, so the fuller Phase 2 panel makes the sidebar more useful — but neither blocks the other.

---

## Phase 2 — Knowledge model / retrieval quality

**Goal:** enrich the data model so the knowledge graph is denser, relationships carry more context, and the Copilot has better raw material to reason from.

| Spec | What it adds |
|------|-------------|
| [`entity-metadata-and-descriptions.md`](../features/to-do/entity-metadata-and-descriptions.md) | Richer entity descriptions (from 83-char thin text to 200+ char structured summaries) and populated `entities.metadata` JSONB. Directly improves every LLM answer. |
| [`source-entity-relationship-context.md`](../features/to-do/source-entity-relationship-context.md) | Adds a `context` field to `source_entities` describing *how* an entity relates to a specific source (e.g. "Minister of Finance discussing 2026 budget reform"). |
| [`source-all-related-entities-panel.md`](../features/to-do/source-all-related-entities-panel.md) | The "Entities mentioned" panel shows anchor entities (interviewee, org) even when not literally named in the transcript. No schema change — purely a query fix. |
| [`multi-participant-source-entities.md`](../features/to-do/multi-participant-source-entities.md) | Upload form accepts multiple known participants; each becomes an `upload_anchor` row, giving the resolver explicit hints before extraction runs. Depends on autocomplete (Phase 1) being fast enough to use. |
| [`project-entity-linking.md`](../features/to-do/project-entity-linking.md) | New `project_entities` join table; entities can be associated with projects directly, not only through sources. Enables strategic "people in this project" views. |

**Why third:** these improve the quality of information in the system. They are the substrate for Phase 3 (better Copilot output). Entity metadata and source-entity context should ship before chat cards, because the cards will display entity names and excerpts — the richer the underlying data, the better the cards look.

**Internal order within Phase 2:**
1. `entity-metadata-and-descriptions` and `source-entity-relationship-context` first — they lay better data foundations.
2. `source-all-related-entities-panel` and `multi-participant-source-entities` next — they improve data input and surface completeness.
3. `project-entity-linking` last — requires a migration and is a new conceptual layer; best done once the per-source model is solid.

---

## Phase 3 — Copilot / presentation layer

**Goal:** surface the richer data from Phase 2 visually in the Copilot so the improvement is tangible to end users.

| Spec | What it adds |
|------|-------------|
| [`chat-source-citation-cards.md`](../features/to-do/chat-source-citation-cards.md) | Replace plain citation chips with rich source cards: type badge (Interview / Document / Note), primary entity name, hover excerpt, "Cited" vs. context visual distinction. |

**Why fourth:** the cards are only as good as the data behind them. Entity descriptions (Phase 2) power the hover excerpts; source-entity context powers the primary entity label. Shipping the card UI before the data is enriched would produce empty or thin cards.

**Dependencies:** `entity-metadata-and-descriptions` (Phase 2) for hover excerpts; `chat_message_evidence` (already shipped, Phase 4a of the refactor) for the evidence rows the cards read from.

---

## Phase 3.5 — Network Explorer V2

**Goal:** replace the current Cytoscape-based Network Explorer with a full-screen, React Flow-based V2 that treats the graph canvas as the primary UI — entity cards instead of circle nodes, an explored-entity stack model, directional animated edges, and floating contextual panels.

| Spec | What it adds |
|------|-------------|
| [`network-explorer-v2.md`](../features/on-going/network-explorer-v2.md) | Full-screen React Flow canvas, EntityNode cards, AnimatedEdge with directional particle animation, ExploredPanel (search + stack), EntityPreviewPanel, GraphControls. New API routes: `/api/graph/entity/[entityId]` and `/api/entities/search`. |

**Why here:** independent of the knowledge-model improvements in Phase 2/3 — it reads the same entity and relationship data that already exists. Can ship alongside Phase 3 without blocking it.

**Dependencies:** none on other backlog items. Preserves all existing `/api/graph/[projectId]` routes and RLS.

---

## Phase 4 — Product polish / later architecture

**Goal:** add the features that improve the experience broadly but are either low-risk additions or require more architectural thought before committing.

| Spec | What it adds |
|------|-------------|
| [`dark-light-mode-toggle.md`](../features/to-do/dark-light-mode-toggle.md) | Per-user dark/light/system theme toggle; light mode CSS tokens built out. Low risk but requires a design pass to do properly. |
| [`users-as-entities.md`](../features/to-do/users-as-entities.md) | Platform users linked to `entities` rows; Copilot aware of who is logged in for personalized answers. Higher architectural complexity — touches auth, entity resolution, and the system prompt. |

**Why last:** neither is urgent for the core intelligence workflow. Light mode is pure polish. Users-as-entities has broad implications (privacy, entity deduplication, prompt design) that benefit from the Phase 2 knowledge-model work being stable first — particularly the entity description and metadata layer, which would also apply to user entities.

---

## Dependency summary

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3
                │            │
                │            └──► Phase 4 (users-as-entities)
                └──────────────── Phase 4 (dark mode, standalone)
```

The one cross-phase coupling worth noting:

- **Autocomplete (Phase 1)** is a soft prerequisite for **multi-participant upload (Phase 2)** — the multi-participant form multiplies the autocomplete UX, so fixing performance first makes the feature usable.
- **Entity metadata + source-entity context (Phase 2)** feed directly into **chat source cards (Phase 3)** — ship Phase 2 data enrichment before Phase 3 presentation.
- **Knowledge-model stability (Phase 2)** is a soft prerequisite for **users-as-entities (Phase 4)** — the user entity will use the same description and metadata infrastructure.
