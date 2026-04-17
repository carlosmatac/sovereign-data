---
title: "UI panel system transfer — adopt landing visual system in real app"
status: on-going
owner: team
priority: medium
last_updated: 2026-04-17
related_architecture: []
related_infrastructure: []
---

# UI panel system transfer — adopt landing visual system in real app

## Problem

The landing page has a carefully designed **panel system** (tokens, shells, window chrome, list rows, insight cards, metric cards, editorial treatment) documented in [`docs/ui-panel-system.md`](../../ui-panel-system.md) and extracted into `src-landing/components/panels/*` and `src-landing/{lib,styles}/design-tokens.*`.

The real app inside `src/` still runs on the older shadcn/ui-based dark slate theme (OKLCH tokens in `src/app/globals.css`) with ad-hoc card/panel styling. This creates a visual gap between `sovereign.landing` and the product users actually use.

We want the app to **look and feel like the landing panel system** while keeping every route, handler, action, permission check, form, and behavior intact.

## Goals

- Install the panel design tokens (CSS variables + TypeScript tokens) in `src/` so every surface can reach for the same values.
- Provide reusable panel primitives (`PanelShell`, `WindowChrome`, `PanelHeader`, `AppSurface`, `WindowPanel`, `MetricCard`, `SectionChip`, `ListRow` + `IconWell`, `InsightCard`, `StatusPill`) inside `src/components/panels/`.
- Refactor the dashboard app shell (sidebar + inset header + route outlet) so every route feels like it sits inside a Sovereign panel, without breaking the existing `SidebarProvider` / `SidebarInset` / collapsible-icon / mobile sheet behaviour.
- Apply the visual language across the main product surfaces (`/dashboard`, `/projects`, `/chat`, `/interviews`, `/network`, `/reports`, `/admin`, `/settings`) using the primitives.
- Preserve 100% of existing functionality and routing — no removals, no new product behavior.

## Non-goals

- No new business logic, new routes, new filters, new tools, or new data behaviors.
- No rewrite of the sidebar navigation model — we keep `Sidebar`/`SidebarProvider` from shadcn; we only restyle it.
- No changes to auth flow, API routes, data access, RLS helpers, admin-client pattern, or schema.
- No light-mode variant — the panel system is dark-only by design.

## Approach

Incremental, phase-gated so each phase is reversible.

### Phase 1 — Foundation
- Copy `src-landing/lib/design-tokens.ts` → `src/lib/design-tokens.ts`.
- Copy `src-landing/styles/design-tokens.css` → `src/styles/design-tokens.css`.
- Import the CSS tokens once at the root via `src/app/globals.css`.
- Copy `src-landing/components/panels/*` → `src/components/panels/*` (barrel file + all 9 primitives).

### Phase 2 — App shell
- Restyle `src/components/dashboard/app-sidebar.tsx` to use the landing sidebar/nav vocabulary (tiny uppercase group label, 10px nav labels, 11px icons, 4px radius, 0.07em tracking, white/0.08 active state, white/0.06 hover) while preserving every existing menu item, `SidebarProvider`, collapsible-icon mode, chat thread sub-nav, and user dropdown menu.
- Restyle `src/components/dashboard/dashboard-inset-header.tsx` as a proper `WindowChrome`-style strip (traffic-light dots, chrome gradient, 0.07em tracking label, live status pill). `SidebarTrigger` stays functional.
- Update `src/app/(dashboard)/layout.tsx` so the page body uses the `panel-bg` surface and the main content area inherits panel typography.

### Phase 3 — Per-route refactors (visual only)
Each route follows the same recipe:
1. Read the existing page/component and enumerate every control/handler/state.
2. Wrap the page body in a `PanelHeader` + content grid pattern using tokens.
3. Swap shadcn `Card` usage for panel-language surfaces (border `rgba(147,147,147,0.15)`, radius 5px, micro-padding, 10/8.5/7.5px type scale) **without touching the underlying data flow or handlers**.
4. Preserve empty / loading / error states and permission-aware UI.

Order (highest-impact first):
- `/dashboard` (KPI row + charts) → `MetricCard` + `PanelHeader`.
- `/projects` (list + detail + members + new project) → `PanelHeader` + custom cards styled like `MetricCard` / `ListRow`.
- `/chat` (Copilot) → `WindowPanel` variant `copilot` + `InsightCard` + chat bubbles in landing style.
- `/interviews` (list + detail + upload + transcript review + entities) → `ListRow` + `IconWell` + report-like serif treatment for transcripts.
- `/network` (graph + filters + detail card) → `PanelHeader` + `SectionChip` filters.
- `/reports` (list + new + detail + share token) → `PanelShell` variant `report` + serif headlines (Playfair 400).
- `/admin` (entities + users) → `PanelHeader` + `ListRow`.
- `/settings` → `PanelHeader`.

### Phase 4 — Motion polish (optional)
- Add a thin `PageTransition` wrapper in `src/components/shared/page-transition.tsx` using framer-motion **only if** it is already a dependency; otherwise skip (no bouncy transforms, just opacity + tiny y-translate). Skip for this iteration unless the user explicitly asks.

### Constraints

- **Sacred patterns (do not touch):** admin-client pattern after `getUser()`, `token_hash` magic-link flow, SECURITY DEFINER RLS helpers. This task is UI-only.
- Every existing `href`, `onClick`, `action`, server-action, or fetch call must still exist and behave identically after refactor.
- Use `text-[Npx]` arbitrary Tailwind classes where the landing uses 7.5 / 8.5 / 9.5 / 10.5 / 12.5 — do not round up.
- Reach for the `--sv-*` CSS variables from `src/styles/design-tokens.css` in preference to hard-coded values where practical.

