---
title: "Dark / light mode toggle"
status: on-going
owner: team
priority: low
last_updated: 2026-05-15
---

# Dark / light mode toggle

## Problem

The platform currently ships with a single fixed dark theme (slate/navy-charcoal, forced via `next-themes` with `forcedTheme: "dark"` in `src/components/providers/app-theme-provider.tsx`). There is no light mode.

Some users prefer working in light mode, especially in bright environments or on printed exports. Providing both modes is table-stakes UX polish and improves accessibility.

## Goals

- Build a complete light mode theme that is visually consistent with the brand.
- Add a per-user toggle (dark / light / system) that persists across sessions.
- Remove the `forcedTheme: "dark"` constraint so user preference is respected.

## Non-goals

- Per-project or per-tenant theme settings (user-level only in this spec).
- Custom theme colors or branding beyond the default light/dark pair.
- High-contrast accessibility mode (deferred).

## Approach

### Phase 1 — Light mode design tokens

1. Audit all CSS custom properties in `src/app/globals.css` that are defined only for the `:root` (dark) context.
2. Define a matching set of tokens for a `[data-theme="light"]` or `.light` class context — background, foreground, card, border, muted, accent, etc.
3. Ensure Tailwind classes that use these tokens (`bg-background`, `text-foreground`, `border`, etc.) work correctly in both modes.
4. Review all hardcoded dark-specific colors in components (e.g. `bg-slate-900`, `text-white`) and replace with semantic tokens.

### Phase 2 — Theme toggle component

1. Replace `forcedTheme: "dark"` in `app-theme-provider.tsx` with `defaultTheme: "dark"` (or `"system"`) to allow switching.
2. Add a `ThemeToggle` component (sun/moon icon button) using `next-themes`' `useTheme` hook.
3. Place the toggle in the dashboard sidebar or top navigation bar.
4. The user's preference is stored by `next-themes` in `localStorage` — no DB column needed.

### Phase 3 — QA pass

1. Walk through every major page (Dashboard, Source Detail, Transcript Review, Network Explorer, Chat, Reports, Admin) in light mode.
2. Fix any remaining hardcoded dark-only color references.
3. Verify PDF exports (via `@react-pdf/renderer`) are unaffected — PDF styles are inline and do not inherit CSS variables.

## Technical notes

- `next-themes` is already installed (used by `app-theme-provider.tsx`). Only the `forcedTheme` prop needs to be removed and the light CSS tokens added.
- Shadcn/ui components use CSS variables by default, so they will switch automatically once the light-mode tokens are defined.
- The logo (`#0f172a` + white) may need a light-mode variant with inverted or brand-adjusted colors.

## Constraints

- Do not break the existing dark theme — it is the default and must remain the fallback.
- PDF rendering must remain unchanged.

## Risks & open questions

- **Design effort:** building a fully polished light mode requires a design pass, not just inverting colors. Rushing it can produce an unreadable or visually inconsistent result. Consider a gated beta (feature flag) until the light mode is design-reviewed.
- **Open question:** should "system" (follows OS preference) be offered as a third option, or just dark/light?
- **Open question:** should the preference be stored in the DB (`profiles` table or `tenant_settings`) to sync across devices, or is `localStorage` sufficient?

## Acceptance / how to validate

- [x] Toggle is visible and functional in the top bar (sun/moon icon, right-aligned).
- [ ] Switching to light mode renders all major pages without broken colors, illegible text, or clipped elements.
- [x] The preference persists after a page reload and across browser sessions (via localStorage).
- [x] Dark mode remains the default for new visitors with no stored preference.
- [ ] PDF export is unaffected by the current theme setting.

---

## Implementation notes

### What was done (2026-05-15)

#### Token layer

- `src/app/globals.css`: Added `@custom-variant light (&:is(.light *))` for Tailwind light-mode prefix support. Added `.light { ... }` CSS block redefining all shadcn tokens (`--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--chart-*`, all `--sidebar-*`). Updated `sv-hover-card`, `sv-hover-card-lifted`, and `sv-scroll-soft` utilities to use theme-aware CSS variable fallbacks (`--sv-hover-card-bg`, `--sv-scrollbar-thumb`, etc.).
- `src/styles/design-tokens.css`: Added `.light { ... }` block redefining all `--sv-*` semantic tokens (surfaces, borders, text scale, gray scale, accent backgrounds, shadows). Added complementary `.dark { ... }` block for the new helper tokens (`--sv-hover-card-bg`, `--sv-scrollbar-*`). `--sv-card-hover-fill` and `.sv-card:hover` updated to use CSS var.

**Light palette rationale:** Cool off-white shell (`#F0F1F6`) with near-white lifted surface (`#FAFBFD`) and slightly recessed sidebar (`#E6E7EE`). Text uses dark-navy alpha scale mirroring the white-alpha scale in dark mode. Accent colors (brand blues, greens, etc.) are unchanged — they read well on both backgrounds.

#### Infrastructure

