/**
 * Sovereign Panel System — Design Tokens (TypeScript)
 *
 * Single source of truth for every color, radius, shadow, spacing value and
 * typographic measurement used by the panel system on the landing page.
 *
 * These values are extracted 1:1 from the production panels in this repo.
 * Do not round, simplify or "clean up" — every decimal is load-bearing.
 *
 * Companion files:
 *   - src/styles/design-tokens.css  (the same tokens as CSS variables)
 *   - docs/ui-panel-system.md       (how to use them)
 */

// ─── Color · Surfaces ─────────────────────────────────────────────────────────
// The whole system lives on two almost-identical near-black navy surfaces.
// Outer panel is `panel`. Inner nested cards use `surface` (one step darker).
// `canvas` is only for large data surfaces like the network graph.

export const colorSurface = {
  /** Outer panel background. Use on `PanelShell`, `AppSurface`, report panel. */
  panel: "#070E1F",
  /** Nested card / detail card / inline surface. Always inside a `panel`. */
  surface: "#080F1E",
  /** Very dark canvas reserved for SVG data surfaces (graphs, maps). */
  canvas: "#050C1A",
  /** Used only for window-chrome gradients (top and bottom stops). */
  chromeTop: "#0D1B32",
  chromeBottom: "#0B1729",
} as const

// ─── Color · Borders & Dividers ───────────────────────────────────────────────
// The panel system has exactly one hue for lines: a neutral gray at 147,147,147
// expressed at various alphas. Never introduce a new line color — change the
// alpha instead.

export const colorBorder = {
  /** Faintest divider. Internal separators that should barely read. */
  divider: "rgba(147,147,147,0.09)",
  /** Default horizontal divider inside a panel. */
  dividerMuted: "rgba(147,147,147,0.10)",
  /** Card borders in a list / grid. Default panel chrome divider. */
  dividerSoft: "rgba(147,147,147,0.13)",
  /** Slightly more present, for panel headers or stronger separations. */
  dividerStrong: "rgba(147,147,147,0.14)",
  /** Standard card border — the most common value. Memorize this one. */
  card: "rgba(147,147,147,0.15)",
  /** Outer panel border. */
  panel: "rgba(147,147,147,0.16)",
  /** Detail card / interactive surface border. */
  surfaceStrong: "rgba(147,147,147,0.18)",
  /** Button borders, raised controls. */
  control: "rgba(147,147,147,0.22)",
  /** Hover border for cards. */
  cardHover: "rgba(147,147,147,0.30)",
  /** Strong hover state. */
  controlHover: "rgba(147,147,147,0.32)",
  /** Highest strong line — rarely needed. */
  controlHoverStrong: "rgba(147,147,147,0.38)",
  /** Used for the thin white top-edge highlight on panels. */
  highlight: "rgba(255,255,255,0.025)",
  highlightStrong: "rgba(255,255,255,0.05)",
} as const

// ─── Color · Text ─────────────────────────────────────────────────────────────
// Text is almost always `rgba(255,255,255, X)`. There is a parallel gray scale
// (#777, #5e6878, #4a5060, ...) used mostly for tertiary labels, captions and
// small-print metadata. Both are included here, exact.

export const colorText = {
  /** Pure white — reserve for KPI values, panel titles, top-level headings. */
  white: "#FFFFFF",

  // White / opacity scale — primary system
  /** Strongest body text (headlines in cards). */
  primary: "rgba(255,255,255,0.88)",
  /** Alternative headline alpha used in serif titles. */
  primaryAlt: "rgba(255,255,255,0.85)",
  /** Standard emphasized label / nav active state. */
  strong: "rgba(255,255,255,0.75)",
  /** Card body text. */
  body: "rgba(255,255,255,0.72)",
  /** Mid weight — button labels, nav inactive. */
  medium: "rgba(255,255,255,0.70)",
  /** Secondary rows in tables, chip labels. */
  secondary: "rgba(255,255,255,0.65)",
  /** Extended paragraphs (report implications, executive summaries). */
  paragraph: "rgba(255,255,255,0.62)",
  /** Softer card body. */
  soft: "rgba(255,255,255,0.58)",
  /** List items / secondary descriptions. */
  subtle: "rgba(255,255,255,0.55)",
  /** Muted body. */
  muted: "rgba(255,255,255,0.52)",
  /** Dimmed body text. */
  dim: "rgba(255,255,255,0.45)",
  /** Placeholder input text. */
  placeholder: "rgba(255,255,255,0.42)",
  /** Metadata, uppercase eyebrow labels. */
  meta: "rgba(255,255,255,0.32)",
  /** Eyebrow labels, section micro-headings. */
  eyebrow: "rgba(255,255,255,0.28)",
  /** Ghost labels — report document meta. */
  ghost: "rgba(255,255,255,0.22)",
  /** Appendix numerals, source-reference indexes. */
  faint: "rgba(255,255,255,0.18)",
  /** Barely-visible index numbers in insight cards. */
  ghostFaint: "rgba(255,255,255,0.17)",
  /** Ultra-subtle, almost decorative. */
  trace: "rgba(255,255,255,0.10)",

  // Neutral gray scale — for captions & tertiary data
  /** Subtitles under panel headers ("Cross-project interview index..."). */
  caption: "#777",
  /** Tertiary metadata. */
  captionSoft: "#5e6878",
  /** Weakest labels in tertiary detail. */
  captionWeak: "#4a5060",
  /** Eyebrow labels on charts. */
  chartEyebrow: "#555",
  /** Raw date / meta strings. */
  mono: "#666",
  /** Even more faded data. */
  monoDim: "#5a5a5a",
  /** Axis tick labels. */
  axis: "#444",
  /** Clock / duration icon color. */
  trailing: "#4a4a4a",
  /** Extra-faint heading dividers. */
  divider: "#505a66",
} as const