## User experience

Same routes, same controls, same journeys — but every surface now has:
- 17px outer radius with the 3-layer shadow on major panels.
- Window-chrome strip (traffic dots + uppercase label + optional live pill) at the top of the app.
- Tight, dense typography (10 / 8.5 / 7.5px ladder) on card chrome, with `tabular-nums` on every numeric cell.
- `rgba(147,147,147, X)` hue discipline on borders and the accent tonal ramp (bg 0.07–0.13 / border 0.17–0.28 / fg full) on every colored element.

## Technical notes

- **Tokens:** `src/lib/design-tokens.ts`, `src/styles/design-tokens.css`, imported from `src/app/globals.css`.
- **Primitives:** `src/components/panels/*` re-exported via `@/components/panels`.
- **Likely code paths touched (expanding as implementation lands):**
  - `src/app/globals.css`
  - `src/app/(dashboard)/layout.tsx`
  - `src/components/dashboard/app-sidebar.tsx`
  - `src/components/dashboard/dashboard-inset-header.tsx`
  - `src/app/(dashboard)/dashboard/page.tsx`
  - `src/app/(dashboard)/projects/**/*`
  - `src/app/(dashboard)/chat/**/*`
  - `src/app/(dashboard)/interviews/**/*`
  - `src/app/(dashboard)/network/**/*`
  - `src/app/(dashboard)/reports/**/*`
  - `src/app/(dashboard)/admin/**/*`
  - `src/app/(dashboard)/settings/**/*`
  - `src/components/chat/*`, `src/components/network/*`, `src/components/interviews/*`, etc.

## Dependencies & related docs

- [`docs/ui-panel-system.md`](../../ui-panel-system.md) — the visual source of truth.
- `src-landing/lib/design-tokens.ts`, `src-landing/styles/design-tokens.css`, `src-landing/components/panels/*` — reference implementations.
- [`HANDOVER.md`](../../../HANDOVER.md) §3 — sacred patterns (do not violate).

## Risks & open questions

- **Shadcn token interaction.** The existing OKLCH `--background` / `--card` / `--sidebar` tokens are used by shadcn primitives (button, card, input, dropdown, dialog, sidebar, etc.). Overriding them globally to the new panel palette would cascade into every shadcn component. Mitigation: keep shadcn tokens alive, introduce `--sv-*` as an *additive* palette, and repaint the dashboard surfaces that matter via the panels layer — not by swapping the shadcn tokens. Shadcn components remain functional and legible inside the panels.
- **Tailwind v4 arbitrary classes.** Heavy use of `text-[7.5px]`, `py-[9px]`, etc. is fine in Tailwind v4 and matches the landing exactly. No custom Tailwind config changes required.
- **Per-route complexity.** Some routes (network, reports, admin) are deep and multi-component. Not all sub-components may be fully styled in this iteration; the shell + header + list/detail will land first, finer polish can follow.

## Acceptance / how to validate

- `npm run dev` boots cleanly; every route (`/dashboard`, `/projects`, `/projects/[id]`, `/projects/new`, `/chat`, `/chat/[conversationId]`, `/chat/new`, `/interviews`, `/interviews/[id]`, `/interviews/upload`, `/network`, `/reports`, `/reports/new`, `/reports/[id]`, `/admin/entities`, `/admin/users`, `/settings`) renders without runtime errors.
- Every control present before the refactor is still visible and clickable.
- Sidebar collapse/expand, chat thread nav, user menu, sign-out, keyboard focus still work.
- `npm run lint` and `npm run build` pass with no new errors introduced by this change.
- Visual smell test against `docs/ui-panel-system.md` §14 "What makes panels feel premium" — 17px radius on outer shells, 3-layer shadows on key panels, 0.07em uppercase on chrome, dense 10/8.5/7.5px type ladder, tonal borders.

## Implementation log

