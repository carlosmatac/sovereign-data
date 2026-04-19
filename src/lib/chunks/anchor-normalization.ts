// ============================================
// Anchor-Aware Chunk Normalization
// ============================================
//
// ARCHITECTURAL RULE: Prefer anchor enrichment over speculative text replacement.
//
// interview_chunks.content holds the raw ASR output — the evidentiary truth.
// This module produces:
//
//   1. normalized_content — conservative text with ONLY high-confidence,
//      deterministic replacements (canonical anchor-name derivatives).
//      Proximity-guessed ASR variants are NEVER substituted.
//
//   2. content_for_embedding — the text actually sent to the embedding model:
//      - high-confidence normalized text OR raw chunk text
//      - PLUS structured anchor context (primary person, primary institution)
//
// This design ensures:
//   - Raw evidence remains untouched in interview_chunks.content
//   - Embeddings benefit from canonical anchor names via appended context
//   - No unsafe ASR variant substitutions corrupt the embedding input
//     (e.g. "Buddha" is never forcibly rewritten to "Boudab")
//   - Chunks become retrievable for anchor-related queries via context,
//     not via risky text rewriting
//
// REGRESSION GUARD (do not re-introduce): bare-surname / honorific-stripped
// variants. From a person anchor like "Mrs. Brown" we used to derive
// "Brown" as a replaceable variant, which then rewrote unrelated mentions
// (e.g. "Mr. Brown") into "Mr. Mrs. Brown" inside chunk text. The variant
// builder below intentionally only emits the full anchor and its
// punctuation/spacing-tidy form. Anchor *enrichment* (appended context for
// the embedding) is what gives us retrieval coverage of partial mentions —
// not destructive sub-token substitution.

import type { ChunkMetadata } from "@/types/database";

export interface ChunkAnchors {
  intervieweeName: string | null;
  intervieweeOrg: string | null;
}

export interface NormalizedChunkResult {
  normalizedContent: string;
  contentForEmbedding: string;
  normalizationApplied: boolean;
  confidence: "high" | "medium" | "low";
  replacementCount: number;
}

/**
 * Build retrieval-grade normalized chunk from raw content + interview anchors.
 *
 * Prefer anchor enrichment over speculative text replacement.
 * Only deterministic variants of the canonical anchor names are replaced
 * (e.g. "Dr Mohamed" → "Dr. Mohamed"). Proximity-guessed ASR variants
 * are never substituted — anchor context appended to the embedding input
 * handles retrieval instead.
 */
export function normalizeChunkWithAnchors(
  rawContent: string,
  anchors: ChunkAnchors
): NormalizedChunkResult {
  const personAnchor = normalizeSpaces(anchors.intervieweeName ?? "");
  const orgAnchor = normalizeSpaces(anchors.intervieweeOrg ?? "");

  if (!personAnchor && !orgAnchor) {
    return {
      normalizedContent: rawContent,
      contentForEmbedding: rawContent,
      normalizationApplied: false,
      confidence: "low",
      replacementCount: 0,
    };
  }

  // Only use deterministic anchor-name derivatives for text replacement.
  // Proximity-based candidates caused unsafe substitutions (e.g. "Buddha" → "Boudab")
  // and have been removed from the replacement path entirely.
  const replacementPlan = buildSafeReplacementPlan(personAnchor, orgAnchor);

  let output = rawContent;
  let totalReplacements = 0;

  for (const { canonical, variants } of replacementPlan) {
    for (const variant of variants) {
      const before = output;
      output = replaceSafeWordBounded(output, variant, canonical);
      if (output !== before) totalReplacements++;
    }
  }

  const confidence = deriveConfidence(
    totalReplacements,
    personAnchor,
    orgAnchor,
    rawContent
  );

  // Prefer anchor enrichment over speculative text replacement.
  // High-confidence: safe deterministic replacements → use normalized text as base.
  // Otherwise: preserve raw wording and rely on anchor context for retrieval.
  const normalizedContent =
    confidence === "high" && totalReplacements > 0 ? output : rawContent;

  const embeddingBase = normalizedContent;
  const contentForEmbedding = buildContentForEmbedding(embeddingBase, {
    intervieweeName: personAnchor || null,
    intervieweeOrg: orgAnchor || null,
  });

  return {
    normalizedContent,
    contentForEmbedding,
    normalizationApplied: totalReplacements > 0,
    confidence,
    replacementCount: totalReplacements,
  };
}

/**
 * Merge normalization results into chunk metadata JSONB.
 * Preserves existing metadata fields (country, topics, entities, etc.).
 */
