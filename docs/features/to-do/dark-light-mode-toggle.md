---
title: "Dark / light mode toggle"
status: to-do
owner: team
priority: low
last_updated: 2026-05-10
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

- [ ] Toggle is visible and functional in the sidebar/nav.
- [ ] Switching to light mode renders all major pages without broken colors, illegible text, or clipped elements.
- [ ] The preference persists after a page reload and across browser sessions (via localStorage).
- [ ] Dark mode remains the default for new visitors with no stored preference.
- [ ] PDF export is unaffected by the current theme setting.
