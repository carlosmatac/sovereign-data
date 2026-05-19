---
title: "Network Explorer V2"
status: done
last_updated: 2026-05-17
---

# Network Explorer V2

## Problem

The existing Network Explorer uses Cytoscape.js and renders entities as plain circles. It is limited to project-scoped views and does not support an interactive "explore from entity" model. Circle nodes cannot display structured information, and the layout is static once loaded.

## Goals

- Replace circle nodes with compact, readable React entity cards (name, type badge, colour-coded by type)
- Full-screen graph canvas — the canvas is the page; no large header block
- Explored-entity stack model: users add entities to explore one at a time, building a personalised view
- Directional relationship edges with animated particles (incoming = green, outgoing = blue, bidirectional = purple)
- Floating panels: searched-entity stack (top-left), entity preview (bottom-right), graph controls (bottom-left)
- Dotted spatial grid background (React Flow built-in, adapts to zoom)
- No new database schema; reads existing `entities` and `entity_relationships` tables

## Approach

Switch from Cytoscape.js to `@xyflow/react` (React Flow v12). React Flow supports custom React component nodes natively, has built-in background patterns, and provides `useReactFlow` hooks for programmatic zoom and fitView.

The old `entity-graph.tsx` and its Cytoscape-based view are kept (not deleted) — the `network/page.tsx` now renders `NetworkExplorerV2` instead.

### New API routes

| Route | Purpose |
|-------|---------|
| `GET /api/graph/entity/[entityId]` | Returns `{ entity, relationships, neighbors }` for a single entity. Auth: user must be member of the entity's project (or same tenant for global entities). |
| `GET /api/entities/search?q=` | Tenant-scoped entity search (no projectId needed). Returns up to 10 canonical entities from the user's accessible projects. |

### New components

| File | Role |
|------|------|
| `src/components/network/network-explorer-v2.tsx` | Orchestrator: state, layout derivation, React Flow wrapper |
| `src/components/network/entity-node.tsx` | Custom React Flow node: name, type dot, type badge, explored/neighbor/selected variants |
| `src/components/network/animated-edge.tsx` | Custom React Flow edge: directional colour + SVG `animateMotion` particle |
| `src/components/network/explored-panel.tsx` | Floating top-left: entity search (debounced), explored stack, remove/focus/preview row actions, direction filter (All / In / Out) |
| `src/components/network/entity-preview-panel.tsx` | Floating bottom-right: entity name, type, description, metadata tags, relationship count, "View full details" link |
| `src/components/network/graph-controls.tsx` | Floating bottom-left: Zoom In, Zoom Out, Fit View, Reset |

### State model (`NetworkExplorerV2`)

```ts
exploredIds: string[]           // stack, newest first
cache: Map<entityId, NeighborhoodData>
selectedId: string | null
directionFilter: "all" | "incoming" | "outgoing"
loadingId: string | null
```

Nodes and edges are **derived** from state on each render — no separate node/edge state.

### Layout

- First explored entity: centre (0, 0)
- Each subsequent explored entity: golden-angle spiral offset
- Neighbours of an explored entity: circular fan around it (radius 220 px)
- `fitView()` called automatically after each neighbourhood loads (via `useReactFlow`)

### Direction filter

Per-edge direction is computed relative to the `exploredSet`. Edge colours:
- Outgoing (explored is source): `#5B9CF6` blue
- Incoming (explored is target): `#4ADE80` green
- Bidirectional (both ends explored): `#A78BFA` purple
- Unrelated: `rgba(147,147,147,0.35)` muted

When filter = "incoming", only incoming and bidirectional edges are shown. When filter = "outgoing", only outgoing and bidirectional edges are shown.

## Key files touched

| File | Change |
|------|--------|
| `package.json` | Added `@xyflow/react` |
| `src/app/(dashboard)/network/page.tsx` | Simplified — auth check + `<NetworkExplorerV2 />` only |
| `src/app/api/graph/entity/[entityId]/route.ts` | New |
| `src/app/api/entities/search/route.ts` | New |
| `src/components/network/network-explorer-v2.tsx` | New |
| `src/components/network/entity-node.tsx` | New |
| `src/components/network/animated-edge.tsx` | New |
| `src/components/network/explored-panel.tsx` | New |
| `src/components/network/entity-preview-panel.tsx` | New |
| `src/components/network/graph-controls.tsx` | New |
| `docs/roadmaps/backlog-phased-plan.md` | Added Phase 3.5 entry |

