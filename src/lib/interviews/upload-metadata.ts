import { MAX_INTERVIEWEE_TITLE_LENGTH } from "@/lib/constants";
import type { RelationType } from "@/types/database";

/** Optional interviewee role/title from upload forms (trimmed, max length). */
export function sanitizeIntervieweeTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  if (!cleaned) return null;
  return cleaned.length > MAX_INTERVIEWEE_TITLE_LENGTH
    ? cleaned.slice(0, MAX_INTERVIEWEE_TITLE_LENGTH)
    : cleaned;
}

/**
 * Infer a `relation_type` from a free-text job title string.
 *
 * Pure function — used as the pipeline fallback when no explicit relationship
 * type was selected in the Add Source form. The lookup is conservative:
 * only clear, unambiguous title signals map to a specific type. All other
 * titles return `null` so the caller can fall back to `works_at`.
 *
 * Matches the anchor-to-type mapping table in the entity-relationship-extraction spec.
 */
export function inferRelationTypeFromTitle(title: string | null | undefined): RelationType | null {
  if (!title) return null;
  const t = title.toLowerCase().trim();

  // C-suite
  if (/\bceo\b|chief executive|managing director|presidente ejecutivo/.test(t)) return "is_ceo_of";
  if (/\bcfo\b|chief financial|finance director|director financiero/.test(t)) return "is_cfo_of";
  if (/\bcto\b|chief technolog|technology director|director de tecnolog/.test(t)) return "is_cto_of";
  if (/\bcoo\b|chief operating|operations director|director de operaciones/.test(t)) return "is_coo_of";
  if (/\bcmo\b|chief marketing|marketing director|director de marketing/.test(t)) return "is_cmo_of";
  if (/\bcso\b|chief strategy|strategy director|director de estrategia/.test(t)) return "is_cso_of";

  // Board / governance
  if (/\bboard\b|non.executive director|non exec|consejero/.test(t)) return "is_board_member_of";

  // Founder
  if (/\bfounder\b|co-?founder\b|cofundador/.test(t)) return "founded";

  // Government / institution heads
  if (/\bminister\b|ministro|secretary of state|secretar[io]+ de estado|head of institution|director general|director.general/.test(t)) return "leads";

  // Membership
  if (/\bdelegate\b|delegado/.test(t)) return "is_member_of";

  // Advisory
  if (/\badvis[eo]r\b|adviser|consultant\b|consultor/.test(t)) return "advisor";

  // Representative
  if (/\brepresent/.test(t)) return "represents";

  return null;
}