// ─── Color · Accents ──────────────────────────────────────────────────────────
// The entire system uses a fixed accent palette. When adding a new status,
// pick from this set first. Do NOT introduce new hues.

export const colorAccent = {
  blue: "#5B9CF6",        // Person / primary informational accent
  green: "#34D399",       // Company / positive state
  greenBright: "#4ADE80", // Live / Ready / Success status (brighter variant)
  violet: "#A78BFA",      // Government / institutional
  amber: "#FBBF24",       // Event / pending / Final Draft
  red: "#F87171",         // Warning / destructive (muted)
  redBright: "#FB7185",   // Warning (brighter)
  orange: "#FB923C",      // Entities / auxiliary
  cyan: "#7DD3FC",        // Organization / documents
  cyanBright: "#38BDF8",  // Topic accent
  indigo: "#818CF8",      // Additional topic accent
  blueSoft: "#60A5FA",    // Processing / passive accent
  pink: "#F472B6",        // Initiatives
  slate: "#94A3B8",       // Muted auxiliary accent
} as const

/**
 * Bar-chart / KPI gradient. Deep blue → steel blue.
 * Used on horizontal bar tracks to signal data without introducing a new hue.
 */
export const gradientBar = "linear-gradient(90deg, #3A5BA0 0%, #4E78CF 100%)"

/**
 * Window-chrome gradient. Top→bottom. Apply on the top bar of every panel.
 */
export const gradientChrome =
  `linear-gradient(to bottom, ${colorSurface.chromeTop}, ${colorSurface.chromeBottom})`

/**
 * Inner-panel diagonal sheen. Adds depth to the "central panel" inside
 * AppSurface (sidebar + content) compositions.
 */
export const gradientSheen =
  "linear-gradient(135deg, rgba(255,255,255,0.012) 0%, #070E1F 28%)"

// ─── Accent backgrounds / borders (tonal) ─────────────────────────────────────
// When an accent is used as a fill for pills, badges or node wells, its
// background is the same hex at alpha ~0.07–0.13 and its border at alpha
// ~0.17–0.28. Exact pairs below.

export const accentTonal = {
  greenBright: {
    bg:     "rgba(74,222,128,0.07)",
    border: "rgba(74,222,128,0.17)",
    fg:     colorAccent.greenBright,
  },
  blue: {
    bg:     "rgba(91,156,246,0.05)",   // panel callout
    bgTag:  "rgba(91,156,246,0.09)",   // user chat bubble
    border: "rgba(91,156,246,0.12)",
    fg:     colorAccent.blue,
  },
  amber: {
    bg:     "rgba(251,191,36,0.07)",
    border: "rgba(251,191,36,0.18)",
    fg:     colorAccent.amber,
  },
  red: {
    bg:     "rgba(239,68,68,0.10)",
    border: "rgba(239,68,68,0.22)",
    fg:     "rgba(239,68,68,0.80)",
  },
  indigoWell: {
    /** Round icon well used for the Mic icon on interview rows. */
    bg:     "rgba(78,92,210,0.13)",
    border: "rgba(78,92,210,0.28)",
    fg:     "#7c8fd4",
  },
} as const

// ─── Radius ───────────────────────────────────────────────────────────────────
// Panels use an unusual "non-Tailwind" radius set. These exact values are what
// give the system its tight, technical feel. Do not substitute Tailwind
// `rounded-lg` / `rounded-xl` — they are too round.

