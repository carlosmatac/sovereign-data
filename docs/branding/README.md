# Sovereign Data — Brand & Design System

> **Status:** Living document. Update when tokens, fonts, or visual language evolve.  
> **Audience:** Designers, frontend engineers, AI agents generating UI code.

---

## 1. Brand Essence

| Dimension | Principle |
|-----------|-----------|
| **Positioning** | Tier-1 Enterprise Intelligence — Bloomberg-grade, not consumer SaaS |
| **Personality** | Sharp · Authoritative · Precise · Discreet |
| **Target users** | CEOs, Investment Directors, Frontier Market Analysts |
| **Visual register** | Dark-mode Fintech — data-dense, no decoration for decoration's sake |

---

## 2. Color System

All colors use **OKLCH** for perceptual uniformity. The palette is anchored to a deep navy-slate (`264°` hue) for brand identity, with functional accent hues layered on top.

### 2.1 Background Stack (darkest → lightest)

| Token | OKLCH | Role |
|-------|-------|------|
| `--sidebar` | `oklch(0.168 0.036 264)` | Navigation rail — darkest |
| `--background` | `oklch(0.195 0.026 264)` | Page canvas |
| `--muted` | `oklch(0.285 0.026 264)` | Hover states, subtle fills |
| `--card` | `oklch(0.245 0.031 264)` | Elevated card surface |
| `--popover` | `oklch(0.255 0.03 264)` | Dropdowns, tooltips |

### 2.2 Foreground / Text

| Token | OKLCH | Use |
|-------|-------|-----|
| `--foreground` | `oklch(0.93 0.011 264)` | Primary body text |
| `--muted-foreground` | `oklch(0.68 0.022 264)` | Secondary / metadata |
| `--primary` | `oklch(0.92 0.014 264)` | CTAs, active states (near-white) |

### 2.3 Chart Palette

Used in data visualisations (Recharts). Always apply in order, cycling if needed.

| Index | OKLCH | Approx Hex |
|-------|-------|------------|
| 1 | `oklch(0.70 0.16 264)` | Cool blue-violet |
| 2 | `oklch(0.75 0.14 200)` | Cyan-teal |
| 3 | `oklch(0.68 0.12 230)` | Sky blue |
| 4 | `oklch(0.62 0.18 270)` | Deeper violet |
| 5 | `oklch(0.78 0.13 220)` | Light teal |
| 6 | `oklch(0.55 0.15 250)` | Muted indigo |
| 7 | `oklch(0.72 0.10 195)` | Pale cyan |
| 8 | `oklch(0.65 0.14 280)` | Periwinkle |

> **Never** use high-saturation red/green/yellow as primary chart colors — they read as alerts, not data.

### 2.4 Status / Semantic Colors

| State | Color | Token |
|-------|-------|-------|
| Success / Completed | Emerald | `oklch(0.70 0.17 155)` |
| Processing / Pending | Blue | `oklch(0.60 0.18 250)` |
| Error / Failed | Rose-Red | `oklch(0.63 0.21 25)` |
| Warning | Amber | `oklch(0.78 0.16 75)` |

---

## 3. Typography

### 3.1 Font Stack

| Role | Family | CSS Variable |
|------|--------|-------------|
| **UI sans-serif** | Inter | `--font-inter` → `--font-sans` |
| **Monospace / code** | Geist Mono | `--font-geist-mono` → `--font-mono` |

**Why Inter?**  
Inter was designed specifically for screen UI. It has excellent hinting at small sizes, neutral character, and supports OpenType features (tabular figures, ligatures) critical for data-heavy interfaces. It is the standard in Fintech and Enterprise SaaS (Linear, Stripe, Vercel, Notion).

### 3.2 Type Scale

| Element | Size | Weight | Letter-spacing | Notes |
|---------|------|--------|---------------|-------|
| Page title `h1` | `text-2xl` (24px) | 600 | `-0.025em` | Dashboard headers |
| Section title | `text-sm` (14px) | 600 | `-0.015em` | Card titles |
| Eyebrow label | `text-[11px]` | 500 | `+0.08–0.12em` | Uppercase category labels |
| Body | `text-sm` (14px) | 400 | `-0.011em` | Default prose |
| Metadata / secondary | `text-xs` (12px) | 400 | `0` | Timestamps, captions |
| KPI value | `text-[28px]` | 600 | `-0.025em` | Stats cards |
| Micro label | `text-[10px]` | 500 | `+0.05em` | Badges, status chips |

### 3.3 Key Rules

1. **Negative tracking for large type** — headings and KPI values always use `tracking-tight` or tighter. Large text with normal tracking feels amateur.
2. **Uppercase eyebrows** — category labels above headings (e.g., "Intelligence Platform") use `uppercase tracking-[0.10em]` in `muted-foreground/60`.
3. **Tabular numbers** — all numeric data must use `font-variant-numeric: tabular-nums` (class `tabular-nums`) to prevent layout shift.
4. **No bold in body copy** — use `font-medium` (500) for emphasis; reserve `font-semibold` (600) for UI labels. `font-bold` (700) is reserved for KPI numbers only.