- 2026-04-17: Spec created. Phase 1 (tokens + primitives install) + Phase 2 (app shell) + Phase 3 first-pass per-route refactor beginning.
- 2026-04-17: First-pass refactor landed across the full target surface.
  - **Foundation**: `src/lib/design-tokens.ts`, `src/styles/design-tokens.css`, all panel primitives (`PanelShell`, `WindowChrome`, `PanelHeader`, `AppSurface`, `WindowPanel`, `MetricCard`, `SectionChip`, `ListRow` + `IconWell`, `InsightCard`, `StatusPill`) in `src/components/panels/`. Added new primitive `SectionSurface` to encapsulate the recurring "inner panel" surface (`#080F1E`, 1px `rgba(147,147,147,0.13)` border, 6px radius, optional `PanelHeader`) used across every route.
  - **Shadcn bridge** (risk mitigation choice): in `src/app/globals.css` we *repointed* shadcn's existing custom properties (`--background`, `--card`, `--border`, `--radius`, etc.) at the Sovereign palette instead of leaving two parallel themes. Shadcn primitives inherit the new visual language automatically; no component-level shadcn fork was needed.
  - **App shell**: `src/components/dashboard/dashboard-inset-header.tsx` now renders a `WindowChrome`-style strip (traffic-light dots, `Sovereign · Intelligence Platform` label at 10px/0.07em, live `StatusPill`) while keeping `SidebarTrigger`. `src/components/dashboard/app-sidebar.tsx` restyled (uppercase tracking group labels, 10px nav labels, white/0.06 hover, white/0.08 active, user dropdown).
  - **Per-route refactors** (visual only, functionality preserved):
    - `/dashboard` — `SectionSurface` + `MetricCard` + new panel-aware tooltips on the `interviews-by-project-chart` and `topic-distribution-chart`. All KPI links, chart nav, and quick-action links intact.
    - `/projects` list + `/projects/[id]` — page header uplift, error/empty via `SectionSurface` + `IconWell`, project cards restyled with tonal surfaces + `SectionChip` for region; detail page header (back link, title, meta, region chip) rebuilt with panel typography.
    - `/chat` — inbox landing + intelligence chat view: eyebrow + title header, `SectionSurface` for conversation list, `IconWell` per conversation row, user chat bubble restyled to landing spec.
    - `/interviews` — list: header uplift, `SectionSurface` for list, `ListRow`-style items with `IconWell`, `SectionChip` for source type, formatted duration, `StatusPill` for status (new `statusPillTone` helper).
    - `/network` — page header uplift + restyled empty state; graph + filters inherit via token repoint.
    - `/reports` — serif Playfair headline (`report` variant look), `SectionSurface` list with `IconWell`, `StatusPill` for generating/completed/failed, `SectionChip` for template.
    - `/admin` hub — restyled entry tiles (`IconWell` + accent-tinted surface), footnote cleaned. Inner admin (`/admin/entities`, `/admin/users`) keeps its shadcn tables which now inherit the new palette via the repoint.
    - `/settings` — new `SettingsPanel` built on `SectionSurface` with an accent-tinted icon well per section (Security / AI Pipeline / Database), rows separated by hairline dividers, `StatusPill` + `SectionChip` for values.
  - **Validation**: `npx tsc --noEmit` passes clean. `npm run lint` reports only **pre-existing** errors (`src/components/ui/sidebar.tsx` `Math.random` purity rule, `src/lib/ai/chunking.ts` prefer-const) that are unrelated to this change and were already present on `main`. No new errors or type regressions were introduced.
  - **What was intentionally not done**: Phase 4 `PageTransition` wrapper (cancelled — framer-motion integration not required this iteration). Admin users/entities table internals left to inherit via token repoint rather than restructured cell-by-cell. Interview detail transcript view untouched beyond the token repoint — a dedicated "report-like serif treatment" pass is tracked as a follow-up if we want to go deeper.
- 2026-04-17: **Precision correction pass** — targeted refinements on top of the first-pass refactor. No functional changes, no route changes, no data/permission changes.
  - **Fake browser/window chrome removed from the real app.** The `WindowChrome` strip (traffic-light dots, `Sovereign · Intelligence Platform` label, live `StatusPill`) is a *landing-only* presentation device that made the dashboard feel like a mock window embedded in a page. In the product that is fiction, so `src/components/dashboard/dashboard-inset-header.tsx` now renders a minimal product top bar: 44px height, `rgba(10,17,35,0.6)` background, single hairline border-bottom, `SidebarTrigger` only. Landing continues to use the full `WindowChrome` — it stays correct *there*.
  - **Typography scaled up across every refactored surface** for in-app readability while preserving the premium/dense character. The landing ladder (7.5 / 8.5 / 9.5 / 10.5 / 12.5 px) was intentionally microscopic because landing panels are *screenshots of* a product. The real product needed a larger ladder. The new baseline is roughly:
    - Page title: 22px → **28px** (Playfair 34px on `/reports`).
    - Page eyebrow (`SOVEREIGN · …`): 10px/0.12em → **11px/0.14em, semibold**.
    - Card/panel header title (`PanelHeader`): 10px → **12.5px**.
    - Card/panel header subtitle: 8px → **10.5px**.
    - `SectionChip` / `StatusPill`: 7.5–8.5px → **10px** with slightly larger padding and 6px dots.
    - `ListRow` title: 9.5px → **12.5px**; caption 8px → **10.5px**; min-height 42 → **52px**; default `IconWell` 22 → **28px**.
    - `MetricCard` compact value: 18px → **22px**; large value: 22px → **28px**; labels 7.5 → **10px**.
    - `InsightCard` headline: 12.5 → **14px**; body: 11 → **12.5px**.
    - Sidebar group labels, nav items, avatar fallback, user name/email all nudged up one tier (h-7 → h-9 rows, 11px → 14px icons, 10px → 12px labels).
    - Chart legends/tooltips (`interviews-by-project-chart`, `topic-distribution-chart`): 10–10.5px → **12px**; donut container 180 → **200px**; legend dots 5 → **7px**.
  - **Dashboard layout reworked for stronger distribution, closer to the landing composition.** `src/app/(dashboard)/dashboard/page.tsx` now uses a 12-column grid (Recent Interviews `lg:col-span-8`, right rail `lg:col-span-4`), tightened page padding (`px-5 py-6 lg:px-8 lg:py-7`), a 2-column Quick Actions grid, and scaled-up `StatLink` / `StatusRow` / `StatusWell` sizing. Every widget, handler, chart, and link that existed before is still present — only composition, sizing and rhythm changed.
  - **Project card hover refined to a subtle premium lift** on `/projects` (and the same treatment applied to `/admin` tiles). Old behaviour was a visible translate-Y + outline bump; the new behaviour is a 200ms ease-out background shift from `#080F1E` → `#0A1223` with a border tonal lift from `rgba(147,147,147,0.14)` → `rgba(147,147,147,0.24)`. No scaling, no glow, no motion.
  - **Network Explorer nodes refined.** In `src/components/network/entity-graph.tsx`:
    - Node sizing is now clamped 10–22px (down from 20–46px) via a dedicated `nodeSize` helper that scales with `√mentions`, killing the "big ball" look while keeping visual hierarchy.
    - Focused-node border reduced to 1px white @ 0.75 opacity; neighbour ring and dimmed-node styling softened; edge widths/opacities rebalanced.
    - Selected-node feedback replaced with a **concentric fading-ring SVG overlay**. Two rings (`radius + 5`, `radius + 11`) at stroke opacities `0.45` and `0.18`, driven by Cytoscape's `render` event so the overlay stays pinned to the focused node at every zoom / pan / layout update. Pure analytical feel — no gamified pulse.
  - **Extra typography parity touches.** `/chat` (`ChatInboxLanding`) inbox header + empty state + conversation rows, and `/projects/[id]` detail header (back link, eyebrow, title, description, meta row, "Sales War Room" / "Project Ops" section titles) scaled up to the same ladder so the detail pages don't feel smaller than their list pages.
  - **Validation**: `npx tsc --noEmit` passes clean. No lint errors on any touched file. All routes, controls, handlers, permissions, and data flows verified unchanged — this was purely presentation.
