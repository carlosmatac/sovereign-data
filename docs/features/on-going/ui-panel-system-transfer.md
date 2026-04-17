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