export function buildNormalizedChunkMetadata(
  baseMetadata: Partial<ChunkMetadata>,
  normResult: NormalizedChunkResult,
  anchors: ChunkAnchors
): ChunkMetadata {
  return {
    ...baseMetadata,
    normalized_content: normResult.normalizedContent,
    content_for_embedding: normResult.contentForEmbedding,
    normalization_applied: normResult.normalizationApplied,
    normalization_confidence: normResult.confidence,
    primary_person_name: anchors.intervieweeName || null,
    primary_org_name: anchors.intervieweeOrg || null,
    primary_person_entity_id: null,
    primary_org_entity_id: null,
  };
}

// ── Internal helpers ────────────────────────────────────────────────

type ReplacementEntry = { canonical: string; variants: string[] };

/**
 * Build replacement plan using ONLY deterministic anchor-name derivatives.
 * No proximity-based or speculative variant detection — those caused
 * unsafe substitutions like "Buddha" → "Boudab".
 */
function buildSafeReplacementPlan(
  personAnchor: string,
  orgAnchor: string
): ReplacementEntry[] {
  const plan: ReplacementEntry[] = [];

  if (personAnchor) {
    plan.push({
      canonical: personAnchor,
      variants: dedupeCandidates(
        personAnchor,
        buildAnchorVariants(personAnchor)
      ),
    });
  }

  if (orgAnchor) {
    plan.push({
      canonical: orgAnchor,
      variants: dedupeCandidates(orgAnchor, buildAnchorVariants(orgAnchor)),
    });
  }

  return plan;
}

/**
 * Build anchor-enriched text for embedding generation.
 * Appends structured anchor context so the embedding captures
 * the primary person/institution even when the raw text uses
 * ASR-mangled variants of their names.
 */
function buildContentForEmbedding(
  baseText: string,
  anchors: ChunkAnchors
): string {
  const parts = [baseText];

  if (anchors.intervieweeName) {
    parts.push(`Primary interviewee: ${anchors.intervieweeName}`);
  }
  if (anchors.intervieweeOrg) {
    parts.push(`Primary institution: ${anchors.intervieweeOrg}`);
  }

  return parts.join("\n");
}

function deriveConfidence(
  replacements: number,
  personAnchor: string,
  orgAnchor: string,
  rawContent: string
): "high" | "medium" | "low" {
  const hasPersonAnchor = Boolean(personAnchor);
  const hasOrgAnchor = Boolean(orgAnchor);

  if (!hasPersonAnchor && !hasOrgAnchor) return "low";

  const contentLower = rawContent.toLowerCase();
  const personPresent =
    hasPersonAnchor && contentLower.includes(personAnchor.toLowerCase());
  const orgPresent =
    hasOrgAnchor && contentLower.includes(orgAnchor.toLowerCase());

  if (replacements === 0 && !personPresent && !orgPresent) return "low";
  if (replacements === 0) return "medium";
  if (hasPersonAnchor && hasOrgAnchor) return "high";
  return "medium";
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripPunctuation(value: string): string {
  return value.replace(/[.,/#!$%^&*;:{}=_`~()\-+[\]\\'"?<>]/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Safe anchor variants for chunk normalization.
 *
 * Only deterministic forms of the *full* anchor string are produced:
 *   - the normalized anchor itself (whitespace collapsed)
 *   - a punctuation/spacing-tidy form (e.g. "Dr Mohamed" → "Dr. Mohamed")
 *
 * Honorific-stripped sub-tokens (e.g. "Brown" from "Mrs. Brown") are
 * deliberately NOT generated here — see the regression note at the
 * top of this file.
 */
function buildAnchorVariants(anchor: string): string[] {
  const variants = new Set<string>();
  const normalized = normalizeSpaces(anchor);
  if (!normalized) return [];

  variants.add(normalized);
  variants.add(normalizeSpaces(stripPunctuation(normalized)));

  return [...variants].filter(Boolean).sort((a, b) => b.length - a.length);
}

function dedupeCandidates(canonical: string, candidates: string[]): string[] {
  const seen = new Set<string>();
  const canonicalNorm = normalizeSpaces(canonical).toLowerCase();
  const out: string[] = [];

  for (const candidate of candidates) {
    const normalized = normalizeSpaces(candidate);
    if (normalized.length < 3) continue;
    const key = normalized.toLowerCase();
    if (key === canonicalNorm) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }

  return out.sort((a, b) => b.length - a.length);
}

function replaceSafeWordBounded(
  input: string,
  candidate: string,
  canonical: string
): string {
  if (!candidate) return input;
  const regex = new RegExp(
    `(^|[^\\p{L}\\p{N}])(${escapeRegExp(candidate)})(?=$|[^\\p{L}\\p{N}])`,
    "giu"
  );
  return input.replace(
    regex,
    (_match, prefix: string) => `${prefix}${canonical}`
  );
}