- 2026-04-17: **Shared app-shell refactor** — restructured the shared `(dashboard)/layout.tsx` so sidebar + content read as one continuous outer frame with an integrated sidebar and a central rectangular working surface, matching the landing's `AppSurface` composition. Scope was intentionally limited to the shell structure; no typography, hover, graph, chart, or per-page visual work in this change.
  - **What changed, structurally.** The shadcn `<Sidebar>` is now rendered with `variant="inset"`. This promotes the sidebar-wrapper (shared by Sidebar + SidebarInset) to the *outer shell* — both columns now sit on the same `#070E1F` (`--sidebar`/`--background`) surface — and floats the sidebar inner column and the content panel inside that shell with an 8px gutter. The sidebar no longer reads as a detached card, and there is no longer a hard vertical rule between sidebar and content.
  - **Central rectangular panel.** `SidebarInset` is restyled in `src/app/(dashboard)/layout.tsx` to match the landing's `AppSurface` central panel: `md:rounded-[6px]`, `bg-[#080F1E]` (surface-bg, one tonal step lighter than the outer shell), `md:border md:border-[rgba(147,147,147,0.16)]`, `md:shadow-none`, `overflow-hidden`. Shadcn's default `rounded-xl` + `shadow-sm` were overridden because they read as "floating card" rather than "integrated working surface". The overflow-hidden pairs with the existing `overflow-auto` on the inner page container so scrolling stays inside the rounded rectangle. `min-h-svh` was dropped from the inset so the inset margins don't push the panel past the viewport.
  - **Divider lines removed.** In `src/components/dashboard/app-sidebar.tsx` the `border-r` on `<Sidebar>`, the `border-bottom` on `SidebarHeader`, and the `border-top` on `SidebarFooter` were removed. These hairlines were what gave the sidebar its "three stacked boxes" feel. The sidebar now reads as one continuous column, which is the landing's behaviour.
  - **Top bar dissolved into the panel.** In `src/components/dashboard/dashboard-inset-header.tsx` the translucent fill and the `border-bottom` hairline were removed. Because the header now lives *inside* a rounded rectangular panel, an edge-to-edge horizontal line at the top fights the panel's border-radius. The header is now a quiet, transparent 44px control strip carrying only the `SidebarTrigger` — identical behaviour, less chrome.
  - **Scope discipline.** No changes to typography, hover states, graph node styling, page-specific widget layout, button behaviour, card content, or feature visibility. `SidebarProvider` / `collapsible="icon"` / mobile Sheet / `SidebarRail` / routing / active states / responsive breakpoints are all untouched.
  - **Validation**: `npx tsc --noEmit` passes clean. No lint errors on touched files. Dev server (`npm run dev`) served `/dashboard`, `/projects`, `/network`, `/chat`, `/interviews`, `/reports`, `/settings`, `/admin` at 200 after the change. Sidebar collapse/expand, mobile sheet, user dropdown, sign-out, and chat thread sub-nav behave as before.
