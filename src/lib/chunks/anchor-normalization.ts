// ============================================
// Anchor-Aware Chunk Normalization
// ============================================
// Architectural decision: raw evidence vs retrieval-grade intelligence layer.
//
// interview_chunks.content holds the raw ASR output — the evidentiary truth.
// This module produces a *normalized* version of that text, stored in
// interview_chunks.metadata.normalized_content, used exclusively for:
//   - embedding generation (better retrieval)
//   - downstream intelligence (reports, chat grounding)
//
// Normalization is conservative and anchor-driven:
//   1. Detect likely ASR variants of the primary person and org anchors.
//   2. Replace only those variants with canonical anchor names.
//   3. Never broadly rewrite the chunk or invent anchors.
//   4. Record confidence so downstream consumers can decide trust level.

import type { ChunkMetadata } from "@/types/database";

// ── Regex helpers (shared with normalizeDisplay.ts by design pattern) ──

const HONORIFIC_PREFIX_RE = /^\s*(mr|mrs|ms|dr|prof)\.?\s+/i;
const ROLE_PREFIX_RE =
  /\b(?:mr|mrs|ms|dr|prof|minister|governor|chairman|ambassador|ceo|president|director|secretary|commissioner|comptroller)\.?\s+[A-Za-z][\p{L}'-]*(?:\s+[A-Za-z][\p{L}'-]*){0,2}/giu;
const ORG_MARKER_RE =
  /\b[A-Za-z][\p{L}&.'-]*(?:\s+[A-Za-z][\p{L}&.'-]*){0,3}\s+(?:ltd|inc|sa|llc|bank|ministry|authority|company|corporation|utility|operator|agency|commission|board|fund)\b/giu;
const ACRONYM_RE = /\b[A-Z]{3,}\b/g;

export interface ChunkAnchors {
  intervieweeName: string | null;
  intervieweeOrg: string | null;
}

export interface NormalizedChunkResult {
  normalizedContent: string;
  normalizationApplied: boolean;
  confidence: "high" | "medium" | "low";
  replacementCount: number;
}

/**
 * Build retrieval-grade normalized chunk metadata from raw chunk content
 * and interview-level anchors.
 *
 * Returns enriched metadata to merge into the chunk's existing metadata JSONB.
 * Raw `content` column is never mutated.
 */
export function normalizeChunkWithAnchors(
  rawContent: string,
  anchors: ChunkAnchors,
  interviewTranscript: string
): NormalizedChunkResult {
  const personAnchor = normalizeSpaces(anchors.intervieweeName ?? "");
  const orgAnchor = normalizeSpaces(anchors.intervieweeOrg ?? "");

  if (!personAnchor && !orgAnchor) {
    return {
      normalizedContent: rawContent,
      normalizationApplied: false,
      confidence: "low",
      replacementCount: 0,
    };
  }

  const replacementPlan = buildReplacementPlan(
    interviewTranscript,
    personAnchor,
    orgAnchor
  );

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

  return {
    normalizedContent: output,
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
    // Retrieval-grade normalized text — embeddings should use this.
    normalized_content: normResult.normalizedContent,
    normalization_applied: normResult.normalizationApplied,
    normalization_confidence: normResult.confidence,
    // Anchor provenance — which interview-level anchors were used.
    primary_person_name: anchors.intervieweeName || null,
    primary_org_name: anchors.intervieweeOrg || null,
    // Entity IDs can be backfilled after entity matching completes.
    primary_person_entity_id: null,
    primary_org_entity_id: null,
  };
}

// ── Internal helpers ────────────────────────────────────────────────

type ReplacementEntry = { canonical: string; variants: string[] };

function buildReplacementPlan(
  transcript: string,
  personAnchor: string,
  orgAnchor: string
): ReplacementEntry[] {
  const plan: ReplacementEntry[] = [];

  if (personAnchor) {
    const proximityVariants = orgAnchor
      ? extractNameCandidatesNearOrg(transcript, orgAnchor)
      : [];
    plan.push({
      canonical: personAnchor,
      variants: dedupeCandidates(personAnchor, [
        ...buildAnchorVariants(personAnchor),
        ...proximityVariants,
      ]),
    });
  }

  if (orgAnchor) {
    const proximityVariants = personAnchor
      ? extractOrgCandidatesNearName(transcript, personAnchor)
      : [];
    plan.push({
      canonical: orgAnchor,
      variants: dedupeCandidates(orgAnchor, [
        ...buildAnchorVariants(orgAnchor),
        ...proximityVariants,
      ]),
    });
  }

  return plan;
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

function stripLeadingHonorific(value: string): string {
  return value.replace(HONORIFIC_PREFIX_RE, "").trim();
}

function stripPunctuation(value: string): string {
  return value.replace(/[.,/#!$%^&*;:{}=_`~()\-+[\]\\'"?<>]/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildAnchorVariants(anchor: string): string[] {
  const variants = new Set<string>();
  const normalized = normalizeSpaces(anchor);
  if (!normalized) return [];

  variants.add(normalized);
  variants.add(stripLeadingHonorific(normalized));
  variants.add(normalizeSpaces(stripPunctuation(normalized)));

  return [...variants].filter(Boolean).sort((a, b) => b.length - a.length);
}

function findOccurrences(text: string, needle: string): number[] {
  if (!needle) return [];
  const escaped = escapeRegExp(needle);
  const regex = new RegExp(
    `(^|[^\\p{L}\\p{N}])(${escaped})(?=$|[^\\p{L}\\p{N}])`,
    "giu"
  );
  const out: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    out.push(match.index + (match[1]?.length ?? 0));
  }
  return out;
}

const PROXIMITY_WINDOW = 80;

function collectNearWindow(text: string, center: number): string {
  const start = Math.max(0, center - PROXIMITY_WINDOW);
  const end = Math.min(text.length, center + PROXIMITY_WINDOW);
  return text.slice(start, end);
}

function extractNameCandidatesNearOrg(
  transcript: string,
  orgAnchor: string
): string[] {
  const candidates = new Set<string>();
  const hits = findOccurrences(transcript, orgAnchor);

  for (const index of hits) {
    const window = collectNearWindow(transcript, index);
    for (const match of window.matchAll(ROLE_PREFIX_RE)) {
      const found = normalizeSpaces(match[0] ?? "");
      if (found.length >= 3) candidates.add(found);
      const noTitle = stripLeadingHonorific(found);
      if (noTitle.length >= 3) candidates.add(noTitle);
    }
  }

  return [...candidates];
}

function extractOrgCandidatesNearName(
  transcript: string,
  nameAnchor: string
): string[] {
  const candidates = new Set<string>();
  const hits = findOccurrences(transcript, nameAnchor);

  for (const index of hits) {
    const window = collectNearWindow(transcript, index);
    for (const match of window.matchAll(ORG_MARKER_RE)) {
      const found = normalizeSpaces(match[0] ?? "");
      if (found.length >= 3) candidates.add(found);
    }
    const acronyms = window.match(ACRONYM_RE) ?? [];
    for (const token of acronyms) {
      if (token.length >= 3) candidates.add(token);
    }
  }

  return [...candidates];
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
  return input.replace(regex, (_match, prefix: string) => `${prefix}${canonical}`);
}
