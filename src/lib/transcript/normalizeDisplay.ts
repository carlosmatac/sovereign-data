// ============================================
// Conservative transcript display normalization
// ============================================
//
// PRINCIPLE: `transcript_display` must stay faithful to the source text
// (raw ASR or human-reviewed). We only apply *non-destructive*,
// formatting-safe substitutions derived deterministically from the
// canonical interviewee anchors.
//
// HISTORY (regression we deliberately removed):
//
//   1. Proximity-based variant discovery
//      - For an org anchor, we scanned an 80-char window around each
//        occurrence for honorific-prefixed names; for a name anchor,
//        we collected nearby acronyms / org markers.
//      - These locally-discovered candidates were then *globally*
//        replaced with the canonical anchor. That caused unrelated
//        acronyms (e.g. `NNPC`) to be rewritten to the interviewee org
//        across the whole transcript.
//
//   2. Bare-surname person variants
//      - From `"Mrs. Brown"` we generated `"Brown"` as a replaceable
//        variant, then globally rewrote `"Brown"` → `"Mrs. Brown"`.
//      - When the source contained `"Mr. Brown"` (a different person),
//        the replacement produced `"Mr. Mrs. Brown"`.
//
// Both behaviors are removed here. The only variants we still apply
// are deterministic punctuation/spacing tidy-ups of the *full* anchor
// string itself — never a sub-token like a surname-only form.

type TranscriptAnchors = {
  intervieweeName?: string | null;
  intervieweeOrg?: string | null;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripPunctuation(value: string): string {
  return value.replace(/[.,/#!$%^&*;:{}=_`~()\-+[\]\\'"?<>]/g, " ").trim();
}

/**
 * Build the *safe* set of variants for an anchor.
 *
 * Safe = the variant unambiguously refers to the same canonical entity
 * as the anchor itself. We intentionally do NOT include:
 *   - surname-only / honorific-stripped forms (e.g. "Brown" from
 *     "Mrs. Brown") — these collide with other people sharing the
 *     surname and produced "Mr. Mrs. Brown" corruption.
 *   - any candidate derived from local proximity scanning.
 *
 * The only variant we keep beyond the canonical itself is the
 * punctuation-normalized form (e.g. "Mrs Brown" → "Mrs. Brown",
 * "Dr Mohamed" → "Dr. Mohamed"). That is a formatting fix, not a
 * semantic rewrite.
 */
function buildSafeAnchorVariants(anchor: string): string[] {
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
  canonical: string,
  countRef: { value: number }
): string {
  if (!candidate) return input;

  const regex = new RegExp(
    `(^|[^\\p{L}\\p{N}])(${escapeRegExp(candidate)})(?=$|[^\\p{L}\\p{N}])`,
    "giu"
  );

  return input.replace(regex, (_match, prefix: string) => {
    countRef.value += 1;
    return `${prefix}${canonical}`;
  });
}

/**
 * Build a cleaned transcript for display while preserving the source
 * text as evidence. Behaviour is deliberately conservative:
 *
 *   - Replaces only punctuation/spacing variants of the canonical
 *     interviewee name and organization anchors.
 *   - Never strips honorifics to derive surname-only variants.
 *   - Never discovers replacement targets via proximity to anchors.
 *
 * Reviewed text (`reviewed_utterances`) flows through this function on
 * its way to `transcript_display`; the function MUST NOT introduce
 * semantic rewrites of the human-authored text.
 */
export function normalizeTranscriptDisplay(
  rawTranscript: string,
  anchors: TranscriptAnchors
): {
  transcriptDisplay: string;
  stats: { replacementsApplied: number };
} {
  let output = rawTranscript;

  const replacements: Array<{ canonical: string; variants: string[] }> = [];
  const canonicalName = normalizeSpaces(anchors.intervieweeName ?? "");
  const canonicalOrg = normalizeSpaces(anchors.intervieweeOrg ?? "");

  if (canonicalName) {
    replacements.push({
      canonical: canonicalName,
      variants: dedupeCandidates(
        canonicalName,
        buildSafeAnchorVariants(canonicalName)
      ),
    });
  }

  if (canonicalOrg) {
    replacements.push({
      canonical: canonicalOrg,
      variants: dedupeCandidates(
        canonicalOrg,
        buildSafeAnchorVariants(canonicalOrg)
      ),
    });
  }

  const replacementCounter = { value: 0 };
  for (const replacement of replacements) {
    for (const variant of replacement.variants) {
      output = replaceSafeWordBounded(
        output,
        variant,
        replacement.canonical,
        replacementCounter
      );
    }
  }

  return {
    transcriptDisplay: output,
    stats: {
      replacementsApplied: replacementCounter.value,
    },
  };
}
