/**
 * Entity-type colour and display helpers.
 *
 * No client-only imports — safe to use in Server Components, API routes,
 * and client components alike.
 */

export const ENTITY_TYPE_COLORS: Record<string, string> = {
  PERSON: "#60a5fa",
  COMPANY: "#34d399",
  GOVERNMENT: "#a78bfa",
  ORGANIZATION: "#fb923c",
  LOCATION: "#f87171",
  EVENT: "#fbbf24",
  COUNTRY: "#38bdf8",
  SECTOR: "#22c55e",
  COMMODITY: "#f59e0b",
  PUBLIC_INSTITUTION: "#c084fc",
  STATE_OWNED_ENTERPRISE: "#2dd4bf",
  LAW_OR_POLICY: "#e879f9",
  MEDIA_OR_PUBLICATION: "#f472b6",
  TOPIC: "#64748b",
  RISK: "#ef4444",
  OPPORTUNITY: "#10b981",
  PROJECT: "#8b5cf6",
};

const ENTITY_TYPE_COLOR_FALLBACK = "#94a3b8";

/** Returns the brand colour for an entity type, e.g. "#60a5fa" for PERSON. */
export function entityTypeColor(type: string): string {
  return ENTITY_TYPE_COLORS[type] ?? ENTITY_TYPE_COLOR_FALLBACK;
}