---

## 4. Spacing & Layout

| Concept | Value | Notes |
|---------|-------|-------|
| Page padding | `p-6 lg:p-8` | Slightly more generous on large screens |
| Card internal | `px-6 py-5` | Standard Shadcn card defaults |
| Section spacing | `mb-8` | Between major page sections |
| Grid gap | `gap-4` (KPIs) / `gap-6` (content) | Tighter for stats, wider for content |
| KPI grid | `sm:grid-cols-3` | 3 metrics — Projects, Interviews, Entities |
| Content grid | `lg:grid-cols-3` | 2/3 main + 1/3 sidebar |
| Charts grid | `lg:grid-cols-2` | Equal-split analytics row |

---

## 5. Component Conventions

### 5.1 Cards

- Background: `--card` (slightly lifted off canvas)
- Border: `--border` (white/9–11% opacity)
- No drop shadows — depth comes from layered backgrounds, not shadows
- Hover state (interactive cards): `hover:border-primary/30 hover:bg-card/80`

### 5.2 Buttons

- **Primary** (CTA): filled, uses `--primary` (near-white) with `--primary-foreground` text
- **Outline**: ghost-style, `h-9` height, `gap-2`, icon at `h-3.5 w-3.5 text-muted-foreground`
- No border-radius extremes — use Tailwind `rounded-md` (default radius)

### 5.3 Data Visualisation

- **Library**: Recharts (via custom client components in `src/components/dashboard/`)
- **Preferred chart types**:
  - Rankings / comparisons: horizontal `BarChart` (layout="vertical")
  - Proportions / distributions: `PieChart` donut (`innerRadius="58%" outerRadius="82%"`)
  - Trend over time: `AreaChart` with subtle gradient fill
- **Stroke width**: `0` on pie/bar fills (clean edges)
- **Tooltips**: custom, styled to match dark surface (`bg-[oklch(0.18_0.03_264)]`, `border-white/10`)
- **Grid lines**: hidden or extremely faint (`opacity-10`)
- **Axis labels**: `text-xs`, `fill: muted-foreground`
- **Padding between bars**: `barCategoryGap="30%"` — breathing room

### 5.4 Navigation (Sidebar)

- Font size: Shadcn default (`text-sm`)
- Group labels: `text-[11px] uppercase tracking-widest text-muted-foreground/50`
- Logo (expanded): `max-w-[148px]`, `opacity-90`
- Logo (collapsed): `size-7`, `opacity-90`
- Active item: `bg-sidebar-accent` with full-width indicator

---

## 6. Iconography

- **Library**: Lucide React (already installed)
- **Preferred sizes**: `h-3.5 w-3.5` inside buttons/labels, `h-4 w-4` standalone, `h-5 w-5` featured
- **Color**: inherit from parent or `text-muted-foreground` for decorative icons
- Never use filled icons where outline icons are available — they feel heavier

---

## 7. Dark Mode Policy

The app is **permanently dark**. There is no light mode. The `dark` class CSS block in `globals.css` exists for compatibility with `next-themes` but mirrors the `:root` block exactly.

Do **not** add `dark:` variants unless implementing a genuine dual-mode feature.

---

## 8. What NOT to Do

| Anti-pattern | Why |
|-------------|-----|
| Rounded `xl`/`2xl` cards | Feels consumer/mobile — use `rounded-md` (8px) |
| Gradient hero text | Gimmicky; conflicts with data-dense aesthetic |
| Emoji in UI labels | Use icons (Lucide) |
| High-saturation accent colors | Only as semantic states (errors, warnings) |
| `font-bold` in body/card text | Visually heavy; use `font-semibold` max |
| `w-full` progress bars for data | Use proper charting library (Recharts) |
| "Copilot" naming | Use "Copilot" — more enterprise-grade |
| "Knowledge Chunks" KPI | Internal developer metric; not user-facing |

---

## 9. File Locations

| Asset | Path |
|-------|------|
| Global CSS / tokens | `src/app/globals.css` |
| Font config | `src/app/layout.tsx` |
| Sidebar | `src/components/dashboard/app-sidebar.tsx` |
| Dashboard page | `src/app/(dashboard)/dashboard/page.tsx` |
| Horizontal bar chart | `src/components/dashboard/interviews-by-project-chart.tsx` |
| Donut chart | `src/components/dashboard/topic-distribution-chart.tsx` |
| Logo (horizontal) | `public/sovereign_log_apaisado.svg` |
| Logo (icon) | `public/sovereign_logo.svg` |
| Logo (favicon bg) | `public/sovereign_log_fondo.svg` |