- `src/components/providers/app-theme-provider.tsx`: Removed `forcedTheme="dark"`. Added `themes={["dark", "light"]}`. Dark remains `defaultTheme`.
- `src/components/ui/theme-toggle.tsx`: New `ThemeToggle` component — compact Sun/Moon icon button, mounted lazily (avoids hydration mismatch), uses `useTheme` from next-themes.

#### Shell components

- `src/components/dashboard/dashboard-inset-header.tsx`: Replaced hardcoded `#0E1118`/`#0B0D12` gradient and `rgba(255,255,255,0.32)` label with `var(--sv-chrome-gradient)` and `var(--sv-text-eyebrow)`. Added `<ThemeToggle />` right-aligned in the bar. Sidebar trigger now uses CSS var for color.
- `src/app/(dashboard)/layout.tsx`: `SidebarInset` replaced `bg-[#0B0E14]` + hardcoded border/shadow with `var(--sv-surface-bg)` + `var(--sv-border-divider-muted)` + `var(--sv-shadow-compact)` via inline style.
- `src/components/dashboard/app-sidebar.tsx`: Added `useTheme` import; logo switches between `/aksum.svg` (dark) and `/aksum_black.svg` (light), and mark between `/ak.svg` and `/ak_black.svg`. All nav item classes updated: `text-white/72` → `text-sidebar-foreground`, `hover:bg-white/[0.06]` → `hover:bg-sidebar-accent`, `data-[active=true]:bg-white/[0.08]` → `data-[active=true]:bg-sidebar-accent`. Group labels, footer border, account button text, and chevron now use `var(--sv-*)` tokens.

#### Panel components

- `src/components/panels/SectionSurface.tsx`: Replaced hardcoded hex backgrounds with `var(--sv-surface-bg)`, `var(--sv-canvas-bg)` and borders with `var(--sv-border-*)` vars.
- `src/components/panels/PanelHeader.tsx`: Replaced `text-white` title and `#8a8a8a` subtitle with `var(--sv-text-primary)` and `var(--sv-gray-caption)`.
- `src/components/panels/MetricCard.tsx`: Replaced `bg-[#0B0E14]`/`bg-[#0E1119]` with `bg-[var(--sv-surface-bg)]` arbitrary class (preserves hover-card specificity contract). Label, value, sub colors updated to `var(--sv-text-*)` tokens.
- `src/components/panels/ListRow.tsx`: Replaced `text-white/92`, `text-white/45`, `border-rgba`, hover bg with semantic classes and CSS vars.

#### Page-level fixes

- `src/app/(dashboard)/dashboard/page.tsx`: Replaced all 27+ `text-white/*` with `text-foreground/*` or `text-muted-foreground`. Replaced inline `rgba(147,147,147,...)` separators/borders with `var(--sv-border-*)`. Replaced chart wells `#07080C` with `var(--sv-canvas-bg)`. Replaced hover washes `bg-white/[...]` with `bg-accent`.
- `src/app/(dashboard)/projects/page.tsx`: Replaced `bg-[#0B0E14]`, `text-white/*`, `border-rgba` with semantic tokens.
- `src/app/(dashboard)/interviews/page.tsx`: Same pattern as above.
- `src/components/chat/chat-inbox-landing.tsx`: All `text-white/*` and hover states replaced with semantic equivalents.
- `src/components/chat/intelligence-chat-view.tsx`: User bubble `text-white/88` → `text-primary-foreground/88`.

#### Chart components

- `src/components/dashboard/topic-distribution-chart.tsx`: Tooltip background `#0E1119` → `var(--sv-surface-bg)`, tooltip border/shadow → CSS vars, legend text colors → `var(--sv-text-primary/body/muted)`, hover fill → CSS var.
- `src/components/dashboard/interviews-by-project-chart.tsx`: Same tooltip treatment. Y-axis custom tick colors → `var(--sv-text-primary/body/dim)`. X-axis tick fill → `var(--sv-text-placeholder)`. Cursor fill → CSS var.

### Remaining hardcoded dark-only patterns (follow-up audit)

The following components/pages still have hardcoded dark-only classes and will need attention in a QA pass:

| File | Pattern | Count |
|------|---------|-------|
| `src/app/(dashboard)/projects/[id]/page.tsx` | `text-white/*`, inline `rgba(255,255,255,...)` eyebrow | ~8 |
| `src/components/panels/WindowChrome.tsx` | StatusPill dark gradients, `rgba(255,255,255,...)` text | ~12 |
| `src/components/panels/TonalActionButton.tsx` | `hover:text-white` (accent blue btn — low priority) | 1 |
| `src/components/panels/InsightCard.tsx` | Inline white-alpha text | ~6 |
| `src/components/panels/PanelShell.tsx` | Dark bg/border | ~4 |
| `src/components/panels/AppSurface.tsx` | Dark gradient/chrome | ~4 |
| `src/components/chat/intelligence-activity-status.tsx` | `variant=dark` branch hardcoded | ~8 |
| Network Explorer components | Many `text-white/*` in graph UI | ~15 |
| Source detail / Transcript review pages | Inline dark text colors | ~10 |
| Admin pages | Various `text-white/*` | ~8 |

These do not break functionality; they will show dark colors in light mode. Prioritise for a QA pass before marking this feature `done`.
