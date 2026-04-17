# Sovereign — Panel System Handoff

> **Purpose of this document**
> Everything a different repo needs to recreate the Sovereign landing-page panel system with near-1:1 visual fidelity. Exact tokens, exact class patterns, exact layout decisions, real code excerpts.
>
> This document is paired with:
> - `src/lib/design-tokens.ts` — TypeScript tokens
> - `src/styles/design-tokens.css` — CSS variables
> - `src/components/panels/*` — reusable primitives extracted from the landing
>
> Use this as the source of truth. If anything below conflicts with improvised design decisions later, this document wins.

---

## Table of Contents

1. [Visual Philosophy](#1-visual-philosophy)
2. [Product Feel & Design Intent](#2-product-feel--design-intent)
3. [Typography](#3-typography)
4. [Colors](#4-colors)
5. [Borders](#5-borders)
6. [Shadows](#6-shadows)
7. [Border Radius](#7-border-radius)
8. [Spacing Scale](#8-spacing-scale)
9. [Layout Rules](#9-layout-rules)
10. [Composition Principles](#10-composition-principles)
11. [Interaction Rules](#11-interaction-rules)
12. [Transitions & Motion](#12-transitions--motion)
13. [Do / Don't Guidelines](#13-do--dont-guidelines)
14. [What Makes Panels Feel Premium](#14-what-makes-panels-feel-premium)
15. [Core Primitives](#15-core-primitives)
16. [Landing → Real App Mapping](#16-landing--real-app-mapping)
17. [Migration Checklist](#17-migration-checklist)

---

## 1. Visual Philosophy

The panel system is the visual answer to one question:

> "What does *serious software* look like when it needs to sell itself on a landing page?"

Every design decision below flows from four commitments:

1. **Software-first, not mockup-first.** Every surface renders at app-realistic density, with app-realistic typography (10px titles, 8px meta, 12px body). Nothing is inflated for "marketing legibility".
2. **Tonal discipline.** One neutral border hue (`rgba(147,147,147, X)`), one family of bluish-black surfaces, a fixed 10-color accent palette. New hues are banned.
3. **Visible craft.** Three-layer shadows, 1px white top highlights, tiny 5–6px colored dots, 0.07em uppercase tracking. The polish is in the micro-details.
4. **Editorial restraint.** No gradients as decoration. No blur. No "AI glow". The only gradients in the system are structural: the window-chrome strip and the bar-chart fills.

If a change adds noise without adding information, reject it.

---

## 2. Product Feel & Design Intent

| Feel we aim for | How it shows up in the panels |
| --- | --- |
| **Premium** | 17px outer radius, 3-layer shadows, 0.025 white highlight edge |
| **Editorial** | Playfair Display for report titles, generous prose line-heights (1.65–1.82), serif in a mostly-sans system |
| **Operational** | Uppercase chrome labels, traffic-light window controls, status pills, tabular-nums on all numerical data |
| **Calm** | White text never sits at 1.0 opacity in body copy — 0.52 to 0.88. Backgrounds are near-black navy, not pure black |
| **Dense but scannable** | 4-pt spacing with micro values (2.5, 3.5, 7, 9, 11) that keep interfaces tight without cramping |

The panels should feel like a screenshot of a real internal-tools app that happens to be *well-designed* — not like a Figma concept rendered for a pitch deck.

---

## 3. Typography

### 3.1 Fonts

```css
--sv-font-sans:  'Inter', 'Inter Fallback', system-ui, sans-serif;
--sv-font-serif: 'Playfair Display', 'Playfair Display Fallback', Georgia, serif;
--sv-font-mono:  'Geist Mono', 'Geist Mono Fallback', monospace;
```

**Inter** is the voice of the product UI. It carries 95%+ of the characters on screen. Use Inter for every button, label, card, nav item, chart tick, and status pill.

**Playfair Display** is used exclusively for *editorial* typography inside content surfaces: report titles, newsletter headlines, brief headlines. It must always be set at `font-weight: 400` (not bold), with aggressive negative tracking (`-0.020em` to `-0.028em`) and tight line-heights (1.08–1.15). That combination is what makes it feel "confident, not decorative".

**Geist Mono** is declared in the token file but only appears in passing — KPI values and metric rows already use `tabular-nums` on Inter, which is preferred. Keep Mono available but don't pull it in without reason.

### 3.2 Size scale — px-precise

The panel system uses a deliberately small and granular size scale. It is **not** a Tailwind / Material scale — it has 0.5px increments because the visual density depends on them.

| Token | px | Role |
| --- | --- | --- |
| `--sv-text-2xs` | 6.5 | Axis tick labels, ultra-fine tooltip text |
| `--sv-text-xs` | 7 | Chart micro-labels, percentage chips, small counts |
| `--sv-text-sm` | 7.5 | Eyebrow labels, graph node labels, filter pills |
| `--sv-text-base` | 8 | Chip labels, control buttons, row metadata |
| `--sv-text-md` | 8.5 | Card stat sub-labels, chart headers, status pill |
| `--sv-text-lg` | 9 | Report section meta, mid-density labels |
| `--sv-text-xl` | 9.5 | Interview rows, section eyebrow ("EXECUTIVE SUMMARY"), KPI sub |
| `--sv-text-2xl` | 10 | **Panel title inside WindowChrome** (default card title) |
| `--sv-text-3xl` | 10.5 | Chrome labels in desktop / default body-mid |
| `--sv-text-4xl` | 11 | Copilot body text, chat bubble (mid-density) |
| `--sv-text-5xl` | 11.5 | Insight paragraph, report body |
| `--sv-text-6xl` | 12 | Card body / standard reading size inside panels |
| `--sv-text-7xl` | 12.5 | Chat bubble, insight headline |
| `--sv-text-8xl` | 13 | Report meta / subtitle in mobile shells |
| `--sv-text-9xl` | 15 | Brief / newsletter title (serif) |
| `--sv-text-10xl` | 16 | Report section heading (serif) |
| `--sv-text-11xl` | 18 | KPI value (compact) |
| `--sv-text-12xl` | 22 | KPI value (large / dashboard) |
| `--sv-text-13xl` | 2.4rem | Intelligence report hero title |

### 3.3 Weights

| Weight | Usage |
| --- | --- |
| 400 | Serif report / brief titles — always |
| 500 | Nav items, chip labels, card metadata |
| 600 | Panel titles, headlines, status pills, KPI values (compact) |
| 700 | KPI values (compact variant — `font-bold`) |

The system never uses `font-weight: 300` or `800/900`. They feel either too fragile or too shouty on dark.

### 3.4 Letter-spacing (tracking)

| Token | Value | Role |
| --- | --- | --- |
| `body-tight` | `-0.005em` | Insight body, long paragraphs |
| `body` | `-0.010em` | Card body, chat text |
| `body-firm` | `-0.011em` | Chat bubble text |
| `headline-xs` | `-0.012em` | Card headline |
| `headline` | `-0.014em` | Section headline |
| `headline-sm` | `-0.015em` | Interview panel h2 |
| `headline-lg` | `-0.020em` | Report / newsletter serif title |
| `headline-xl` | `-0.028em` | Intelligence report hero title |
| `uppercase-tight` | `0.04em` | Monospace indexes (01, 02 …) |
| `uppercase-chrome` | `0.07em` | Window-chrome label |
| `uppercase-eyebrow` | `0.08em` | Section eyebrow |
| `uppercase-status` | `0.09em` | Status pills |
| `uppercase-vol` | `0.10em` | "Vol. 44", "April 2026" newsletter meta |
| `uppercase-report` | `0.12em` | Report section uppercase |
| `uppercase-hero` | `0.14em` | Intelligence report hero eyebrow |

### 3.5 Line-heights

| Token | Value | Role |
| --- | --- | --- |
| `none` | 1 | KPI values only |
| `tight` | 1.08 | Serif report title |
| `snug` | ~1.15 | Default snug (Tailwind `leading-snug`) |
| `card` | 1.5 | Small card body |
| `prose` | 1.65 | Insight body, interview transcript |
| `longform` | 1.72 | Executive summary body |
| `report` | 1.82 | Report paragraph body |

---

## 4. Colors

### 4.1 Surfaces (there are only four)

| Token | Hex | When to use |
| --- | --- | --- |
| `--sv-panel-bg` | `#070E1F` | **Outer shell** of every panel. Non-negotiable. |
| `--sv-surface-bg` | `#080F1E` | Nested cards / detail wells inside a panel. One step darker than `panel-bg`. |
| `--sv-canvas-bg` | `#050C1A` | SVG data canvases only (graph, map) |
| `--sv-chrome-top` → `--sv-chrome-bottom` | `#0D1B32` → `#0B1729` | Top-to-bottom gradient for the WindowChrome strip |

**Do not introduce `#000` as a surface color.** It makes the panels feel flat and cheap. The blue-shifted darkness is signature.

### 4.2 Text — two parallel scales

Use the **white/alpha scale** for primary UI text and the **neutral gray scale** for captions and tertiary metadata.

White/alpha (primary):

```
rgba(255,255,255, X) — X ∈ {0.88, 0.85, 0.75, 0.72, 0.70, 0.65, 0.62, 0.58, 0.55, 0.52, 0.45, 0.42, 0.32, 0.28, 0.22, 0.18, 0.17, 0.10}
```

Neutral gray (captions):

```
#777, #666, #5e6878, #5e5e5e, #5a5a5a, #555, #505a66, #4a5060, #4a4a4a, #444
```

Memorize the five most-used values: `0.88` (primary), `0.72` (body), `0.55` (secondary), `0.32` (meta), `#5e6878` (caption).

### 4.3 Accents (fixed palette — do not extend)

| Hex | Role |
| --- | --- |
| `#5B9CF6` | Blue — **Person** / primary accent |
| `#34D399` | Green — **Company** / positive state |
| `#4ADE80` | Bright green — **Live / Ready** status pill only |
| `#A78BFA` | Violet — **Government / institutional** |
| `#FBBF24` | Amber — **Event / pending / Final Draft** |
| `#F87171` | Red — warning |
| `#FB7185` | Bright red — alternate warning |
| `#FB923C` | Orange — auxiliary entity |
| `#7DD3FC` | Cyan — **Organization / Document** |
| `#38BDF8` | Bright cyan — topic accent |
| `#818CF8` | Indigo — topic accent |
| `#60A5FA` | Soft blue — processing / passive |
| `#F472B6` | Pink — **Initiative** |
| `#94A3B8` | Slate — muted auxiliary |

**Tonal pairing rule.** When an accent is used as a chip background or a well, it always appears at these alphas:

```
bg  → hex at 0.07 – 0.13 alpha
border → hex at 0.17 – 0.28 alpha
text  → hex at 0.80 – 1.00 alpha (usually full)
```

Example (Live status pill):

```css
background: rgba(74,222,128,0.07);
border:     1px solid rgba(74,222,128,0.17);
color:      #4ADE80;
```

### 4.4 The gradients

Only **two** gradients exist in the system. Anything else is a mistake.

1. **Chrome strip** — `linear-gradient(to bottom, #0D1B32, #0B1729)`. Subtle vertical tone shift on every window header.
2. **Bar chart fill** — `linear-gradient(90deg, #3A5BA0 0%, #4E78CF 100%)`. Horizontal deep-blue → steel-blue.

An optional third:

3. **Inner-panel diagonal sheen** — `linear-gradient(135deg, rgba(255,255,255,0.012) 0%, #070E1F 28%)`. Applied to the central panel inside an AppSurface. The white stop is so faint (1.2% alpha) that it reads as a tonal bias, not a gradient.

---

## 5. Borders

One hue. Multiple alphas. Always `rgba(147,147,147, X)` with these values:

| Alpha | Use |
| --- | --- |
| `0.09` | Faintest internal dividers |
| `0.10` | Chrome bottom border |
| `0.13` | Standard card border in inner grids |
| `0.14` | **Panel header divider** — signature line under titles |
| `0.15` | Default interactive card border |
| `0.16` | **Outer panel shell border** |
| `0.18` | Detail card border, neutral chip border |
| `0.22` | Button / control border |
| `0.30` | Hover state for cards |
| `0.32` | Strong hover state for cards |
| `0.38` | Highest strong hover |

Two special edges:

- `rgba(255,255,255,0.025)` — 1px inner highlight used as the first shadow layer. Lifts the panel off the page.
- `rgba(255,255,255,0.05)` — stronger inner highlight on the hero dashboard.

**Rule.** Never introduce a border color outside these values. If you need "more presence", increase the alpha by one step; never shift the hue.

---

## 6. Shadows

Every panel shadow is a **3-layer composition**. Single-value `shadow-2xl` is banned because it produces a diffuse, unprofessional blur.

### 6.1 The four recipes

```css
/* Hero dashboard — flagship shell */
--sv-shadow-hero:
  0 0 0 1px rgba(255,255,255,0.05),
  0 32px 80px -12px rgba(0,0,0,0.85),
  0 8px  32px -4px  rgba(0,0,0,0.55);

/* Copilot / Sales Intelligence — mid-weight */
--sv-shadow-copilot:
  0 0 0 1px rgba(255,255,255,0.025),
  0 36px 80px -16px rgba(0,0,0,0.75),
  0 8px  24px -6px  rgba(0,0,0,0.55);

/* Intelligence Report — deepest ambient (long-document feel) */
--sv-shadow-report:
  0 0 0 1px rgba(255,255,255,0.025),
  0 48px 120px -24px rgba(0,0,0,0.85),
  0 8px   24px  -6px rgba(0,0,0,0.55);

/* Compact / mobile shells */
--sv-shadow-compact:
  0 0 0 1px rgba(255,255,255,0.025),
  0 24px 60px -12px rgba(0,0,0,0.75),
  0 6px  20px  -4px rgba(0,0,0,0.5);
```

### 6.2 What each layer does

1. **`0 0 0 1px rgba(255,255,255, 0.025–0.05)`** — an inset-feeling white hairline along the top. Without it, the panel looks like a flat cut-out sticker.
2. **Ambient** — `0 32–48px 80–120px -12–-24px rgba(0,0,0,0.75–0.85)`. The wide, soft cast that gives the panel depth.
3. **Contact** — `0 6–8px 20–32px -4–-6px rgba(0,0,0,0.5–0.55)`. The tighter cast that "grounds" the panel and separates it from the ambient blur.

---

## 7. Border Radius

The panel system uses **small, technical radii**. Tailwind's `rounded-lg` / `rounded-xl` / `rounded-2xl` are too round. Use these instead:

| Token | px | Where |
| --- | --- | --- |
| `--sv-radius-xs` | 3 | Icon-well inner squares (KPI icon containers) |
| `--sv-radius-sm` | 4 | Nav items, small buttons, project-selector |
| `--sv-radius-md` | 5 | **Default for cards inside grids** (most common) |
| `--sv-radius-lg` | 6 | Central panel inside AppSurface; graph detail card |
| `--sv-radius-xl` | 7 | Send button |
| `--sv-radius-2xl` | 8 | **Copilot insight cards** |
| `--sv-radius-3xl` | 9 | Chat input bar |
| `--sv-radius-4xl` | 10 | Chat bubbles |
| `--sv-radius-5xl` | 14 | Mobile panel shells |
| `--sv-radius-panel` | 17 | **Outer panel radius — signature, never change** |

Pills (status, chips, filters) are fully rounded (`rounded-full`).

---

## 8. Spacing Scale

Uses Tailwind's 4-pt spacing as a base, but with **micro-values** that are essential to the density: `2.5`, `3.5`, `7`, `9`, `11`. These numbers appear in arbitrary-value classes (`px-3.5`, `py-[9px]`, `gap-[11px]`). **Do not round them up** to the next Tailwind step; the panels will lose their tightness.

Key padding patterns observed in production:

| Pattern | Location |
| --- | --- |
| `px-4 py-2.5` | PanelHeader (signature) |
| `px-4 py-[9px]` | WindowChrome (desktop) |
| `px-4 py-[11px]` | WindowChrome (mobile-sized) |
| `px-3 py-[7px]` | Controls toolbar inside panels |
| `px-3 py-2.5` | KPI cards (compact) |
| `px-3.5 py-3` | Project cards in grid |
| `px-4 py-3.5` | **Copilot insight cards** (`px-4 py-3.5`) |
| `px-5 py-5` | AppSurface sidebar |
| `px-5 py-4` | Interview detail sections |
| `px-8 pb-0 pt-10` then `md:px-14 md:pt-14` | Report document body (responsive) |
| `gap-6` | Sidebar section spacing |
| `gap-[5px]` | Traffic-light dots |
| `gap-[6px]` / `gap-[10px]` | Tight control rows |

---

## 9. Layout Rules

### 9.1 The three shells

Every visible panel in the landing uses one of three structural shells:

1. **Single-panel shell** — `PanelShell` only. Used for Copilot, Reports, Output Panels, Mobile Dashboards, Communications. The entire content fills the shell.
2. **App-frame shell** — `PanelShell` + `AppSurface` (sidebar + central panel). Used for the hero dashboard. The central panel has its own smaller radius (6px) and a diagonal sheen.
3. **Composition shell** — two `PanelShell`s stacked with one absolute-positioned behind the other, the back one at 80% opacity. Used for `SalesIntelligenceComposition` (copilot + interview panel layered).

### 9.2 Aspect ratios

- **Hero dashboard:** `aspect-ratio: 880 / 522`
- **Interviews mobile:** intrinsic height, width fills container
- **Copilot panel:** fixed `h-[480px]`
- **Report panel:** intrinsic height (long document)
- **Graph canvas:** `viewBox="0 0 580 320"` (hero) or `"0 0 760 420"` (prepare-sell full)

Never wrap a panel in `aspect-square` / `aspect-video` — the system has its own ratios.

### 9.3 Responsive behavior

The panel sizes are calibrated for desktop (≥1024px). On narrower screens:

- Replace the hero dashboard with `HeroDashboardPanelMobile` — a simpler single-view shell at readable type sizes (10–13px vs 7–10px on desktop).
- Stack multi-column compositions (`SalesIntelligenceComposition`) into a single column.
- Report document: keep vertical rhythm but crop earlier (`h-[420px] overflow-hidden` with a fade-out mask on mobile).
- Preserve the 17px outer radius; it scales gracefully.

---

## 10. Composition Principles

### 10.1 Layered background + foreground

Whenever two panels appear together (e.g. copilot chat on top of interview panel), the back layer is:

- positioned `absolute` / `pointer-events-none`
- opacity `0.80`
- no blur

The front panel sits on top with `z-20` and its full shadow. The shared effect is a controlled, layered editorial composition — not a stack of randomly offset cards. See `SalesIntelligenceComposition` for the reference.

### 10.2 Section dissolves

Every large panel fades into the section below with a bottom gradient:

```tsx
<div
  aria-hidden
  className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-20"
  style={{
    background:
      "linear-gradient(to top, rgba(6,13,28,0.92) 0%, transparent 100%)",
  }}
/>
```

This prevents hard panel-to-page edges on long landing pages.

### 10.3 Dot-field textures

Selected sections use a 20px-spaced dot-field SVG background, rendered at 0.055–0.075 opacity. Never at higher opacity. The dot field adds "technical atmosphere" without competing with the panels.

---

## 11. Interaction Rules

### 11.1 Hover states

| Target | Change |
| --- | --- |
| Card / row | border alpha +0.15, bg white/[0.025] or /[0.03] |
| Nav item | bg white/[0.06], text alpha 0.55 → 0.90 |
| Graph node | full opacity (1.0), dim others to 0.11 |
| Button | border alpha +0.16, slight bg lift (white/0.03 → /0.05) |
| Filter chip (colored) | stays colored when ON, flips to neutral palette when OFF |

### 11.2 Active / selection states

- Nav active item: bg `white/[0.08]`, text fully white.
- Selected graph node: double ring (r+4 at 0.45, r+9 at 0.18), body opacity 0.72 → 0.9.
- Donut slice on hover: active 1.0, inactive 0.18.

### 11.3 Disabled / loading states

- Buttons: bg `white/0.03`, border `rgba(147,147,147,0.07)`, text `white/0.16`.
- Thinking indicator: three 3px dots at `#556`, animated opacity 0.25 → 0.85, 1.1s loop, 0.22s stagger.

### 11.4 Focus

The landing does not over-engineer focus rings — cards/rows use border intensity shifts as their focus affordance. If the target app is accessibility-heavier, add a 1px inset ring in `--sv-accent-blue` at opacity 0.5 without changing anything else.

---

## 12. Transitions & Motion

### 12.1 Durations

| Duration | Role |
| --- | --- |
| 150ms | Hover color transitions on nav / cards |
| 180ms | Cross-fades between UI states |
| 200ms | Opacity transitions on graph nodes / donut slices |
| 250ms | Fade-ins for new content blocks |
| 320ms | **Page-level transitions** (router fade+slide) |
| 420ms | Insight card reveal |

### 12.2 Easing

Two curves only:

```
--sv-ease-premium: cubic-bezier(0.22, 0.8, 0.36, 1);
--sv-ease-reveal:  cubic-bezier(0.25, 0.1, 0.25, 1);
```

`premium` is slightly spring-like on the front half, calm on the back. Use for page transitions and anything involving content entering the viewport.
`reveal` is closer to a standard smooth in-out. Use for staggered content reveals (insight cards, tab content).

### 12.3 Staggered reveals

When a group of blocks animates in (copilot insights, output tabs), stagger each child by **190ms** and animate `opacity 0 → 1` + `y 10px → 0`. Never use scale or rotation — this system does not bounce.

```tsx
<motion.div
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.42, delay: i * 0.19, ease: [0.25, 0.1, 0.25, 1] }}
/>
```

### 12.4 Page transitions

See `components/page-transition.tsx`. Wrap the app's router outlet:

```1:24:components/page-transition.tsx
"use client"

import { usePathname } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{
          duration: 0.32,
          ease: [0.22, 0.8, 0.36, 1],
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
```

---

## 13. Do / Don't Guidelines

### Do

- Use `#070E1F` as the outer panel surface. Always.
- Layer 3 shadow stops — inner highlight, ambient, contact.
- Pin `rounded-[17px]` on outer panels. Nothing looks like Sovereign without it.
- Preserve px-precise font sizes (10px, 8.5px, 7.5px). They are intentional.
- Use 0.07em uppercase tracking on chrome labels.
- Run headlines with *negative* tracking (`-0.012em` to `-0.028em`).
- Keep traffic-light dots at **0.42 alpha** — muted, never vivid.
- Use Playfair Display at weight **400** only, never bold.
- Use tonal accent pairs (bg 0.07–0.13, border 0.17–0.28, fg full).

### Don't

- Don't use pure `#000` as background.
- Don't replace the 3-layer shadow with `shadow-2xl`.
- Don't round up micro-spacing values (`py-[9px]`, `py-[11px]`, `px-3.5`).
- Don't introduce new accent colors outside the 10-color palette.
- Don't animate with bouncy springs or scale transforms — it reads toy-like.
- Don't blur backgrounds for depth. The system uses opacity, not blur.
- Don't use `rounded-lg` / `rounded-xl` on outer panels — they're too round.
- Don't render numerical data without `tabular-nums`.
- Don't set body text to `rgba(255,255,255,1)` — 0.72 is the ceiling for body.
- Don't break the hue discipline on borders — only `rgba(147,147,147, X)`.
- Don't scale up the type scale for "marketing". It kills the product feel.

---

## 14. What Makes Panels Feel Premium

If you only remember seven things, remember these:

1. **17px outer radius.** The single most distinctive shape decision.
2. **Three-layer shadow.** Inner highlight + ambient + contact.
3. **Tonal border hue.** Never a new hue — only new alphas of `rgba(147,147,147, X)`.
4. **0.07em tracking on uppercase chrome labels.** Tiny detail, huge effect.
5. **Serif headlines at weight 400 with −0.020em tracking.** Editorial authority.
6. **Muted traffic-light dots at 0.42 alpha.** Not vivid — expensive-looking.
7. **Inter at 10px / 8.5px / 7.5px with `tabular-nums`.** The "real software" ingredient.

Every "feels off" bug in a target app will trace back to violating one of these seven.

---

## 15. Core Primitives

All primitives live in `src-landing/components/panels/`. Copy the whole folder into the target app, wire up `src-landing/lib/design-tokens.ts` and `src-landing/styles/design-tokens.css`, and you have the full system.

### 15.1 `PanelShell`

**Purpose.** The outermost dark surface that wraps every Sovereign panel.

**Visual role.** Signature 17px rounded rectangle with `#070E1F` bg, `rgba(147,147,147,0.16)` border, and a 3-layer shadow. The single component from which the "serious software" feeling emerges.

**Anatomy.**

```
┌───────────────────────────────┐
│  children                     │
└───────────────────────────────┘
```

**Props.**

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `variant` | `"hero" \| "copilot" \| "report" \| "compact"` | `"copilot"` | Picks the shadow recipe |
| `aspect` | `string` | — | e.g. `"880 / 522"` for the hero |
| `radius` | `14 \| 17` | `17` | Only drop to 14 on mobile shells |

**Dependencies.** None (React only).

**Example.**

```tsx
<PanelShell variant="hero" aspect="880 / 522">
  <WindowChrome label="Sovereign · Intelligence Platform" status={{ tone: "live", text: "Live" }} />
  <AppSurface sidebar={<Sidebar />}>
    <DashboardPanel />
  </AppSurface>
</PanelShell>
```

**Never change.** The radius (17px), the bg (`#070E1F`), the border alpha (0.16), the 3-layer shadow structure.

**Source (extracted from the HeroDashboardPanel):**

```1129:1141:components/hero-dashboard-panel.tsx
  return (
    <div
      className="flex w-full flex-col overflow-hidden rounded-[17px] border border-[rgba(147,147,147,0.16)]"
      style={{
        aspectRatio: "880 / 522",
        background: "#070E1F",
        boxShadow: [
          "0 0 0 1px rgba(255,255,255,0.05)",
          "0 32px 80px -12px rgba(0,0,0,0.85)",
          "0 8px 32px -4px rgba(0,0,0,0.55)",
        ].join(", "),
      }}
    >
```

---

### 15.2 `WindowChrome`

**Purpose.** The macOS-style top bar that sits at the head of every panel.

**Visual role.** Traffic-light dots (red/amber/green at 0.42 alpha), uppercase chrome label, optional status pill on the right. Unifies the visual language across every panel.

**Anatomy.**

```
● ● ●   SOVEREIGN · COPILOT                    [● LIVE]
```

**Props.**

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `label` | `string` | — | e.g. `"Sovereign · Copilot"` |
| `status` | `{ tone: StatusTone; text: string }` | — | Right-side pill |
| `density` | `"desktop" \| "mobile"` | `"desktop"` | Controls dot size and padding |
| `right` | `ReactNode` | — | Replace the right slot entirely |

**Status tones.** `live` / `ready` / `draft` / `confidential` / `off` — each maps to one of the tonal accent pairs from the accent system.

**Never change.** The dot size (8px desktop / 9px mobile), the 0.42 alpha, the 0.07em tracking on the label, the `#0D1B32 → #0B1729` vertical gradient, the bottom-border alpha (0.10).

**Example.**

```tsx
<WindowChrome
  label="Sovereign · Copilot"
  status={{ tone: "live", text: "Live" }}
/>
```

**Source (reference implementation):**

```1142:1179:components/hero-dashboard-panel.tsx
      {/* ── Window chrome top bar ─────────────────────────────────────── */}
      <div
        className="flex shrink-0 items-center justify-between px-4 py-[9px]"
        style={{
          background: "linear-gradient(to bottom, #0D1B32, #0B1729)",
          borderBottom: "1px solid rgba(147,147,147,0.10)",
        }}
      >
        <div className="flex items-center gap-3">
          {/* Traffic-light dots */}
          <div className="flex gap-[5px]">
            {(["rgba(255,95,86,0.42)", "rgba(255,189,68,0.42)", "rgba(40,200,64,0.42)"] as const).map(
              (color, i) => (
                <div key={i} className="h-[8px] w-[8px] rounded-full" style={{ background: color }} />
              ),
            )}
          </div>
          <span
            className="text-[10px] font-medium uppercase tracking-[0.07em]"
            style={{ color: "rgba(255,255,255,0.28)" }}
          >
            Sovereign · Intelligence Platform
          </span>
        </div>
        {/* Status pill */}
        <div
          className="flex items-center gap-1.5 rounded-full px-2 py-[3px]"
          style={{
            background: "rgba(74,222,128,0.07)",
            border: "1px solid rgba(74,222,128,0.17)",
          }}
        >
          <div className="h-[5px] w-[5px] rounded-full bg-[#4ADE80]" />
          <span className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#4ADE80]">
            Live
          </span>
        </div>
      </div>
```

---

### 15.3 `PanelHeader`

**Purpose.** The section heading strip used inside every inner panel.

**Visual role.** A compact 1-line title + optional 2-line subtitle + optional right action slot. Sits directly under the `WindowChrome` or at the top of a central panel.

**Anatomy.**

```
┌──────────────────────────────────────────────────────┐
│  Title                                    (right)    │
│  Subtitle — small gray caption                       │
└──────────────────────────────────────────────────────┘
── rgba(147,147,147,0.14) bottom border
```

**Props.**

| Prop | Type | Notes |
| --- | --- | --- |
| `title` | `string` | Required |
| `subtitle` | `string` | Optional |
| `right` | `ReactNode` | Optional — action buttons or metadata |
| `thin` | `boolean` | Uses a thinner (0.10) bottom border |

**Never change.** Title size 10px / weight 600 / pure white. Subtitle 8px / `#777`. Padding `px-4 py-2.5`. Bottom border `rgba(147,147,147,0.14)`.

**Source (reference implementation):**

```459:472:components/hero-dashboard-panel.tsx
      {/* Panel header ───────────────────────────────────────────────────── */}
      <div className="border-b border-[rgba(147,147,147,0.14)] px-4 py-2.5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold text-white">Network Explorer</p>
            <p className="mt-[2px] text-[8px] leading-snug text-[#777]">
              Reveals entity relationships across your internal intelligence
            </p>
          </div>
          <p className="mt-0.5 text-[7.5px] text-[#555]">
            {NODES.length} entities · {EDGES.length} relationships
          </p>
        </div>
      </div>
```

---

### 15.4 `MetricCard`

**Purpose.** The KPI block at the top of every dashboard-style panel.

**Visual role.** Label + tinted icon well + large numerical value + single-line caption. Two densities: compact (18px value) for dense dashboards, large (22px value) for project-level headline KPIs.

**Anatomy (compact variant).**

```
┌──────────────────────────────────┐
│ PROJECTS              ┌──────┐  │
│                       │ icon │  │
│                       └──────┘  │
│ 6                                │
│ Active intelligence projects     │
└──────────────────────────────────┘
```

**Props.**

| Prop | Type | Notes |
| --- | --- | --- |
| `label` | `string` | Uppercase eyebrow |
| `value` | `string \| number` | Displayed big |
| `sub` | `string` | Caption |
| `icon` | `LucideIcon` | Compact variant only |
| `accent` | `string` | Hex color (drives icon well tint) |
| `size` | `"compact" \| "large"` | Default `"compact"` |
| `tintValue` | `boolean` | Colors the value with the accent |

**Never change.** The 18×18px icon well at radius 3px with bg `${color}22`. The uppercase 7.5px label / 0.07em tracking. The 18px or 22px value (no 20px middle size — it looks off).

**Source (compact variant reference):**

```783:810:components/hero-dashboard-panel.tsx
        {kpiCards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.label}
              className="cursor-pointer rounded-[5px] border border-[rgba(147,147,147,0.15)] px-3 py-2.5 transition-all duration-150 hover:border-[rgba(147,147,147,0.32)] hover:bg-white/[0.03]"
            >
              <div className="mb-[7px] flex items-center justify-between">
                <span className="text-[7.5px] font-semibold uppercase tracking-[0.07em] text-[#555]">
                  {card.label}
                </span>
                <div
                  className="flex h-[18px] w-[18px] items-center justify-center rounded-[3px] transition-all duration-150"
                  style={{ background: `${card.color}22` }}
                >
                  <Icon
                    className="shrink-0"
                    style={{ width: "9px", height: "9px", color: card.color }}
                    strokeWidth={1.5}
                  />
                </div>
              </div>
              <p className="text-[18px] font-bold leading-none text-white">{card.value}</p>
              <p className="mt-[5px] text-[7.5px] text-[#5a5a5a]">{card.sub}</p>
            </div>
          )
        })}
```

---

### 15.5 `SectionChip`

**Purpose.** The small pill used for filters, tags and type indicators.

**Visual role.** Two patterns:

1. **Neutral** — `rgba(147,147,147,0.18)` bg, no border.
2. **Accent** — tonal accent pair (bg 0.18 alpha, border 0.50 alpha, text 0.80 alpha). Supports on/off states.

**Props.**

| Prop | Type | Notes |
| --- | --- | --- |
| `tone` | `"neutral" \| "ghost" \| "accent"` | Default `"neutral"` |
| `color` | `string` | Required for `accent` tone |
| `dot` | `boolean` | Show leading 5px colored dot |
| `active` | `boolean` | For accent chips with on/off behavior |
| `onClick` | `() => void` | Makes the chip a button |

**Never change.** The tonal ratios. Dot size (5px). Padding (`px-[7px] py-[3.5px]`). Font size (7.5px).

**Source (reference implementation — filter pills):**

```489:513:components/hero-dashboard-panel.tsx
        <div className="flex items-center gap-[5px]">
          {ALL_FILTERS.map((f) => {
            const isOn  = activeFilters.includes(f)
            const color = NODE_COLOR[f]
            return (
              <button
                key={f}
                onClick={() => toggleFilter(f)}
                className="flex items-center gap-[4px] rounded-full px-[7px] py-[3.5px] transition-all duration-150"
                style={{
                  background: isOn ? `${color}18` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${isOn ? `${color}50` : "rgba(147,147,147,0.18)"}`,
                }}
              >
                <span
                  className="h-[5px] w-[5px] shrink-0 rounded-full"
                  style={{ background: isOn ? color : "rgba(147,147,147,0.40)" }}
                />
                <span
                  className="text-[7.5px] font-medium"
                  style={{ color: isOn ? `${color}CC` : "rgba(147,147,147,0.50)" }}
                >
                  {f}
                </span>
              </button>
            )
          })}
        </div>
```

---

### 15.6 `AppSurface`

**Purpose.** The two-column sidebar + central panel composition that simulates the full Sovereign application inside a `PanelShell`.

**Visual role.** Provides the "this is a real app" frame: 22%-wide sidebar with nav sections, and a central panel with its own 6px radius, 0.2-alpha border, and diagonal white sheen.

**Anatomy.**

```
┌───────────────────────────────────────────────────────┐
│        │                                              │
│  SIDE  │   ┌────────────────────────────────────┐    │
│  22%   │   │                                    │    │
│        │   │         central panel              │    │
│        │   │                                    │    │
│        │   └────────────────────────────────────┘    │
│        │                                              │
└───────────────────────────────────────────────────────┘
```

**Props.**

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `sidebar` | `ReactNode` | — | The whole sidebar column |
| `sidebarWidth` | `string` | `"22%"` | Don't go below 18% or above 26% |

**Never change.** The sidebar width (22%), the central-panel margin (`my-[1%] mr-[1%]`), the central-panel radius (6px, NOT 17px), the central-panel diagonal sheen gradient.

**Ships with.** `NavSection` — the sidebar primitive for rendering "Platform" / "System" nav groups, already calibrated for size and active/hover states.

---

### 15.7 `WindowPanel`

**Purpose.** The fastest way to compose a single-panel Sovereign surface. Bundles `PanelShell` + `WindowChrome` + optional `PanelHeader` + optional footer.

**Use when.** You need a panel that isn't the full app frame (Copilot, Reports, Output panels, Comms panels).

**Example.**

```tsx
<WindowPanel
  variant="copilot"
  chrome={{
    label: "Sovereign · Copilot",
    status: { tone: "live", text: "Live" },
  }}
  footer={<ChatInputBar />}
>
  <div className="flex-1 overflow-y-auto px-5 py-5">
    {messages}
  </div>
</WindowPanel>
```

---

### 15.8 `ListRow` + `IconWell`

**Purpose.** The "one entity per row" list pattern used for interviews, comms, recent activity, deals, sources.

**Visual role.** Card-shaped row with a leading tinted icon well, two-line body, and right-aligned meta. The workhorse of every list-style surface.

**Never change.** Row border `rgba(147,147,147,0.15)`, hover 0.30. Hover bg `white/[0.025]`. Icon well 22×22px (default). Title 9.5px / weight 600. Caption 8px / `#686868`.

---

### 15.9 `InsightCard`

**Purpose.** The numbered insight block used by the Copilot and Output panels.

**Visual role.** Subtle raised rectangle with monospace-ish index on the left, bright-white headline, and long-form gray paragraph.

**Never change.** Border `rgba(147,147,147,0.10)`, bg `rgba(255,255,255,0.024)`, radius 8px, padding `px-4 py-3.5`. Index at 9px / `rgba(255,255,255,0.17)`. Headline 12.5px / weight 500 / `white/85` / tracking `-0.012em`. Body 11px / leading 1.65 / `#757575`.

---

### 15.10 StatusPill (exported from WindowChrome)

**Purpose.** The small uppercase "Live / Ready / Confidential / Final Draft" indicator.

**Anatomy.**

```
[● LIVE]
```

**Tonal pairs.**

| Tone | bg | border | dot + text |
| --- | --- | --- | --- |
| `live` / `ready` | `rgba(74,222,128,0.07)` | `rgba(74,222,128,0.17)` | `#4ADE80` |
| `draft` | `rgba(251,191,36,0.07)` | `rgba(251,191,36,0.18)` | `#FBBF24` |
| `confidential` | `rgba(239,68,68,0.10)` | `rgba(239,68,68,0.22)` | `rgba(239,68,68,0.80)` |
| `off` | `rgba(255,255,255,0.03)` | `rgba(147,147,147,0.18)` | `rgba(147,147,147,0.40)` / white-meta |

---

## 16. Landing → Real App Mapping

The landing page is built around five visual surface "archetypes". Each one maps cleanly to a functional area of the real product.

| Landing panel | Landing file | Maps to in the real app | Primitives used |
| --- | --- | --- | --- |
| **Hero dashboard shell** (full app frame with sidebar) | `components/hero-dashboard-panel.tsx` | The **main app chrome** — sidebar nav + content outlet | `PanelShell` (hero) + `WindowChrome` + `AppSurface` + `NavSection` |
| **NetworkExplorerPanel** inside the hero | `components/hero-dashboard-panel.tsx` | The **Network Explorer / Relationships** view | `PanelHeader` + `SectionChip` (accent) + SVG graph + detail card (`--sv-surface-bg`) |
| **DashboardPanel** inside the hero | `components/hero-dashboard-panel.tsx` | The **Dashboard overview** route | `PanelHeader` + `MetricCard (compact)` + bar chart + donut + status list |
| **ProjectsPanel** inside the hero | `components/hero-dashboard-panel.tsx` | The **Projects grid** route | `PanelHeader` + card grid (custom), each card styled identically to `MetricCard` density |
| **InterviewsPanel** inside the hero | `components/hero-dashboard-panel.tsx` | The **Interviews index / transcripts list** | `PanelHeader` + `ListRow` + `IconWell` (indigo) |
| **SalesIntelligencePanel** (Copilot chat) | `components/sales-intelligence-panel.tsx` | The **Copilot / chat-results shell** (and any chat/search surface) | `WindowPanel (variant="copilot")` + `InsightCard` + chat bubbles |
| **InterviewDetailBackground** | `components/sales-intelligence-panel.tsx` | The **Interview detail** route (single transcript view) | `PanelShell` + `WindowChrome` + 2-column layout + `SectionChip` (neutral) for topic tags |
| **ActivateOutputPanel** (tabs of outputs) | `components/activate-output-panel.tsx` | **Output composer / publish surface** (newsletter, brief, memo, report) | `WindowPanel` + tabbed content, each tab rendered on `--sv-surface-bg` |
| **ActivateReportSurface** (long intelligence report) | `components/activate-report-surface.tsx` | The **Report viewer** (read-only long-document view) | `PanelShell (variant="report")` + `WindowChrome` + serif typography + section-eyebrows + `sovereign_negro.svg` mark |
| **ConnectCommsPanel** (email thread UI) | `components/connect-comms-panel.tsx` | **Account communications** surface (threaded replies, linked to account memory) | `PanelShell` + `WindowChrome` + message bubbles + account badges (`SectionChip` neutral) |
| **ConnectProjectDashboard** | `components/connect-project-dashboard.tsx` | The **Project detail / operating dashboard** route (revenue, deals, team, sources) | `PanelShell` + `MetricCard (large)` + progress bars + `ListRow` (deals, activity) + team avatars |
| **PrepareSellCopilot** (scrollable multi-section copilot) | `components/prepare-sell-copilot.tsx` | Advanced **Copilot conversation** surface — long sessions, multiple reasoning blocks | Same as SalesIntelligencePanel, scaled to multi-section |
| **PrepareSellGraph** (dense 22-node graph) | `components/prepare-sell-graph.tsx` | The **full-size Network Explorer** view | `PanelShell` + SVG canvas + `SectionChip` accent filters + floating detail card |
| **HeroDashboardPanelMobile** | `components/hero-dashboard-panel.tsx` | **Mobile app shell** — single-view, readable | `PanelShell (variant="compact", radius=14)` + `WindowChrome (density="mobile")` + `ListRow` |
| **Page transition wrapper** | `components/page-transition.tsx` | **Router outlet wrapper** in the real app | Framer Motion `AnimatePresence` + `motion.div` |

### Tokens → app surfaces

| App surface | Use this token |
| --- | --- |
| Sidebar background | `--sv-panel-bg` (with sheen optional) |
| Content outlet background | `--sv-panel-bg` |
| Card / nested detail | `--sv-surface-bg` |
| Graph / map background | `--sv-canvas-bg` |
| Table row border | `--sv-border-card` (hover `--sv-border-card-hover`) |
| Section divider | `--sv-border-divider-strong` (0.14) |
| Modal surface | `--sv-panel-bg`, `--sv-shadow-report` |
| Drawer surface | `--sv-panel-bg`, `--sv-shadow-compact` |
| KPI value color | `--sv-text-white` or accent hex |

---

## 17. Migration Checklist

Use this as an ordered porting plan. Each step is small and independently verifiable.

### Phase 1 — Foundations (day 1, non-negotiable)

- [ ] Copy `src-landing/styles/design-tokens.css` into the target app and import it once at the root.
- [ ] Copy `src-landing/lib/design-tokens.ts` into the target app.
- [ ] Load the three fonts: Inter, Playfair Display, Geist Mono. Use `next/font/google` equivalents or self-hosted files, but keep the weights (400, 500, 600, 700).
- [ ] Set the app's body background to `#070E1F` (or layer a page background under it) so panels don't read against pure `#000` or Tailwind `bg-slate-900`.
- [ ] Install peer dependencies in the target app: `framer-motion`, `lucide-react`, `next/image` (if Next) or equivalent `<img>` pattern.

### Phase 2 — Panel primitives (day 1–2)

- [ ] Copy `src-landing/components/panels/` into the target app.
- [ ] Verify the primitives render with correct shadows, radii and chrome. A minimal check:
  ```tsx
  <PanelShell variant="copilot">
    <WindowChrome label="Sovereign · Copilot" status={{ tone: "live", text: "Live" }} />
    <PanelHeader title="Hello" subtitle="World" />
    <div className="p-4 text-white/70 text-[12px]">Test body.</div>
  </PanelShell>
  ```
- [ ] Verify `MetricCard`, `SectionChip`, `ListRow`, `InsightCard` render at correct sizes.

### Phase 3 — App frame (day 2–3)

- [ ] Port the application shell using `PanelShell` + `AppSurface` + `NavSection`.
- [ ] Wire up the real sidebar items (Dashboard, Projects, Interviews, Copilot, Network Explorer, etc.) using `NavSection`.
- [ ] Apply `PageTransition` at the router level (wrap the outlet). This is critical for the "premium navigation" feel.

### Phase 4 — Primary views (parallelizable)

- [ ] **Dashboard view** — `PanelHeader` + `MetricCard (compact)` grid + chart area. Use `--sv-gradient-bar` for bar fills and the donut math already in `hero-dashboard-panel.tsx`.
- [ ] **Projects view** — card grid pattern from `ProjectsPanel`.
- [ ] **Interviews view** — `ListRow` + `IconWell` (indigo well for mic, blue for person). Use `--sv-accent-indigo-well-*` tokens.
- [ ] **Copilot view** — `WindowPanel (variant="copilot")` + chat bubbles + `InsightCard` stagger.
- [ ] **Network Explorer view** — SVG graph with `SectionChip (tone="accent")` filters.
- [ ] **Report viewer** — `PanelShell (variant="report")` + serif typography for titles + eyebrow labels.

### Phase 5 — Detail surfaces

- [ ] Interview detail (transcript layout).
- [ ] Communications thread (email bubbles + account badges).
- [ ] Project operating dashboard (`MetricCard (large)` + progress bars + team avatars + activity list).

### Phase 6 — Polish pass

- [ ] Validate all shadows by diffing panels against the landing page side-by-side at the same zoom level.
- [ ] Ensure all numerical data uses `tabular-nums` (`font-variant-numeric: tabular-nums` or Tailwind utility).
- [ ] Ensure no panel uses `rounded-lg` / `rounded-xl` — only our 17 / 14 / 8 / 6 / 5 / 4 / 3 values.
- [ ] Ensure no text is rendered at `opacity: 1` in body copy — body caps at 0.72.
- [ ] Verify Playfair Display is set at weight **400** everywhere (not bold).
- [ ] Run the dot-field texture at 0.055–0.075 opacity over empty sections where appropriate.

### Foundational vs Optional

| Layer | Status |
| --- | --- |
| Design tokens (colors, radii, shadows, type scale) | **Foundational** |
| `PanelShell`, `WindowChrome`, `PanelHeader` | **Foundational** |
| `MetricCard` (compact + large), `ListRow`, `SectionChip` | **Foundational** |
| `AppSurface` + `NavSection` | Foundational only if you need the sidebar layout |
| `InsightCard` | Foundational for Copilot / Output |
| Serif typography (Playfair Display) | Foundational for Reports / Newsletters |
| `PageTransition` | Optional enhancement (strongly recommended) |
| Dot-field background | Optional enhancement |
| Bottom-gradient section dissolves | Optional enhancement |
| 3D / canvas scenes (hero canvas, floating entities) | Skip for the app — landing-only |

### Breaking mistakes (things that destroy visual consistency)

1. **Using a different outer radius.** 17px is signature — 16 or 18 will *look* close but *feel* wrong.
2. **Swapping `#070E1F` for `#0A0A0A` or Tailwind `slate-950`.** Kills the blue-shift depth immediately.
3. **Replacing the 3-layer shadow with a single drop-shadow.** Panels go from "real software" to "flat sticker" in one stroke.
4. **Rounding up micro-spacing (`py-[9px]` → `py-2.5`).** Density collapses.
5. **Bumping up font sizes for readability.** It turns the panels into a marketing mockup.
6. **Using bold Playfair.** Kills the editorial register — report titles go from "quarterly publication" to "brochure".
7. **Introducing new accent hues.** The palette is the palette. If you need a new semantic meaning, map it to an existing accent (e.g. "pending approval" → amber).
8. **Setting body text at opacity 1.0.** Panels lose their calm register.

### Copy directly vs adapt

| Copy directly | Adapt |
| --- | --- |
| `design-tokens.ts` / `design-tokens.css` | `DashboardPanel` (data-specific content) |
| All files in `src-landing/components/panels/` | `NetworkExplorerPanel` (swap the nodes / edges for your data) |
| `components/page-transition.tsx` | `ProjectsPanel` / `InterviewsPanel` (swap placeholder data, keep structure) |
| The 3-layer shadow recipes | Chart implementations (your charts, our tokens) |
| Color / border / radius scales | Sidebar nav items (your routes, our layout) |

---

## Appendix A — Quick reference card

```
╔══════════════════════════════════════════════════════════════╗
║  SOVEREIGN PANEL SYSTEM — ESSENTIAL NUMBERS                  ║
╠══════════════════════════════════════════════════════════════╣
║  Outer panel:                                                ║
║    bg      #070E1F                                           ║
║    border  rgba(147,147,147,0.16)                            ║
║    radius  17px                                              ║
║    shadow  hero / copilot / report (3 layers each)           ║
║                                                              ║
║  Window chrome:                                              ║
║    gradient  #0D1B32 → #0B1729 (to bottom)                   ║
║    dots      8px (desktop) / 9px (mobile) @ 0.42 alpha       ║
║    label     10px uppercase, tracking 0.07em, white/28       ║
║                                                              ║
║  PanelHeader divider:                                        ║
║    rgba(147,147,147,0.14)   ← 0.10 when "thin"               ║
║                                                              ║
║  Card default:                                               ║
║    border   rgba(147,147,147,0.15)                           ║
║    hover    rgba(147,147,147,0.30) + bg white/[0.025]        ║
║    radius   5px                                              ║
║                                                              ║
║  Status pill tonal pair:                                     ║
║    bg     hex @ 0.07   border hex @ 0.17   fg hex            ║
║                                                              ║
║  Text ladder (5 most-used):                                  ║
║    white/88 strong  · white/72 body · white/55 secondary     ║
║    white/32 meta    · #5e6878 caption                        ║
║                                                              ║
║  Motion:                                                     ║
║    page     0.32s   cubic-bezier(0.22, 0.8, 0.36, 1)         ║
║    reveal   0.42s   cubic-bezier(0.25, 0.1, 0.25, 1)         ║
║    stagger  0.19s                                            ║
╚══════════════════════════════════════════════════════════════╝
```

---

## Appendix B — File map for this handoff

```
docs/
  ui-panel-system.md                       ← this document
src-landing/
  lib/
    design-tokens.ts                       ← TypeScript tokens
  styles/
    design-tokens.css                      ← CSS variables
  components/
    panels/
      index.ts                             ← barrel export
      PanelShell.tsx                       ← outer dark surface
      WindowChrome.tsx                     ← top bar + StatusPill
      PanelHeader.tsx                      ← title/subtitle/action
      AppSurface.tsx                       ← sidebar+content frame + NavSection
      WindowPanel.tsx                      ← convenience composition
      MetricCard.tsx                       ← KPI block (compact & large)
      SectionChip.tsx                      ← filter / tag pill
      ListRow.tsx                          ← list pattern + IconWell
      InsightCard.tsx                      ← numbered insight block
```

All paths are relative to the repo root of the landing. Copy the `src-landing/` directory into the target repo as-is (rename paths if the target uses `app/` instead of `src-landing/`).

---

*Last updated: April 2026 · Source of truth for the Sovereign panel system.*
