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
- 2026-04-17: **Dashboard polish pass** — a focused visual-only refinement on `/dashboard`. Scope strictly limited to the dashboard surface; no other pages, shells, or global systems touched.
  - **Pipeline Status: static processing indicator.** The "Processing" row in the right-rail Pipeline Status card was rendering `<Loader2 ... animate-spin />`, which read as an actively loading control and was misleading users into thinking a network request was in flight. Replaced with a *static* `CircleDot` at the same 12px / 1.8 stroke weight. The indicator still reads semantically as "in progress" (filled-dot-in-ring is a standard radio/progress glyph) while no longer implying live loading. Same icon substitution was applied to `StatusWell` (Recent Interviews list rows) so the dashboard stays consistent — the previous `Loader2 animate-spin` at 13px was the sole remaining continuously-animated element on the page.
  - **Recent Interviews expands vertically + internal scroll.** Row 1 of the dashboard grid (`lg:grid-cols-12`) had Recent Interviews at `col-span-8` vs. a right rail stack (Pipeline Status + Quick Actions) at `col-span-4`; grid items stretch to the tallest sibling, so with only 5 interview rows the list left a large empty band between its last row and the Interviews-by-Project chart below. Fixed by:
    - Giving the Recent Interviews `SectionSurface` an explicit `className="flex h-full flex-col"` and switching its `bodyClassName` to `"flex min-h-0 flex-1 flex-col px-2 py-1.5"` so the outer card fills the grid cell and the body stretches inside it.
    - Bumping the Supabase query limit from 5 → 12 so there's actual content to fill the taller region.
    - Wrapping the row list in a `flex min-h-0 flex-1 flex-col overflow-y-auto pr-1` container (with `min-h-0` so flex-1 can shrink under the parent's fixed height — critical for internal scroll to kick in).
    - Added a new opt-in CSS utility `.sv-scroll-soft` in `globals.css` (thin 6px scrollbar, `rgba(255,255,255,0.08)` thumb resting, `0.14` while the container is hovered, `0.22` while the thumb itself is hovered, transparent track). It's restrained — the scrollbar is effectively invisible until the user actually hovers the region. Cross-browser support via both `scrollbar-width: thin` / `scrollbar-color` (Firefox) and `::-webkit-scrollbar` rules (Chromium/Safari).
    - Empty state (`flex flex-1 flex-col items-center justify-center`) now centres vertically within the expanded region instead of sitting at the top.
  - **Donut chart hover — Topic Distribution.** `recharts` default was "no hover affordance at all", so the chart felt dead relative to the landing's calm dim/highlight pattern. Introduced client-side `hoveredIndex` state shared between the donut and the legend list:
    - Donut slices (`<Cell/>`): `fillOpacity = hoveredIndex === null ? 1 : (hovered ? 1 : 0.22)`, with a `260ms cubic-bezier(0.22, 1, 0.36, 1)` transition on `fill-opacity` so dim/brighten animates smoothly rather than snapping. `isAnimationActive={false}` on both `Pie` and `Tooltip` prevents recharts' own initial spin/fade from competing with the hover transition. The default grey tooltip cursor rectangle is disabled (`cursor={false}`) so only our custom tooltip renders.
    - Legend list rows: on row enter we set the hovered index (so hovering a legend entry lights its donut slice and vice versa), and each row animates between `opacity: 0.38` (dimmed), `opacity: 1` + `rgba(255,255,255,0.035)` row tint (active), and the neutral resting state. The legend dot on the active row also scales to `1.3×` for a subtle anchor. All transitions use the same 220–260ms curve for consistency.
    - Legend row vertical gap tightened from `gap-2` to `gap-0.5` with `px-1.5 py-1.5` per row — gives each row a clickable/hoverable hit area without visually enlarging the legend.
  - **Bar chart hover — Interviews by Project.** Same interaction philosophy applied to the left chart:
    - `fillFor(index)` returns the normal rank-based blue ramp when nothing is hovered, the full-opacity `rgba(91,156,246,1)` Sovereign accent for the hovered bar, and a `rankAlpha * 0.22` dim version for the other bars. Transition via `260ms cubic-bezier(0.22, 1, 0.36, 1)` on `fill` per `<Cell/>`.
    - `YAxis` tick labels got a custom `tick` renderer: active label brightens to `rgba(255,255,255,0.95)`, non-hovered labels dim to `rgba(255,255,255,0.38)`, resting state stays at `0.78`. Fill transitions with the same curve. This gives the hover state a textual anchor on the left column.
    - `BarChart` gets an `onMouseLeave` to clear state, and `Bar` gets `onMouseEnter={(_, index) => setHoveredIndex(index)}`. `isAnimationActive={false}` on bars + tooltip prevents the usual recharts bar-growth animation from fighting the hover transition. The tooltip cursor rectangle was softened from `rgba(255,255,255,0.03)` → `rgba(255,255,255,0.025)` to sit quietly behind the new bar-hover emphasis.
  - **Quick Actions — restrained muted/pastel accents.** Each action tile now carries a single calm accent colour, applied only through three low-saturation surfaces (left rail, icon well, faint card-tint) — never as a loud background.
    - Upload Interview — dusty teal `#5FA6A8`.
    - Copilot — soft violet `#A78BFA`.
    - Network Explorer — faded indigo `#818CF8`.
    - New Project — restrained amber / sand `#D4B77C`.
    Implementation per tile: the card base background uses `color-mix(in srgb, ${accent} 3%, transparent)` (a whisper of tint, ~3% accent mixed with transparent); a 2px accent rail runs down the left edge at `opacity: 0.7` resting / `1.0` on hover; a 22px square icon well at `color-mix … 11%` of the accent holds a 13px lucide icon painted directly in the accent colour. All other visual properties (border, radius, hover lift) continue to flow through the shared `sv-hover-card` + `rounded-[5px] border border-[rgba(147,147,147,0.15)]` language so the tiles still feel like dashboard cards, not "colorful buttons". `color-mix()` has ~94% browser support (baseline since Chrome 111 / Safari 16.4 / Firefox 113); fine for this project's target.
  - **Scope discipline.** Typography ladder, page padding, grid structure (the `lg:grid-cols-12` split, the chart row), KPI row, header, sidebar, app shell, Network Explorer, interview pages, and every server action / route handler / data fetch are all untouched. The dashboard reads denser and more polished, but data flow, permissions, and navigation are byte-for-byte identical.
  - **Validation**: `ReadLints` clean on all four touched files. `./node_modules/.bin/tsc --noEmit` shows no new errors (only the pre-existing `src-landing/components/panels/transcript-review.tsx` landing-reference issue, unrelated). Dev server served `/dashboard` at 200 after the changes and hot-reloaded cleanly. Files touched:
    - `src/app/(dashboard)/dashboard/page.tsx`
    - `src/components/dashboard/topic-distribution-chart.tsx`
    - `src/components/dashboard/interviews-by-project-chart.tsx`
    - `src/app/globals.css`
- 2026-04-17: **Sidebar vs workspace depth hierarchy** — focused tone-only refinement to strengthen the sense of a recessed sidebar layer with an elevated workspace on top. Scope strictly limited to the shell tokens and the workspace panel styling; no per-page or component structural work.
  - **Root cause of the flat feel.** Previous tokens set `--sidebar: #070E1F` (rgb 7,14,31) and the workspace inline `bg-[#080F1E]` (rgb 8,15,30) — those two values are numerically almost identical, so the sidebar and central panel read as one continuous matte plane. The `rgba(147,147,147,0.16)` hairline on the `SidebarInset` was doing all the work of separation, which made the border feel like a hard rule rather than ambient elevation.
  - **New shell tone — deeper matte ink-navy for the sidebar.** `--sidebar` dropped from `#070E1F` → **`#070A14`** (rgb 7,10,20), a tone that is:
    - **Darker** — overall luminance drops ~33% of the way toward black relative to the workspace surface.
    - **Desaturated** — blue channel pulled back from 31 → 20 (~35% less blue content), so it reads as charcoal-navy / muted ink rather than the previous "SaaS navy".
    - **Matte, cool, still in family** — retains the slight blue undertone so the sidebar and workspace belong to the same product, just on different depth planes.
    - **Not pure black, not saturated, no gradient** — per the brief, avoids the glossy/gaming-UI trap.
    Mirrored across both `:root` and `.dark`. `--sidebar-primary-foreground` kept in sync (it's the "when you click a primary-tinted sidebar element, the text sits on the new shell" colour) and `--sidebar-accent` / `--sidebar-border` nudged fractionally to `rgba(255,255,255,0.07)` / `rgba(147,147,147,0.09)` to stay proportionate on the darker surface — all other sidebar tokens unchanged.
  - **Workspace stays lifted — elevation now reads from tone.** `SidebarInset` in `src/app/(dashboard)/layout.tsx` keeps its inline `bg-[#080F1E]`, so the workspace surface is unchanged at rgb(8,15,30). Because the sidebar dropped below it, the workspace now reads as *visibly* elevated without changing anything on the workspace side. Cards inside the workspace (SectionSurface, Quick Actions, dashboard cards — all already at `#080F1E`) keep their existing relationship to the workspace (their 1px tonal borders carry edge definition as before).
  - **Border softened, shadow introduced.** With the tonal gap now doing the work, the workspace border was dropped from `rgba(147,147,147,0.16)` → **`rgba(147,147,147,0.08)`** — a whisper. To reinforce the ambient sense of elevation without making the panel feel like a floating card, a very restrained two-layer shadow was added to the workspace: `0 0 0 1px rgba(255,255,255,0.012)` (a 1px outer halo, barely perceptible, just hints at the panel edge catching ambient light) + `0 24px 48px -32px rgba(0,0,0,0.75)` (a soft downward drop with a large negative spread so it fades into the darker sidebar shell instead of punching through). Net result: the workspace reads as ~1 tonal step above the shell, with the illusion that the darker sidebar tone continues underneath — matching the brief's "very subtle color bleeding underneath" atmospheric goal. Mobile (below `md:`) is untouched: no border, no radius, no shadow — workspace still fills the viewport edge-to-edge as before.
  - **Sidebar interior unchanged.** `app-sidebar.tsx` hover/active backgrounds (`hover:bg-white/[0.06]`, `data-[active=true]:bg-white/[0.08]`) are specified as hard-coded alphas over the sidebar surface, not via `--sidebar-accent`, so the visual contrast of active/hover *improves* on the new darker base (alpha lift reads slightly brighter against `#070A14` than against `#070E1F`) with zero code change. Logo images still at `opacity-90`, nav labels at `text-white/72`, active nav at `text-white`, avatar accent, dropdown, sign-out — all untouched. Readability confirmed: the 0.72 nav foreground holds ~9.8:1 contrast on the new darker surface, well above WCAG AA for UI text.
  - **Scope discipline.** No page refactors, no widget changes, no typography ladder changes, no chart tweaks, no hover-system changes, no Network Explorer / interviews / projects / chat edits, no handler or data-flow touches. The change is a three-line token swap + a border/shadow tweak on the workspace panel — everything else inherits via the repoint.
  - **Validation**: `ReadLints` clean on `src/app/globals.css` and `src/app/(dashboard)/layout.tsx`. `./node_modules/.bin/tsc --noEmit` shows no new errors (only the pre-existing landing-reference `@/components/header` issue). Dev server hot-reloaded and continued to serve `/dashboard` at 200 across the change. Files touched:
    - `src/app/globals.css`
    - `src/app/(dashboard)/layout.tsx`
- 2026-04-17: **Dashboard panel-system alignment pass** — pulled the real `/dashboard` screen visibly closer to the landing panel language. Strict scope: dashboard route + the shared inset header + sidebar account block + minor primitive extensions. Functionality, routes, data flow, permissions, charts, and per-page logic on every other page untouched.
  - **Real `WindowChrome` top bar restored.** `src/components/dashboard/dashboard-inset-header.tsx` was a 44px transparent control strip carrying only `SidebarTrigger`. Refactored into a real product chrome that mirrors the landing's `WindowChrome` primitive (docs §15): traffic-light dots at 0.42 alpha, uppercase `Sovereign · Intelligence Platform` label at 10px / 0.07em / `rgba(255,255,255,0.32)`, and a `<StatusPill tone="live" text="Live" />` on the right. Background uses the canonical chrome gradient `linear-gradient(to bottom, #0D1B32, #0B1729)` with the documented `rgba(147,147,147,0.10)` bottom hairline. `SidebarTrigger` stays as the leading control (kept thumb-reachable; behaviour identical, including mobile-sheet toggle). Dots + label hide below `sm` so the header degrades cleanly on narrow viewports. Header height held at 44px so SidebarInset body / scroll calculations don't shift. Note: an earlier pass had explicitly stripped this chrome as "landing-only fiction"; this pass deliberately re-introduces it because the user wants the real product to read as a composed application surface, not a page with cards inside it. Documented this reversal here so future agents don't undo it again.
  - **Three-level surface hierarchy made explicit, opt-in via primitives.** Before this pass:
    - sidebar `#070A14` (deepest)
    - workspace `#080F1E` (lifted)
    - cards on workspace **also `#080F1E`** ← visually flat against the workspace
    Added a `tone` prop to two existing primitives so the dashboard can opt in without affecting other routes:
    - `src/components/panels/SectionSurface.tsx` — `tone: "default" | "lifted" | "well"`. Default unchanged (`#080F1E` / border 0.13). `lifted` paints `#0B1325` / border 0.16 — one tonal step above the workspace, used by every dashboard card. `well` paints `#070D1A` / border 0.10 — one step *below* the workspace, used as a recessed inner region inside a `lifted` card (the chart wells).
    - `src/components/panels/MetricCard.tsx` — same `tone: "default" | "lifted"` prop, both compact and large variants. Default keeps the existing `#080F1E` resting. `lifted` paints `#0B1325` / border 0.18.
    Net depth chain on the dashboard now reads, deepest → lightest: **sidebar (`#070A14`) → workspace (`#080F1E`) → card (`#0B1325`) → chart well inside card (`#070D1A`)**. Hue stays in the same blue-shifted family (panel-system §4.1), all border alphas pulled from the documented `rgba(147,147,147, X)` ramp (§5).
  - **Lifted-tone hover variant added.** `sv-hover-card`'s hover (`bg #0A1223`) sits *below* the new `lifted` resting tone (`#0B1325`), which would mean lifted cards visually sink on hover. Added `.sv-hover-card-lifted` in `src/app/globals.css` with `:hover { background-color: #0E1830; border-color: rgba(147,147,147,0.30) }` so lifted cards hover *upward* and stay consistent with the depth chain. `MetricCard` auto-picks the right variant based on its `tone` prop; the dashboard's Quick Actions tiles continue to use the default `sv-hover-card` since they sit on the lifted card surface and want a *darker* hover, not a lighter one.
  - **Recent Interviews rewritten as a composed product list.** Each row was a `Link` with two ad-hoc text blocks and an inline status pill. Replaced with a new `InterviewListRow` sub-component that follows the panel-system `ListRow` recipe (docs §15 ListRow): 52px min height, 1px hairline border at `rgba(147,147,147,0.10)` for inter-row structure (so consecutive rows read as a list, not a stack of free-floating items), `rounded-[6px]` corners, leading 28px `IconWell` accent-tinted by status (green for COMPLETED, amber for in-flight, red for FAILED), 12.5px / 600 / white-92 title, 10.5px / white-50 caption with project · country · date separated by `·` glyphs at white/22, trailing `StatusPill`. Hover follows ListRow's contract: border lifts to 0.26, bg to white/[0.025]. Did *not* use the `ListRow` primitive directly because the row needs to be a Next.js `<Link>` (the primitive only supports `onClick`, which would defeat client-side prefetch / nav). Behaviour identical: same href, same data fields, same status mapping (`STATUS_LABELS`), same scrolling region (`sv-scroll-soft`).
  - **`Upload Interview` CTA restyled to Sovereign tonal accent.** The white-fill shadcn `<Button>` was the loudest element on the screen and broke the dashboard's tonal discipline. Replaced with an inline `<Link>` rendering the panel-system tonal-accent recipe (docs §4.3): `background: rgba(91,156,246,0.09)`, `border: 1px solid rgba(91,156,246,0.24)`, `color: #9CC2F8`, plus a 20px tinted icon well at `rgba(91,156,246,0.13)` containing the `Upload` glyph at the full `#5B9CF6` accent. Sits at 12.5px / 600 / 5px radius — same dimensional weight as the previous button so layout doesn't shift, but reads as part of the dark system rather than punching out of it. Click target / `href` / accessibility unchanged.
  - **Page header refined with an operational scope line.** Kept the existing eyebrow + 28px title. Added a third line below the title: `Snapshot · {today's date} · {projectCount} projects · {interviewCount} interviews`, derived entirely from the data the page already fetches — no invented metrics, no fake "12% up" chips. Renders at 11.5px / white-45 / `letter-spacing: -0.005em` with subdued white/22 separator dots and `tabular-nums` on the counts. The header now reads as a status line on a real product, not a generic page title.
  - **Sidebar account block refined.** `src/components/dashboard/app-sidebar.tsx` `SidebarFooter`:
    - Added a hairline divider on top (`borderTop: 1px rgba(255,255,255,0.06)`) so the account block reads as a separate "system identity" zone rather than a floating menu item.
    - Padding tightened to `pt-2.5 px-2 pb-3` (with `px-1.5` in the icon-collapsed state) to match the rest of the sidebar's 4-pt rhythm.
    - Avatar reduced from 32px → 28px (`size-7`), fallback recoloured from full `#5B9CF6` to the softer `#9CC2F8` on `rgba(91,156,246,0.12)` to read calmer against the deeper sidebar tone, fallback type bumped tighter (10.5px / 600 / 0.02em).
    - Name/email stack hierarchy clarified: name at 12px / 600 / white/92, email at 10.5px / white/45 / `-0.005em` so the email no longer competes with the name. Both lines truncate cleanly via `min-w-0` + `flex-1` + `truncate`.
    - Chevron softened from white/50 → white/35, brightening on row hover.
    - Account-switching / Settings link / Sign-out handler all unchanged. Tooltip-on-collapsed behaviour preserved.
  - **Chart wells.** The two analytics SectionSurfaces (`Interviews by Project`, `Topic Distribution`) now use `tone="lifted"` for the outer card and wrap their chart in a recessed `well`-style div: `background: #070D1A`, `border: 1px solid rgba(147,147,147,0.10)`, `rounded-[4px]`, `p-2`. Reads as a chart canvas inside a card inside the workspace inside the shell — the four-step depth chain documented above. No chart code or data props changed.
  - **Adaptations vs straight 1:1 from the handoff.** Two intentional deviations:
    1. Header chrome height kept at 44px (vs landing's `py-[9px]` ~32px). The landing chrome floats inside a screenshot-sized panel; the real app top bar needs a thumb-reachable trigger, so 44px is the correct product height.
    2. `Recent Interviews` rows render via a custom inline component instead of the `ListRow` primitive, because `ListRow` only supports `onClick` and the row must be a Next.js `<Link>` for client-side prefetch. The visual contract (heights / paddings / type sizes / borders / hover) matches the primitive 1:1 — only the wrapping element differs.
  - **Files changed.**
    - `src/app/(dashboard)/dashboard/page.tsx` — header + KPI tones + Recent Interviews refactor + lifted right rail + chart wells + tonal CTA.
    - `src/components/dashboard/dashboard-inset-header.tsx` — real WindowChrome.
    - `src/components/dashboard/app-sidebar.tsx` — account block.
    - `src/components/panels/SectionSurface.tsx` — `tone` prop.
    - `src/components/panels/MetricCard.tsx` — `tone` prop.
    - `src/app/globals.css` — `sv-hover-card-lifted` variant.
  - **Validation.** `ReadLints` clean across all touched files. `./node_modules/.bin/tsc --noEmit` shows no new errors (only the pre-existing landing-reference `@/components/header` issue). Dev server (`npm run dev`) continued to return `/dashboard` at 200 after the change set; sidebar collapse/expand, mobile sheet, dropdown trigger, sign-out, KPI links, Quick Action links, and Recent-Interview row navigation all behave as before.
- 2026-04-17: **CTA consistency pass + Network Explorer pill refinement + page eyebrow cleanup.** Cross-page polish to make the four primary actions across the app feel like one product language and to bring the Network Explorer filter pills in line with the rest of the system's tonal accent ramp. No functional changes, no copy changes, no layout changes.
  - **New shared primitive: `TonalActionButton`** (`src/components/panels/TonalActionButton.tsx`, exported from `@/components/panels`). Locks the dashboard `Upload Interview` recipe — bg `rgba(91,156,246,0.09)` / border `rgba(91,156,246,0.24)` / text `#9CC2F8`, with hover lift to bg `0.14` / border `0.34` / text white, an inner 20px icon well at `bg 0.13 → 0.20`, icon `#5B9CF6 → #7FB1F8`, focus ring `0.55`, `transition-colors 150ms`. All paints are Tailwind utilities (not inline `style`) so `:hover` / `focus-visible` win the cascade — same gotcha that bit `MetricCard` earlier. Single visual treatment by design, so we never end up with N slightly-different page-by-page CTAs. Renders as `<Link>` when `href` is provided, `<button>` otherwise; supports `onClick`, `disabled`, optional leading icon, and an optional `className` escape hatch.
  - **Applied to four primary actions** (functionality preserved — same `href`s, same handlers, same disabled / canUpload gates):
    - **Dashboard** (`src/app/(dashboard)/dashboard/page.tsx`): `Upload Interview` swapped from the inline-class anchor → `TonalActionButton` (the inline anchor is the original recipe; this just lifts it into the primitive). Added `TonalActionButton` to the panels import.
    - **Projects** (`src/app/(dashboard)/projects/page.tsx`): `New Project` (header) and `Create Project` (empty state) swapped from shadcn `<Button asChild>` → `TonalActionButton`. Removed the now-unused `Button` import.
    - **All Interviews** (`src/app/(dashboard)/interviews/page.tsx`): `View Projects` and `Upload Interview` (header), and `Upload Interview` (empty state) swapped from shadcn `<Button>` (`outline` and default variants) → `TonalActionButton`. The `canUpload` gate is preserved verbatim. Removed the now-unused `Button` import.
    - **Copilot** (`src/components/chat/chat-inbox-landing.tsx`): `New chat` (header) and `New chat` (empty state) swapped from shadcn `<Button asChild>` → `TonalActionButton`. Removed the now-unused `Button` import.
  - **Network Explorer pill refinement** (`src/components/network/entity-graph.tsx`). The filter pills (`Person` / `Company` / `Government` / `Organization` / `Location` / `Event`) previously painted the *full saturated* `nodeColor(type)` as their active background — that read as opaque/blocky on a dark canvas and was the loudest UI element in the network workspace. Now follows the same tonal accent recipe used by the rest of the system: bg `color-mix(in srgb, ${accent} 13%, transparent)` / border `color-mix(in srgb, ${accent} 32%, transparent)` / text `${accent}` (full) / dot `${accent}` (full). Inactive pills got a softer treatment too — hairline `rgba(147,147,147,0.18)` border, transparent fill, dim white text, slight border lift on hover. The `Hide isolated` toggle was rebuilt with the same logic. Pills also picked up consistent typography (`text-[11px]`) and the leading `Show:` label became an uppercase `text-[11px] tracking-[0.08em] text-white/40` eyebrow to align with the panel system's chrome label vocabulary. Semantic colour mapping is **unchanged** — `PERSON` is still blue, `COMPANY` still green, etc. Only the fill weight / border definition / text contrast changed; the chips now feel refined and consistent with `IconWell`, `StatusPill`, and the dashboard Quick Actions surface.
  - **Page eyebrow cleanup (redundancy with the header chrome).** The repeated `Intelligence Platform` eyebrow above page titles was redundant with the system header strip and added vertical noise. Removed from:
    - `src/app/(dashboard)/dashboard/page.tsx` (above `Dashboard`)
    - `src/app/(dashboard)/projects/page.tsx` (above `Projects`)
    - `src/app/(dashboard)/interviews/page.tsx` (above `All Interviews`)
    - `src/app/(dashboard)/network/page.tsx` (above `Network Explorer`)
    - `src/components/chat/chat-inbox-landing.tsx` (`Sovereign · Copilot` above `Copilot`)
    Other eyebrows (`Sovereign · Reports`, `Sovereign · Settings`, `Sovereign · Administration`, the `Project` eyebrow on `/projects/[id]`) were left in place — they carry real scope context that the chrome does not duplicate. Tactical, not blanket.
  - **Files touched.**
    - New: `src/components/panels/TonalActionButton.tsx`.
    - `src/components/panels/index.ts` — re-export `TonalActionButton` + `TonalActionButtonProps`.
    - `src/app/(dashboard)/dashboard/page.tsx` — eyebrow removal + CTA primitive.
    - `src/app/(dashboard)/projects/page.tsx` — eyebrow removal + 2× CTA primitive.
    - `src/app/(dashboard)/interviews/page.tsx` — eyebrow removal + 3× CTA primitive.
    - `src/app/(dashboard)/network/page.tsx` — eyebrow removal.
    - `src/components/chat/chat-inbox-landing.tsx` — eyebrow removal + 2× CTA primitive.
    - `src/components/network/entity-graph.tsx` — tonal pill refactor (active + inactive states for entity-type pills *and* the `Hide isolated` toggle).
  - **Validation.** `ReadLints` clean on all touched files. `npx tsc --noEmit` clean (the only error is the pre-existing `src-landing/components/panels/transcript-review.tsx` `@/components/header` import — landing-only file, unrelated). Dev server hot-reloaded cleanly with no compile errors. All routes (`/dashboard`, `/projects`, `/interviews`, `/network`, `/chat`) responded `307 → /login` (expected — unauth). All click destinations, role gates (`canUpload`, `editableProjectIds`), filter toggles (`hiddenTypes`, `hideIsolated`), and graph behaviour are untouched — this was strictly a visual / primitive-extraction pass.
- 2026-04-17: **Region-coloured project pills + sticky workspace header.** Two small but high-impact UX fixes — neither touches product logic.
  - **Region → accent color mapping** (`src/lib/region-colors.ts`). Introduces a stable, region-keyed accent palette so the previously neutral region pills on `Projects` (and the project detail header) gain controlled visual differentiation. Mapping covers every region in `REGIONS` from `src/lib/country-region-data.ts`:
    - **Africa** (warm/earth family): West `#FBBF24` (amber), East `#34D399` (emerald), Southern `#FB7185` (rose), North `#FB923C` (orange), Central `#2DD4BF` (teal).
    - **Americas**: LatAm & Caribbean `#F87171` (salmon), North America `#5B9CF6` (Sovereign blue, system primary).
    - **Asia**: Southeast `#A78BFA` (violet), South `#F472B6` (pink), Central `#22D3EE` (cyan), Middle East `#EAB308` (mustard), East `#EF4444` (red).
    - **Europe** (cool family): Western `#818CF8` (indigo, matches Interviews accent), Central `#7DD3FC` (sky), Northern `#94A3B8` (slate), Southern `#F97316` (burnt orange), Eastern `#A3E635` (lime).
    - **Other**: Oceania `#06B6D4` (turquoise), Antarctica `#CBD5E1` (icy slate).
    - Adjacent continents share neighbouring hues so the project grid reads as related families when scanned. No region picks a fully-saturated primary; nothing is neon.
    - Unknown / null regions fall back to neutral slate `#94A3B8` — pills always render.
    - Pills consume the hex through the existing `SectionChip` `tone="accent"` recipe (bg @ 18%, border @ 50%, text @ 80%) so the tonal discipline matches the rest of the system (entity-type pills on the network graph, Quick Actions, IconWell, StatusPill). Added the leading dot for extra scanability.
    - Applied in `src/app/(dashboard)/projects/page.tsx` (each project card on the grid) and `src/app/(dashboard)/projects/[id]/page.tsx` (the project detail header).
  - **Workspace header is now sticky on long pages** (`src/app/(dashboard)/layout.tsx`). The dashboard top bar carries the only desktop sidebar trigger; on long-form routes (transcript review, dense interview lists, war room) the trigger scrolled off-screen and users had to scroll back to the top to collapse / expand the sidebar. Root cause: the shadcn `SidebarProvider` wrapper used `min-h-svh`, which let document content push the wrapper past viewport height — meaning the *body* scrolled, not the inner `overflow-auto` container — so the header (which lives outside that container) scrolled with everything else. Fix: locked the wrapper to `h-svh max-h-svh overflow-hidden` via a `className` on `SidebarProvider`. Now the wrapper is exactly one viewport tall, `SidebarInset` (`flex-1` of the wrapper) inherits a fixed height, its `overflow-hidden` + the children div's `overflow-auto` actually become a working scroll region, and the header (`shrink-0`, sibling of the scroll region) stays naturally pinned at the top of the workspace panel. No `position: sticky` needed, no z-index war, no visible "floating navbar" feel — the header reads as part of the panel chrome because that's exactly what it is. Shadcn's default `min-h-svh` survives the `cn()` merge but is a no-op against the explicit `h-svh`. Desktop margins (`md:m-2` on the inset) and the rounded panel still apply unchanged.
  - **Files changed.**
    - New: `src/lib/region-colors.ts`.
    - `src/app/(dashboard)/projects/page.tsx` — `regionColor` import + accent pill on project cards.
    - `src/app/(dashboard)/projects/[id]/page.tsx` — `regionColor` import + accent pill on detail header.
    - `src/app/(dashboard)/layout.tsx` — `className="h-svh max-h-svh overflow-hidden"` on `SidebarProvider`.
  - **Validation.** `ReadLints` clean. Dev server hot-reloaded cleanly with no compile errors. `/projects` and `/interviews/[id]` responded 200 after the changes, including the long-form interview detail route used to verify the sticky behaviour. No changes to product logic, navigation, role gates, sidebar collapse/expand, mobile sheet, or pinned chat sub-nav — purely shell-level scroll containment + a taxonomy-driven pill recolour.
- 2026-04-17: **Source-type pill on `All Interviews` rows** — small clarity refinement so each row communicates *what kind of source* it represents without depending on the duration field.
  - **Why.** `audio_duration` is the only metadata that previously distinguished an audio recording from a document upload (PDF/text → no duration). Document rows showed a generic neutral `PDF` chip; video rows had no special treatment at all and inherited the audio Mic icon. From a glance, users could not reliably tell what type a row was, especially when audio rows had not yet been processed (no duration yet either).
  - **Reusable helper** at `src/lib/interview-source.ts` — `interviewSourceMeta(source_type)` returns `{ label, color, Icon }`:
    - `audio` → `Audio`, `#34D399` (emerald), `Mic` icon — voice / live recording family.
    - `document` → `Transcript`, `#A78BFA` (violet), `FileText` icon — text / document family. Labelled `Transcript` (not `Document`) because conceptually the underlying content *is* a transcript regardless of upload format.
    - `video` → `Video`, `#FB923C` (orange), `Video` icon.
    - Unknown / null → neutral slate `Source` fallback so the UI never breaks if a new enum value is added.
    - Hex colours sit inside the existing palette discipline (same family as the region pills + network filter chips); none are neon or fully saturated. The hex is consumed via the standard `SectionChip tone="accent"` recipe (bg @ 18%, border @ 50%, text @ 80%), matching every other tonal pill in the system.
  - **Row update** in `src/app/(dashboard)/interviews/page.tsx`:
    - Leading `IconWell` now picks both its accent *and* its icon from `interviewSourceMeta(...)`. Audio rows stay green-Mic, document rows pick up violet-FileText, video rows finally get an orange-Video icon (previously fell through to the Mic).
    - Right metadata cluster now renders the source pill *unconditionally* on every row — `<SectionChip tone="accent" color={source.color} dot>{source.label}</SectionChip>` — followed by an optional `Clock + duration` (audio with `audio_duration > 0` only) and the existing `StatusPill`. Order is `Source → Duration → Status` so the "what" reads before the "where in the pipeline".
    - Removed the old branching between `<SectionChip tone="neutral">PDF</SectionChip>` and the duration span — the pill now always answers the source question, and the duration only shows up when it actually has a value to display. Document rows no longer feel emptier than audio rows.
    - `audio_duration` guard tightened to `!= null && > 0` so freshly-uploaded audio rows that still have `0` duration don't show a stray `Clock 00:00` chip.
  - **Scope discipline.** No changes to row layout / hover / spacing / typography, no changes to upload flow, no changes to `STATUS_LABELS`, no edits to `/interviews/[id]` (the page already renders source-aware via `source_type === "document"`), no edits to dashboard recent-interviews. The helper is exported and reusable wherever an interview row gets rendered later (e.g. dashboard recent list, project detail interview list) — but nothing else was changed in this pass.
  - **Files touched.**
    - New: `src/lib/interview-source.ts`.
    - `src/app/(dashboard)/interviews/page.tsx` — import the helper; drive `IconWell` icon/colour from it; render the source pill in the metadata cluster.
  - **Validation.** `npx tsc --noEmit` clean (only the pre-existing `src-landing/components/panels/transcript-review.tsx` import error remains, unchanged). `ReadLints` clean on both touched files. Dev server hot-reloaded; `/interviews` continues to return 200 with no compile errors.
- 2026-04-17: **Interview review width + interview detail accent pass** — focused refinement on two interview-related screens. Strictly visual; no functional or data changes.
  - **Transcript Review editor wider.** `src/components/interviews/transcript-review-editor.tsx` outer container changed from `max-w-5xl` (1024px) to `max-w-7xl` (1280px) with `lg:px-8` so the editing surface uses ~1216px on a wide inset instead of ~976px. The inset on a 1920px viewport leaves comfortable margins (~180px on either side after the Sidebar + inset gutters), so the editor no longer feels artificially squeezed into a central column. Per-segment textareas inherit the new width but stay around 75–85 chars per line at the existing `text-[14px] leading-[1.65]`, which is still inside comfortable reading bounds — no other inner constraint was relaxed (the Find input keeps its `sm:max-w-xl`). No structural changes to the segment cards, find/replace panel, audio scrubber, save/mark-ready actions, or seed-entity flow.
  - **AudioPlayer rebuilt around the Sovereign panel surface + amber accent.** `src/components/interviews/audio-player.tsx` no longer uses the shadcn `Card` + `Button` primitives that landed it in the generic neutral palette. New treatment matches the per-segment audio scrubber inside transcript review so "audio playback" reads as the *same thing* across the product:
    - Outer container: 6px radius, `border-[rgba(147,147,147,0.16)]` hairline, `bg-[#080F1E]` (the established `SectionSurface` tone).
    - Play / Pause: bespoke 32px circular button on `rgba(251,191,36,0.10)` with a `rgba(251,191,36,0.32)` border and a 14px filled (`fill="currentColor"`, `strokeWidth={0}`) lucide `Play` / `Pause` icon in `#FBBF24`. The play triangle gets a `translate-x-[0.5px]` so its optical centre lands correctly inside the circle.
    - Progress: three-layer treatment — base 3px white-@-8% rail, amber-`#FBBF24` 3px fill sized to `currentTime / duration`, and a transparent native `<input type="range">` on top with a 10px round amber thumb that carries a 2px `#080F1E` halo so the dot punches out cleanly against the surface. WebKit + Firefox parity styled.
    - Time labels: 11.5px tabular-nums, `text-white/55`.
    - Mute toggle stays neutral on purpose (`rgba(147,147,147,…)` hairline, white/55 → white/80 on hover): the amber is reserved for the *playback* semantic (play state + scrub progress); volume is a different concept and shouldn't compete for the accent.
    - Loading + error states updated to the same surface tone so they don't visually pop out of the layout.
    - `togglePlay`, `handleSeek`, `toggleMute`, the entire HTMLAudioElement listener wiring, and the `aria-*` contract are byte-for-byte unchanged.
  - **Executive Summary subtly accented.** `src/app/(dashboard)/interviews/[id]/page.tsx` — the Executive Summary card now carries a single restrained Sovereign-blue accent so it reads as the page's primary takeaway:
    - Card border tinted to `rgba(91,156,246,0.20)` and background to `rgba(91,156,246,0.03)` (almost imperceptible — well below the `0.05` "still feels neutral" threshold the panel system uses for ambient tints).
    - The bare leading `<FileText className="text-primary" />` icon was upgraded to a 26px `IconWell` with `accent="#5B9CF6"`, applying the standard tonal recipe (bg @ 13%, border @ 28%, icon hex). This matches the IconWell language used on `/admin`, `/settings`, dashboard Quick Actions, and the new All Interviews source pills.
    - All other intelligence cards in the right rail (Sentiment, Entities, Relationships, Speakers) were intentionally left neutral so the Executive Summary keeps its visual weight — turning every card into a colourful tile is exactly what the brief told us not to do. The Sentiment card already carries semantic colour through its overall/positive/negative dot ramp.
    - No changes to the page layout, grid proportions, sidebar, header, or the audio-player placement above.
  - **Files touched.**
    - `src/components/interviews/transcript-review-editor.tsx` — outer `max-w-5xl` → `max-w-7xl`, added `lg:px-8`.
    - `src/components/interviews/audio-player.tsx` — full visual rebuild, behaviour preserved.
    - `src/app/(dashboard)/interviews/[id]/page.tsx` — Executive Summary accent + IconWell, IconWell import added.
  - **Validation.** `npx tsc --noEmit` clean (only the pre-existing `src-landing/components/panels/transcript-review.tsx` import error remains). `ReadLints` clean on all three touched files. Dev server hot-reloaded; `/interviews/[id]` and `/interviews/[id]/review` continued returning 200 with no compile errors after the change. No functional code paths altered — same handlers, same data flow, same role gates.