export const radius = {
  xs:    "3px",   // icon-well inner squares
  sm:    "4px",   // nav items, small buttons
  md:    "5px",   // cards inside grids (default)
  lg:    "6px",   // central-panel inside AppSurface; detail cards
  xl:    "7px",   // send button
  "2xl": "8px",   // insight cards in Copilot
  "3xl": "9px",   // input bar
  "4xl": "10px",  // chat bubbles
  "5xl": "14px",  // mobile panel shells
  panel: "17px",  // the signature outer panel radius — never change
} as const

// ─── Shadows ──────────────────────────────────────────────────────────────────
// Shadows are always composed of three layers:
//   1. A 1px white inset highlight to lift the panel off the page.
//   2. A very soft, wide ambient shadow.
//   3. A tighter, closer shadow to ground the panel.
// Do NOT use a single `shadow-2xl`. The layered composition is what makes
// these panels feel like real software.

export const shadow = {
  /** HeroDashboardPanel — the flagship shell. */
  hero: [
    "0 0 0 1px rgba(255,255,255,0.05)",
    "0 32px 80px -12px rgba(0,0,0,0.85)",
    "0 8px 32px -4px rgba(0,0,0,0.55)",
  ].join(", "),

  /** Copilot / Sales Intelligence — slightly softer top highlight. */
  copilot: [
    "0 0 0 1px rgba(255,255,255,0.025)",
    "0 36px 80px -16px rgba(0,0,0,0.75)",
    "0 8px 24px -6px rgba(0,0,0,0.55)",
  ].join(", "),

  /** Intelligence Report — deepest ambient. Long-document feel. */
  report: [
    "0 0 0 1px rgba(255,255,255,0.025)",
    "0 48px 120px -24px rgba(0,0,0,0.85)",
    "0 8px 24px -6px rgba(0,0,0,0.55)",
  ].join(", "),

  /** Mobile / compact shells. */
  compact: [
    "0 0 0 1px rgba(255,255,255,0.025)",
    "0 24px 60px -12px rgba(0,0,0,0.75)",
    "0 6px 20px -4px rgba(0,0,0,0.5)",
  ].join(", "),
} as const

// ─── Typography ───────────────────────────────────────────────────────────────
// The panels use Inter for UI text and Playfair Display as the serif voice for
// report / newsletter / brief headlines.
//
// The size scale is deliberately small and in 0.5-px increments. Resist the
// urge to "round" — the system's density comes from this granularity.

export const fontFamily = {
  sans:  "'Inter', 'Inter Fallback', system-ui, sans-serif",
  serif: "'Playfair Display', 'Playfair Display Fallback', Georgia, serif",
  mono:  "'Geist Mono', 'Geist Mono Fallback', monospace",
} as const

/** Font-size scale used inside panels. Values in px as rendered. */
export const fontSize = {
  "2xs":   "6.5px",   // axis ticks, ultra-fine labels
  "xs":    "7px",     // chart micro-labels
  "sm":    "7.5px",   // eyebrows, node labels on graph
  "base":  "8px",     // chip labels, control buttons
  "md":    "8.5px",   // stat sub-labels, chart headers
  "lg":    "9px",     // report section meta
  "xl":    "9.5px",   // interview rows, section eyebrows
  "2xl":   "10px",    // panel titles inside chrome
  "3xl":   "10.5px",  // chrome label; panel-header subtitle (mobile)
  "4xl":   "11px",    // copilot response body
  "5xl":   "11.5px",  // insight body paragraphs
  "6xl":   "12px",    // card body text
  "7xl":   "12.5px",  // chat bubble text
  "8xl":   "13px",    // report meta / kpi sub
  "9xl":   "15px",    // newsletter / brief headlines (serif)
  "10xl":  "16px",    // large serif report sections
  "11xl":  "18px",    // KPI value
  "12xl":  "22px",    // XL metrics (dashboard KPI value)
  "13xl":  "2.4rem",  // report title (desktop)
} as const

/** Weights actually used by the panels. */
export const fontWeight = {
  normal:    400,   // serif report titles explicitly at 400
  medium:    500,
  semibold:  600,
  bold:      700,
} as const