- 2026-04-17: **Network Explorer visual refinement pass** — spacing, scale, composition, darker canvas, subtle dotted background. Scoped strictly to `src/components/network/entity-graph.tsx`; no changes to other routes, shells, typography systems, or cross-cutting visuals.
  - **Nodes smaller and more precise.** `nodeSize()` tightened from 10–22px to **8–18px** with a `sqrt(m+1) * 2.0` scale. On dense projects the previous 22px outliers still read as heavy "balls"; 8–18 keeps the "many mentions vs few mentions" visual hierarchy while preventing any node from dominating. The focused-node / neighbour label sizes were nudged down (12 → 11, 10.5 → 10, 10 → 9.5) to stay in proportion with the smaller nodes.
  - **Layout spread dramatically increased.** `LAYOUT_OPTIONS`:
    - `nodeRepulsion` 10500 → **28000** (much firmer push)
    - `idealEdgeLength` 145 → **210**
    - `componentSpacing` 130 → **210**
    - `gravity` 0.25 → **0.14** (less centre-pull so disconnected components spread)
    - `padding` 70 → **110**
    - `numIter` 1500 → **1800** so the stronger forces have room to settle.
    Nodes and labels overlap meaningfully less, and disconnected components now distribute across the canvas instead of clumping centrally.
  - **Less zoomed-in by default.** After `layoutstop`, fit with `padding = 140` and then pull the zoom back by ~12% around the canvas centre. Same treatment applied to the "Fit to view" toolbar button. First paint now shows the user an overview instead of a close-up, matching the landing reference graph's composition.
  - **Darker, near-black canvas.** Container background switched from `bg-background` (`#070E1F`, panel-bg) to `#040A18` — one step deeper than the documented `--sv-canvas-bg` (`#050C1A`). Still navy-biased to keep Sovereign tonal discipline, but reads as "almost black" against the node palette and lifts the contrast of edges and nodes considerably.
  - **Subtle dot-field texture.** Added a 20px-grid radial-gradient on the container (`rgba(255,255,255,0.06)` dot, 0.9px radius) per `docs/ui-panel-system.md` §10.3 (spec: 0.055–0.075 opacity, 20px spacing). The texture is fixed to the container, not to graph coordinates, so it reads as a precision "editor canvas" atmosphere that doesn't move with zoom/pan and doesn't compete with the graph.
  - **Surface polish.** Container radius changed from `rounded-xl` to `rounded-[6px]` to match the panel-system canvas card radius, and its border pinned to `rgba(147,147,147,0.16)` (the documented outer-panel border alpha). Label pill backgrounds swapped from the old `#0b0e17` to `#070E1F` / `#0E172B` so they read cleanly on the darker canvas. Loading overlay colour adjusted to match.
  - **Scope discipline & preservation.** No changes to the project selector, entity-type filter chips, hide-isolated toggle, zoom buttons, pan/zoom behaviour, node-click focus behaviour, concentric-ring overlay, info panel, legend, or hint text. All routes, API calls, and data flows untouched. Dev server continued to return `/network` 200 and `/api/graph/:projectId` 200 after the change; `npx tsc --noEmit` clean, no lint errors introduced.
