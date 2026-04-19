/**
 * Region → accent color mapping for project region pills.
 *
 * Goal: give the `Projects` index (and the project detail header) a small
 * amount of controlled visual differentiation by mapping each region in
 * `REGIONS` (see `src/lib/country-region-data.ts`) to a stable hex accent.
 *
 * Discipline:
 *   - One color per region — never per project. This is a *taxonomy*
 *     mapping, not random tinting.
 *   - The pill component (`SectionChip` with `tone="accent"`) consumes the
 *     hex via the standard tonal recipe: bg @ 18%, border @ 50%, text @ 80%.
 *     That keeps every chip restrained on the dark surface regardless of
 *     which color we pick here.
 *   - Hex values are pulled from the system's existing accent palette
 *     (Sovereign blue / interview indigo / entities amber) plus a small
 *     curated extension that stays in the same restrained, low-saturation
 *     family. No neon, no fully saturated primaries.
 *   - Africa subregions share a warm/earth side of the wheel; Asia keeps
 *     to indigo / violet / cyan; Europe stays in the cool blues; the
 *     Americas split between Sovereign blue (North) and a warmer salmon
 *     (LatAm); Oceania picks up turquoise. The grouping helps scanning —
 *     adjacent regions read as related families when seen side by side on
 *     the project grid.
 *
 * Adding a new region:
 *   1. Add it to `REGIONS` in `src/lib/country-region-data.ts`.
 *   2. Add a hex below.
 *   3. If you skip step 2, the helper falls back to a neutral gray and the
 *     pill still renders correctly.
 */

import { REGIONS } from "./country-region-data";

type Region = (typeof REGIONS)[number];

const REGION_COLORS: Record<Region, string> = {
  // Africa — warm/earth tones
  "West Africa": "#FBBF24",       // amber
  "East Africa": "#34D399",       // emerald
  "Southern Africa": "#FB7185",   // rose
  "North Africa": "#FB923C",      // orange
  "Central Africa": "#2DD4BF",    // teal

  // Americas
  "Latin America & Caribbean": "#F87171", // salmon / red
  "North America": "#5B9CF6",             // Sovereign blue (system primary)

  // Asia
  "Southeast Asia": "#A78BFA", // violet
  "South Asia": "#F472B6",     // pink
  "Central Asia": "#22D3EE",   // cyan
  "Middle East": "#EAB308",    // mustard yellow
  "East Asia": "#EF4444",      // red

  // Europe — cool family
  "Western Europe": "#818CF8",  // indigo (matches Interviews accent)
  "Central Europe": "#7DD3FC",  // sky
  "Northern Europe": "#94A3B8", // slate
  "Southern Europe": "#F97316", // burnt orange (mediterranean)
  "Eastern Europe": "#A3E635",  // lime

  // Other
  "Oceania": "#06B6D4",   // turquoise
  "Antarctica": "#CBD5E1", // pale slate (icy neutral)
};

const FALLBACK_REGION_COLOR = "#94A3B8"; // neutral slate

/**
 * Returns the accent hex for a given region, or the neutral fallback for
 * unknown / null inputs. Never returns null — pills always have a color.
 */
export function regionColor(region: string | null | undefined): string {
  if (!region) return FALLBACK_REGION_COLOR;
  return REGION_COLORS[region as Region] ?? FALLBACK_REGION_COLOR;
}