/** Letter-spacing used by the panels. Matched to each typographic role. */
export const letterSpacing = {
  /** Body copy — a soft optical compression. */
  bodyTight:  "-0.005em",
  /** Card body / chat text. */
  body:       "-0.010em",
  /** Slightly tighter card body. */
  bodyFirm:   "-0.011em",
  /** Insight / headline body. */
  headlineXs: "-0.012em",
  /** Card headlines. */
  headline:   "-0.014em",
  /** Panel titles / h2 in cards. */
  headlineSm: "-0.015em",
  /** Large serif headlines (report title). */
  headlineLg: "-0.020em",
  /** Report hero title. */
  headlineXl: "-0.028em",

  /** Eyebrow / uppercase micro-labels (smaller end). */
  uppercaseTight: "0.04em",
  /** Panel chrome label ("Sovereign · Copilot"). */
  uppercaseChrome: "0.07em",
  /** Section eyebrow ("Executive Summary", "Key Signals"). */
  uppercaseEyebrow: "0.08em",
  /** Status-pill label ("Live", "Ready"). */
  uppercaseStatus: "0.09em",
  /** Newsletter-style vol. labels. */
  uppercaseVol: "0.10em",
  /** Report section uppercase. */
  uppercaseReport: "0.12em",
  /** Strongest uppercase tracking (hero-level labels). */
  uppercaseHero: "0.14em",
} as const

/** Line-heights used across the panel system. */
export const lineHeight = {
  none:     "1",           // KPI values
  tight:    "1.08",        // serif report title
  snug:     "1.15",        // default snug
  card:     "1.5",         // small card body
  prose:    "1.65",        // insight body, interview transcript
  longform: "1.72",        // executive summary body
  report:   "1.82",        // report paragraph body
} as const

// ─── Spacing / Sizing ─────────────────────────────────────────────────────────
// Panels follow Tailwind's 4-pt spacing system but with some micro-values
// (2.5, 3.5, 7, 9, 11) that keep compositions tight. The key patterns below
// are the ones that appear most often in real layouts.

export const spacing = {
  /** Panel chrome vertical padding (`py-[9px]` / `py-[11px]`). */
  chromeY:       "9px",
  chromeYLarge: "11px",
  /** Standard chrome horizontal padding. */
  chromeX:      "16px",

  /** Inner card padding. */
  cardPad:      "10px 14px",       // px-3.5 py-2.5
  cardPadLg:    "14px 16px",       // lists
  kpiPad:       "10px 12px",       // KPI card compact
  /** Central-panel standard padding. */
  panelPadX:    "12px",            // px-3
  panelPadY:    "7px",             // py-[7px]

  /** Insight-card padding (copilot / output panels). */
  insightPad:   "14px 16px",

  /** Report document padding (responsive). */
  reportPadX:       "32px",         // md:px-14 → override to 56px on md
  reportPadTop:     "40px",
} as const

// ─── Opacity scale ────────────────────────────────────────────────────────────
// Panels layer elements (background surfaces, dim states, hover reveals) using
// a small opacity scale. Prefer reusing these values; do not introduce fresh
// opacity values casually — they multiply visual noise.

export const opacity = {
  hiddenish:   0.05,
  watermark:   0.11,
  passive:     0.18,
  dim:         0.28,
  active:      0.45,
  default:     0.72,
  focused:     0.85,
  full:        1,
} as const

// ─── Motion / Transitions ─────────────────────────────────────────────────────
// All motion in the system falls in the 150–420ms range with a gentle, slightly
// overshoot-free curve. No bouncy springs.

export const motion = {
  /** Hover color transitions on nav / cards. */
  durationInstant: 0.15,    // 150ms
  /** Cross-fades between UI states (e.g. copilot phases). */
  durationQuick: 0.18,      // 180ms
  /** Opacity transitions on graph nodes / donut slices. */
  durationShort: 0.2,       // 200ms
  /** Fade-ins for new content blocks. */
  durationMedium: 0.25,     // 250ms
  /** Page transitions (router-level fade+translate). */
  durationPage: 0.32,       // 320ms
  /** Insight cards staggered reveal. */
  durationReveal: 0.42,     // 420ms

  /** Stagger between consecutive reveals. */
  staggerInsight: 0.19,     // 190ms between insight cards

  /** Default ease. Matches the landing page's page transition. */
  easePremium: [0.22, 0.8, 0.36, 1] as const,
  /** Insight reveal curve. */
  easeReveal: [0.25, 0.1, 0.25, 1] as const,
} as const

// ─── Z-Index ──────────────────────────────────────────────────────────────────
// Keep panel z-indexes bounded. The landing uses only 0 / 20 / 30 on composed
// panels. The rest is defaulted.

export const zIndex = {
  background: 0,
  content:    10,
  foreground: 20,
  overlay:    30,
  nav:        40,    // fixed header / mobile drawer
  modal:      50,
} as const

// ─── Named exports (convenience) ──────────────────────────────────────────────

export const tokens = {
  colorSurface,
  colorBorder,
  colorText,
  colorAccent,
  accentTonal,
  gradientBar,
  gradientChrome,
  gradientSheen,
  radius,
  shadow,
  fontFamily,
  fontSize,
  fontWeight,
  letterSpacing,
  lineHeight,
  spacing,
  opacity,
  motion,
  zIndex,
} as const

export type DesignTokens = typeof tokens