## Preserved

- `entity-graph.tsx` — kept, not deleted (may be referenced elsewhere)
- `/api/graph/[projectId]` route — unchanged
- All RLS and tenant visibility rules — new APIs follow the same admin-client-after-getUser() pattern

## How to test

1. Navigate to **Network Explorer** (`/network`)
2. In the **Entities** panel (top-left), type at least 2 characters in the search box — a dropdown of matching entities should appear
3. Click an entity to add it to the explored stack — a node card appears on the canvas
4. Repeat for a second entity — edges between them (if related) appear with directional colour and animated particles
5. Click a node on the canvas → Entity Preview panel appears bottom-right with name, type, description, and metadata tags
6. Use direction filter (`All` / `In` / `Out`) to toggle edge visibility
7. Hover an item in the explored stack → Remove, Focus, and Preview icon buttons appear
8. Use Graph Controls (bottom-left): Zoom In, Zoom Out, Fit View, Reset
9. "View full details" link in the preview panel navigates to `/admin/entities/[id]`

---

## Correction pass (2026-05-15)

### What was fixed

| Issue | Fix |
|-------|-----|
| Grid dots invisible | Increased dot `color` to `rgba(255,255,255,0.18)`, `size` to 1.5, `gap` to 24; added explicit `backgroundColor` on Background so dots always render on the dark canvas |
| Direction filter in wrong place | Removed from `ExploredPanel`; new `GraphToolbar` component (top-right) hosts `All / Out / In` segmented control, entity-type multi-select dropdown, relationship-type multi-select dropdown, and node search input |
| Node dragging | React Flow `nodesDraggable` enabled. `onNodesChange` tracks `position` changes into a `positionOverrides` ref; overrides are injected into `buildNodesAndEdges` so manual positions survive state updates within the session |
| Entity preview too cluttered | Removed metadata tag pills entirely; preview now shows: name, type badge, description (3-line clamp), relationship/source counts, "View full details" link |
| Detail page went to admin | Created read-only `/network/entities/[id]` page; `View full details` now links there instead of `/admin/entities/[id]` |
| Explored entities lost on navigation | Added `sessionStorage` persistence (`network-explorer-v2-explored` key); on mount, IDs are read back and neighborhoods are re-fetched |

### New: `/network/entities/[id]` read-only detail page

Server component at `src/app/(dashboard)/network/entities/[id]/page.tsx`.

Shows:
- Breadcrumb: `← Network Explorer / Entity Name`
- Entity name, type badge
- Description section
- Relationship list (incoming/outgoing, with peer entity links to other detail pages)
- Right column: stats (relationship count, source count, countries, sectors), tag pills, "Explore in graph" link

Auth: same pattern — user must be a member of the entity's project.

### Session persistence

Key: `sessionStorage["network-explorer-v2-explored"]` — JSON array of entity IDs.

Saved on every change to `exploredIds`. Loaded in the `useReducer` initializer via a lazy init function (safe from SSR because it checks `typeof window`). On load, neighborhoods are re-fetched since the cache is not persisted.

Manual node positions (`positionOverrides`) are in a `useRef` and exist only for the current page mount — they reset on navigation.

### New `GraphToolbar` component

`src/components/network/graph-toolbar.tsx`

Positioned `absolute top-3 right-3 z-10` inside the canvas. Contains:
- **Node search**: filters visible nodes by name (dims non-matching nodes, does not hide them)
- **Direction**: `All / Out / In` segmented control
- **Entity type**: multi-select dropdown with all ENTITY_TYPE_VALUES; filters shown nodes
- **Relationship type**: multi-select dropdown populated dynamically from the current graph's edge types

### Filter logic (`applyFilters`)

Applied after node/edge derivation in the orchestrator:
1. Node search → set `dimmed: true` on non-matching nodes
2. Entity type filter → remove non-matching nodes; also remove edges whose endpoints are hidden
3. Direction filter → remove edges by direction relative to explored set
4. Relationship type filter → remove edges whose `relationType` is not in the selected set

## Open questions / future improvements

- Edge label rendering on hover (currently via SVG `<title>` only; could add a floating tooltip)
- URL-serialised explore state (share a graph snapshot via URL)
- Entity group clustering (by type or project)
- Export graph as image
- Persist manual node positions to sessionStorage alongside explored IDs