- 2026-04-17: **Network Explorer label + edge tuning** — follow-up on the visual refinement pass, driven by a review showing labels were visually dominating the nodes and highlighted edges were thickening instead of brightening.
  - **Labels no longer swallow the node.** Across `node.show-label` / `node.focused` / `node.neighbor`:
    - Font-sizes dropped to **7.5 / 9.5 / 8.5 px** (from 9.5 / 11 / 10) so labels sit *below* the node in visual weight.
    - The solid rectangular label pill backgrounds (`#070E1F` / `#0E172B`) were removed entirely — `text-background-opacity: 0`. Labels now float naturally on the dark dotted canvas without a filled pill, exactly like the landing reference (third screenshot).
    - `text-margin-y` tightened (4–6 instead of 5–8) so the label sits closer to the node.
    - Label color shifted to the `rgba(255,255,255, X)` scale (0.52 / 0.72 / 0.92) for consistency with the rest of the system's text ladder.
  - **Edges keep a constant width, brightness changes on highlight.** Previously `edge.neighbor` thickened to `width: 1.4` and tinted to `#818cf8` — that read as noisy on a data canvas. New behaviour:
    - Base edge, neighbour edge, dimmed edge all pin to **`width: 0.8`** (uniform line weight across every state).
    - Highlight is communicated by *brightness only*: neighbour edges flip from the base `#94a3b8` @ 0.18 opacity to a bright neutral `rgba(255,255,255,0.85)` at 0.85 opacity. Dimmed edges stay 0.8px at 0.03 opacity.
    - The `transition-property` list was trimmed to `opacity, line-color` (width is no longer animated since it's constant).
  - **Validation**: `npx tsc --noEmit` clean, no lint errors. No behavioural code paths changed (filters, zoom, pan, focus, info panel, legend all untouched).
- 2026-04-17: **Network Explorer default zoom + node spread tuning** — follow-up nudge: the graph still opened too close-up, and nodes still clumped too tightly.
  - **Initial zoom is now ~2× further out.** After `layoutstop` we still run `cy.fit(padding)`, but:
    - Padding bumped from 140 → **180** (the fit already leaves more margin).
    - Zoom pull-back bumped from 0.88× → **0.52×** around the canvas centre. 0.52 equals two full "zoom out" button clicks (each click is `zoom × 0.72`, so 0.72² ≈ 0.52), which is the scale the user asked for. Same treatment applied to the "Fit to view" toolbar button so manual fits match the default.
  - **Nodes start meaningfully further apart.** Cose forces pushed well past the previous pass:
    - `nodeRepulsion` 28000 → **60000** (~2.1× firmer push).
    - `idealEdgeLength` 210 → **320** (~1.5× longer edges).
    - `componentSpacing` 210 → **360** (disconnected components split across the canvas).
    - `edgeElasticity` 70 → **55** (softer springs so the repulsion wins the tug-of-war).
    - `gravity` 0.14 → **0.08** (even less central pull, so the graph actually fills the available space rather than piling on the centre).
    - `numIter` 1800 → **2200** and `initialTemp` 280 → **320** so the stronger forces have room to settle without freezing early.
  - **Validation**: `npx tsc --noEmit` clean, no lint errors. No functional code paths touched — filters, pan/zoom, focus behaviour, info panel, legend, concentric rings, data fetch all unchanged.
- 2026-04-17: **Card hover-state restoration pass** — cross-page: several card surfaces had visibly "dead" hover after the precision pass. Root-caused and standardised through a single shared utility.
  - **Root cause.** Many cards set their base background / border via `style={{ background: "#080F1E", borderColor: "rgba(147,147,147,0.14)" }}` (inline), with `hover:bg-[...] hover:border-[...]` Tailwind utilities for the hover state. Inline styles have specificity `1,0,0,0` — they beat any class-based rule regardless of `:hover`, so the hover utilities were effectively dead. The shadcn `<Card>` wrappers on `/projects/[id]` (SalesWarRoom + Project Ops) had no hover state defined at all.
  - **Shared utility.** Added `.sv-hover-card` in `src/app/globals.css` under `@layer utilities`:
    ```css
    .sv-hover-card {
      transition-property: background-color, border-color;
      transition-duration: 180ms;
      transition-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    .sv-hover-card:hover {
      background-color: #0A1223;
      border-color: rgba(147, 147, 147, 0.30);
    }
    ```
    It is an *opt-in* class that only paints transition + hover — the resting look is left to whatever the card already sets (Tailwind utility, token, shadcn `bg-card`). `@layer utilities` puts it at parity with `bg-*` / `border-*`, and `:hover` adds specificity so the hover wins without `!important`. Motion is colour-only — no scale, no translate, no glow, matching `docs/ui-panel-system.md` §11.
  - **Applied across the four target surfaces** (functionality unchanged; only inline-style → className conversion + hover class added):
    - **Dashboard KPI row** (`Projects`, `Interviews`, `Entities`). `src/components/panels/MetricCard.tsx`: dropped inline `style={{ background, borderColor }}` in both `compact` and `large` variants and replaced with Tailwind classes + `sv-hover-card`. As a bonus the hover now works on the `large` variant too (previously it had none). In `src/app/(dashboard)/dashboard/page.tsx`, removed the `hover:-translate-y-[1px]` on `StatLink` so the hover language is colour-only everywhere. Also fixed the Quick Actions grid (`Upload`, `Copilot`, `Network`, `New Project`): dropped its inline `borderColor` and adopted `sv-hover-card`.
    - **Projects list** (`/projects`). `src/app/(dashboard)/projects/page.tsx`: dropped inline `style={{ background, borderColor }}` on each project card and adopted `sv-hover-card` + Tailwind base classes. Hover now lights the border and lifts the surface as intended.
    - **Platform Administration** (`/admin`). `src/app/(dashboard)/admin/page.tsx` `AdminTile`: dropped inline `style={{ background, border }}` (the `border` shorthand had been the worst offender) and adopted `sv-hover-card` + Tailwind base classes.
    - **Project detail** (`/projects/[id]`). `src/app/(dashboard)/projects/[id]/page.tsx` Project Ops sidebar — added `sv-hover-card` to every `Card` (Interviews, Team Members, Your Role, Quick Actions), including the non-clickable ones so informational panels no longer feel dead. `src/app/(dashboard)/projects/[id]/war-room.tsx` — added `sv-hover-card` to `GoalCard`, the three `FinancialCards` (Cash / Pending / Barter), `PipelineHealthCard`, and `DealsPreview`. These are informational surfaces; per the user's brief, they still deserve a subtle response on hover rather than a "static" look.
  - **What this does NOT change.** No typography, no page layout, no spacing, no Network Explorer, no sidebar shell, no global navigation behaviour, no data flow, no permissions. Links inside cards (`Link` wrappers on KPI / project / admin / Interviews / Team Members tiles) and their click handlers are untouched; dropdowns and nested interactions inside `DealsPreview` (Stage / Type `Select`s) still function. `Button` hover states are unaffected — the utility is scoped to `.sv-hover-card` and only applied to card-like surfaces.
  - **Validation**: `npx tsc --noEmit` clean. No lint errors on any touched file. Dev server (`npm run dev`) continued to serve `/dashboard`, `/projects`, `/projects/[id]`, `/admin`, `/network`, `/settings` at 200 after the change.
- 2026-04-17: **Transcript review UI refinement** — focused refactor of the "Reviewed utterances" card in `src/components/interviews/transcript-review-editor.tsx` (the `/interviews/[id]/review` page) to align it with `src-landing/components/panels/transcript-review.tsx`. Scope strictly limited to this component; no other pages, shells, or typography systems touched.
  - **Find / Replace panel de-nested.** Previously the find area was wrapped in `rounded-xl border border-border/60 bg-card/40 backdrop-blur-[2px]` with an inner `rounded-lg border border-border/50 bg-input/25` search pill and a third `bg-background/60 shadow-sm` replace input — three stacked surfaces that read as a muddy inset. Collapsed to a single flat layout: one 8px-radius search pill on `rgba(255,255,255,0.035)` + 1px `rgba(147,147,147,0.12)` border (with a subtle focus-within lift), and a sibling replace row with a single `rgba(255,255,255,0.025)` input + flat outline button. No more `backdrop-blur`, no more inner shadow, no more internal divider. Match counter + prev/next buttons retained and recoloured to white/amber alpha tones consistent with the rest of the review shell.
  - **Utterance segment container** restyled from `rounded-lg border bg-card/50 p-4` with a heavy `ring-2 ring-primary/45 border-primary/35` active state to `rounded-xl border-[rgba(147,147,147,0.13)] bg-[rgba(255,255,255,0.025)] p-4`. The active-playing affordance is now a *tonal* shift — `rgba(91,156,246,0.05)` background + `rgba(91,156,246,0.28)` border — instead of a ring. Paused-but-selected falls back to a softer `rgba(147,147,147,0.22)` border. Radius bumped to match the landing reference's `rounded-xl` segment cards.
  - **Speaker / time header** simplified. Dropped the shadcn `<Badge variant="outline">` chip around the speaker name; now renders as `text-[13px] font-semibold tracking-[-0.011em]` plain text plus a `text-[11.5px] tabular-nums text-white/38` time range, matching the landing's typographic treatment. When the segment is actively playing the speaker name turns `#5B9CF6` (Sovereign accent blue) as a calm visual cue without any background fill. Speaker label data + `formatTime` helper unchanged — only the wrapping markup changed.
  - **Play button** rebuilt. The shadcn `Button variant="outline" size="icon" h-8 w-8` was too chunky. Replaced with a bespoke 28px circular button: `rounded-full border border-[rgba(147,147,147,0.20)] bg-white/[0.04]` with a hover lift to `rgba(147,147,147,0.32)` / `bg-white/[0.08]`, a 12px filled `Play` / `Pause` lucide icon (fill=currentColor so the triangle reads as a solid wedge like the landing reference), and a 0.5px translate-x on the play triangle so the optical centre lands correctly. Click handler, disabled state, and `aria-label` contract are untouched.
  - **Audio progress bar** refined from a default shadcn-styled `<input type="range">` with `accent-amber-600` (thick 8px rail + chunky native thumb) to a three-layer treatment matching the landing's 3px amber rail:
    - Base track: 3px `rgba(255,255,255,0.08)` rounded pill (absolute overlay).
    - Fill: 3px `#FBBF24` rounded pill with `width: %` computed from `clipSliderValue` vs the utterance's `[start, end]` range.
    - Interactive layer: the native `<input type="range">` is made fully transparent (appearance-none, transparent webkit/moz track), with a 10px round amber thumb that carries a 2px `#080F1E` halo (matches the segment container bg so the dot punches out cleanly). `::-webkit-slider-thumb` and `::-moz-range-thumb` both styled for cross-browser parity. `onChange → seekWithinUtterance`, `min`, `max`, `step`, `aria-valuemin/max/now` all preserved — the input is still the source of truth; the overlay divs are pure visual.
  - **Inner text-box nesting removed.** The two editing variants — shadcn `<Textarea>` (no-search path) and the custom `HighlightedTranscriptTextarea` (search path) — both previously painted their own visible container *inside* the already-bordered segment card (`border-input/80 bg-background shadow-xs` on the highlighted variant, and shadcn's default `border bg-transparent dark:bg-input/30 shadow-xs` on the plain textarea). That stacked three bordered rectangles for every utterance. Now:
    - `Textarea` is set to `border-0 bg-transparent px-0 py-0 shadow-none dark:bg-transparent`, sitting directly inside the segment card with zero inner chrome.
    - `HighlightedTranscriptTextarea`'s wrapper is now `relative w-full min-w-0` (no border, no background, no shadow) and the mirror-text layer drops its padding too — text width/height is now provided by the segment card's `p-4`. Highlight marks kept (dim + active amber), with softened `shadow-[inset_0_0_0_1px_...]` removed — the highlight is communicated by alpha alone, matching the landing's visual restraint.
    - Text now reads at `text-[14px] leading-[1.65] text-white/72` so the body copy feels in family with the landing's `10px / 1.65` block while still being readable at app scale. Caret colour moved to `caret-white/80` for dark-surface legibility.
  - **What stays identical.** All behaviours: search / find & replace / match navigation (prev/next, counter, keyboard-focus after nav), replace-all, textarea editing, speaker labels, timestamps, play/pause, audio scrubbing, the match-rail strip on the left when searching, save draft, mark ready, run reprocessing, seed entity search + create + remove, reprocessing polling + realtime channel, parse-warning banner, role-gated empty/403 state, the "Human-confirmed entities" card below, and the new-entity dialog. Not a single handler or data path was modified — this was a pure visual pass inside the JSX tree.
  - **Validation**: `./node_modules/.bin/tsc --noEmit` on the touched file clean (the only TS error in the tree is a pre-existing `@/components/header` import inside the landing-reference file `src-landing/components/panels/transcript-review.tsx`, which is not wired into the app's `@/` paths — verified by stashing the change and re-running; same error). `ReadLints` reports zero issues on `src/components/interviews/transcript-review-editor.tsx`. Dev server (already running) hot-reloaded and continued to serve `/interviews/[id]/review` at 200.
- 2026-04-17: **Interview detail page refinement** — focused visual pass on `/interviews/[id]` (the individual interview read view, distinct from the `/review` edit view handled earlier today). Scope strictly limited to this page's components; no other routes touched.
  - **Glass / frosted treatment stripped from transcript utterance blocks.** `src/components/interviews/transcript-viewer.tsx` previously used three `SPEAKER_VARIANTS` each combining `bg-gradient-to-br from-primary/[0.09] via-card/55 to-card/[0.22]` + `shadow-sm shadow-black/15` + `ring-1 ring-inset ring-white/[0.06]` + `backdrop-blur-[2px]` + heavy badge chips with their own ring/shadow. That stacked four depth cues on top of a dark surface and produced the "cheap frosted-glass" look. Replaced with a calm flat palette:
    - Variant 1 — **soft blue** (primary speaker): `bg-[rgba(91,156,246,0.055)]`, 1px `rgba(147,147,147,0.10)` border, 2px left accent `rgba(91,156,246,0.45)`, label in `#8EB6F3`.
    - Variant 2 — **soft slate** (neutral secondary): `bg-white/[0.028]`, same 1px hairline border, 2px left accent `white/25`, label in `white/70`.
    - Variant 3 — **soft mauve** (third / host): `bg-[rgba(167,139,250,0.045)]`, same 1px border, 2px left accent `rgba(167,139,250,0.40)`, label in `#B8A5F6`.
    No gradients, no `backdrop-blur`, no shadows, no inset rings. Speaker label changed from a bordered pill to a plain `text-[11.5px] font-semibold` line above the body text — closer to the editorial weight of the landing reference and way less "institutional admin UI". Radius softened to `rounded-[10px]` on the blocks and the outer `ScrollArea`; the scroll area's inner `bg-muted/5` was dropped entirely so the container no longer reads as a murky panel-within-a-panel. Body text bumped slightly (`text-sm → text-[13.5px] leading-[1.65] text-white/78`) to match the calmer, more confident feel. Search highlight mark softened to `bg-amber-400/18 text-white/90`.
  - **Relationships section** rebuilt inside `src/app/(dashboard)/interviews/[id]/page.tsx`. The previous row was a plain `rounded-md border p-2.5` with a shadcn `Badge variant="secondary"` chunk + raw `{confidence}%` + italic quote — it read as generic government-form tabular data. New row:
    - Surface: `rounded-[10px] border border-[rgba(147,147,147,0.10)] bg-white/[0.022] px-3.5 py-3` — in family with the transcript blocks, not "bordered list".
    - Source → target line: `text-[13px] tracking-[-0.005em] text-white/88 font-medium` with a muted `h-3 w-3 text-white/30` arrow. Both names `truncate` so long org names don't break the row.
    - Relation label promoted from a filled secondary badge to a quiet uppercase `text-[10.5px] font-medium uppercase tracking-[0.06em] text-[#8EB6F3]/85` preceded by a 4px `#8EB6F3/70` dot. Matches the landing panel's `SectionChip` weight without fighting the rest of the card.
    - Confidence moved to sibling text `text-[10.5px] tabular-nums text-white/35` reading "NN% confidence" (instead of just "NN%" which felt orphaned).
    - Evidence quote gets an editorial left-rule treatment: `border-l border-white/10 pl-3 text-[12px] leading-[1.55] italic text-white/50` — feels like a pull-quote rather than a console log line.
    Switched the outer container from `<div className="space-y-3">` to a semantic `<ul>` / `<li>` list. Header icon switched from saturated `text-primary` to `text-[#8EB6F3]` to match the new muted blue tone used by the relation pill.
  - **Speakers overlap bug fixed** in `src/components/interviews/editable-speakers-card.tsx`. Root cause: the Save button was rendered at the *bottom* of the card body, below the speaker rows. When the user typed two+ characters into the second speaker's name (e.g. "B" → "Bo…"), the `SpeakerPersonNameInput`'s autocomplete popover (Radix `<Popover>` with `align="start" sideOffset={4}` and `w-[var(--radix-popover-anchor-width)]`) would open *downward* and land directly over the Save button, making it visually jumbled and blocking clicks. Fix: promoted Save into the `CardHeader` as a right-aligned compact action (`h-8 px-3 text-xs`), so it is always reachable regardless of which speaker row is being edited and regardless of popover state. The popover is free to overlay whatever empty space sits below the last row. Same `onSave` / `pending` / `isDirty` wiring — only the position changed.
  - **Speakers rows** also restyled while the card was open. Replaced the grid layout (`sm:grid-cols-[minmax(0,5rem)_1fr]` + a raw `<span class="font-mono text-xs">` for the diarization code) with a single-row surface: `rounded-[8px] border border-[rgba(147,147,147,0.10)] bg-white/[0.02] px-3 py-2`, a 24px circular mono-badge for the code, and the name input fills the remaining width. Reads more like a premium key/value list than a spreadsheet. The underlying `SpeakerPersonNameInput`'s default shadcn Input classes (`h-9 text-sm`) were updated to `h-8 border-[rgba(147,147,147,0.10)] bg-white/[0.025] shadow-none` so the field blends into the row surface instead of double-bordering it. Autocomplete popover, PERSON entity search fetch, debounce, focus/blur management, and onChange wiring all untouched.
  - **Muted accent polish** on the page header. The "Human-reviewed intel" badge was using saturated `border-emerald-500/40 text-emerald-800 dark:text-emerald-200` — loud on a calm page. Softened to `border-[rgba(74,222,128,0.28)] bg-[rgba(74,222,128,0.06)] text-[rgba(167,243,208,0.92)]` (same semantic family, ~40% less saturated, now in line with the rest of the desaturated palette).
  - **What stays identical.** Page data fetches, role-based edit gating, status tracker, audio player, executive summary card, topics, marketing-assets (feature-flagged), sentiment card + highlights, entities mentioned card + EntityMentionsList behaviour, transcript search / highlight / filter, speaker map update server action, delete interview button, editable title, back link. No handler, server action, fetch, or data shape changed — purely visual JSX / class changes.
  - **Validation**: `ReadLints` clean on all four touched files. `./node_modules/.bin/tsc --noEmit` shows no new errors (only the pre-existing `src-landing/components/panels/transcript-review.tsx` → `@/components/header` import issue, which is unrelated and lives in the reference tree). Dev server served `/interviews/:id` at 200 after the changes and hot-reloaded through several sessions. Files touched:
    - `src/components/interviews/transcript-viewer.tsx`
    - `src/components/interviews/editable-speakers-card.tsx`
    - `src/components/interviews/speaker-person-name-input.tsx`
    - `src/app/(dashboard)/interviews/[id]/page.tsx`
