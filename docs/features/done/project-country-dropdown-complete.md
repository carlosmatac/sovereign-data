---
title: "Project country dropdown — full world list"
status: on-going
owner: team
priority: medium
last_updated: 2026-03-24
related_architecture: []
related_infrastructure: []
---

# Project country dropdown — full world list

## Problem

The Create/Edit Project country combobox only listed a curated Global South subset (~117 countries), so users could not pick many valid countries.

## Approach

- **Source of truth (generated):** `src/lib/country-region-data.ts`, produced by `scripts/generate-country-region-data.mjs` from the `world-countries` package (UN M.49-style `subregion`) plus `scripts/country-region-legacy.json`.
- **Legacy overlay:** JSON preserves every previous `country` string and its **exact** region assignment so existing rows in `projects.country` stay consistent when re-selected in the UI.
- **Taxonomy:** All original Sovereign buckets (West/East/Central/North/Southern Africa, Latin America & Caribbean, South/Southeast/Central Asia, Middle East) are unchanged. **Added** for the rest of the world: `East Asia`, `North America`, `Oceania`, `Western Europe`, `Central Europe`, `Northern Europe`, `Southern Europe`, `Eastern Europe`, `Antarctica`. UN “Southeast Europe” maps to **Southern Europe** to avoid an extra menu label.
- **Label overrides (ISO → UI):** `CD` → “Democratic Republic of the Congo”, `CI` → “Côte d'Ivoire”, `GM` → “The Gambia” (no duplicate “Ivory Coast” row).
- **Product override:** `CY` (Cyprus) → `Southern Europe` (UN lists Western Asia).

## Key files

| File | Role |
|------|------|
| `src/lib/country-region-data.ts` | Generated `COUNTRIES`, `REGIONS`, `COUNTRY_LIST` |
| `scripts/country-region-legacy.json` | Overlay; wins on same country name as generated |
| `scripts/generate-country-region-data.mjs` | Regenerator |
| `src/lib/constants.ts` | Re-exports `COUNTRIES` / `REGIONS` / `COUNTRY_LIST` (stable import path) |
| `src/components/projects/country-select.tsx` | Unchanged UX (search + sort) |

## Regenerate

```bash
npm run generate:countries
```

Requires `world-countries` (devDependency).

## Acceptance

- [x] Dropdown lists all `world-countries` entries (~250) with regions.
- [x] Every legacy country keeps the same region as before.
- [x] Selecting a country still fills the read-only Region field via `onSelect(country, COUNTRIES[country])`.
- [x] No form layout or API changes.

## Status

Implemented on branch `ventura/feature-add-countries`. Move to `done/` after product sign-off.
