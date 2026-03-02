/**
 * Normalizes entity names for deterministic matching.
 * Steps: lowercase -> trim -> strip diacritics -> remove punctuation/symbols -> collapse whitespace.
 */
export function normalizeEntityName(name: string): string {
  if (!name) return "";

  const lowerTrimmed = name.toLocaleLowerCase().trim();

  // NFKD separates letters and diacritics (e.g. "é" -> "e" + accent),
  // then we remove combining marks.
  const withoutDiacritics = lowerTrimmed
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  // Remove punctuation/symbols while preserving letters, numbers, and whitespace.
  const withoutPunctuation = withoutDiacritics.replace(/[\p{P}\p{S}]+/gu, " ");

  // Collapse multiple spaces and trim again for stable comparisons.
  return withoutPunctuation.replace(/\s+/g, " ").trim();
}
