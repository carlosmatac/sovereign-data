/**
 * Builds src/lib/country-region-data.ts from world-countries (UN M.49 subregions)
 * merged with scripts/country-region-legacy.json (Sovereign labels + regions; legacy wins on conflict).
 *
 * Run: node scripts/generate-country-region-data.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import countries from "world-countries";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const legacyPath = path.join(root, "scripts/country-region-legacy.json");
const outPath = path.join(root, "src/lib/country-region-data.ts");

/** UN subregion → Sovereign product region (extends original Global South buckets). */
const SUBREGION_TO_REGION = {
  "Western Africa": "West Africa",
  "Eastern Africa": "East Africa",
  "Middle Africa": "Central Africa",
  "Northern Africa": "North Africa",
  "Southern Africa": "Southern Africa",
  "South America": "Latin America & Caribbean",
  "Central America": "Latin America & Caribbean",
  "Caribbean": "Latin America & Caribbean",
  "North America": "North America",
  "South-Eastern Asia": "Southeast Asia",
  "Southern Asia": "South Asia",
  "Central Asia": "Central Asia",
  "Western Asia": "Middle East",
  "Eastern Asia": "East Asia",
  "Australia and New Zealand": "Oceania",
  Melanesia: "Oceania",
  Micronesia: "Oceania",
  Polynesia: "Oceania",
  "Western Europe": "Western Europe",
  "Eastern Europe": "Eastern Europe",
  "Southern Europe": "Southern Europe",
  "Northern Europe": "Northern Europe",
  "Central Europe": "Central Europe",
  /** Balkans / UN “Southern Europe” neighbors — grouped with Southern Europe for UX simplicity */
  "Southeast Europe": "Southern Europe",
};

/** ISO alpha-2 → preferred English label (backward compatibility + clarity). */
const LABEL_OVERRIDE = {
  CD: "Democratic Republic of the Congo",
  CI: "Côte d'Ivoire",
  GM: "The Gambia",
};

/** Optional region fixes where UN subregion is a poor fit for this product. */
const REGION_OVERRIDE_BY_CCA2 = {
  /** EU member; UN lists Western Asia */
  CY: "Southern Europe",
};

function regionFor(c) {
  const o = REGION_OVERRIDE_BY_CCA2[c.cca2];
  if (o) return o;
  if (c.region === "Antarctic") return "Antarctica";
  const sub = c.subregion;
  if (!sub) {
    throw new Error(`No subregion for ${c.cca2} ${c.name.common}`);
  }
  const r = SUBREGION_TO_REGION[sub];
  if (!r) {
    throw new Error(`Unmapped subregion "${sub}" (${c.cca2} ${c.name.common})`);
  }
  return r;
}

function main() {
  const legacy = JSON.parse(fs.readFileSync(legacyPath, "utf8"));
  const merged = {};

  for (const c of countries) {
    const label = LABEL_OVERRIDE[c.cca2] ?? c.name.common;
    merged[label] = regionFor(c);
  }

  for (const [name, region] of Object.entries(legacy)) {
    merged[name] = region;
  }

  const keys = Object.keys(merged).sort((a, b) => a.localeCompare(b, "en"));
  const lines = keys.map(
    (k) => `  ${JSON.stringify(k)}: ${JSON.stringify(merged[k])},`
  );

  const usedRegions = [...new Set(Object.values(merged))];
  const REGION_ORDER = [
    "West Africa",
    "East Africa",
    "Southern Africa",
    "North Africa",
    "Central Africa",
    "Latin America & Caribbean",
    "North America",
    "Southeast Asia",
    "South Asia",
    "Central Asia",
    "Middle East",
    "East Asia",
    "Western Europe",
    "Central Europe",
    "Northern Europe",
    "Southern Europe",
    "Eastern Europe",
    "Oceania",
    "Antarctica",
  ];
  const rest = usedRegions
    .filter((r) => !REGION_ORDER.includes(r))
    .sort((a, b) => a.localeCompare(b, "en"));
  const orderedRegions = [...REGION_ORDER.filter((r) => usedRegions.includes(r)), ...rest];

  const regionsLiteral = orderedRegions.map((r) => `  ${JSON.stringify(r)},`).join("\n");

  const header = `/**
 * Project country list and country → region mapping (Create / Edit Project).
 *
 * Source of truth: scripts/generate-country-region-data.mjs plus world-countries (UN M.49-style
 * subregions) and scripts/country-region-legacy.json (overlay; wins on same country name).
 *
 * Taxonomy: original Sovereign regions are preserved; added Europe sub-buckets, North America,
 * East Asia, Oceania, Antarctica.
 *
 * Regenerate: npm run generate:countries
 */
`;

  const body = `${header}export const REGIONS = [\n${regionsLiteral}\n] as const;

export const COUNTRIES: Record<string, string> = {
${lines.join("\n")}
};

export const COUNTRY_LIST = Object.keys(COUNTRIES).sort((a, b) =>
  a.localeCompare(b, "en")
);
`;

  fs.writeFileSync(outPath, body, "utf8");
  console.log(`Wrote ${keys.length} countries → ${outPath}`);
}

main();
