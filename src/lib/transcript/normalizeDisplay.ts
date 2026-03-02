type TranscriptAnchors = {
  intervieweeName?: string | null;
  intervieweeOrg?: string | null;
};

const HONORIFIC_PREFIX_REGEX = /^\s*(mr|mrs|ms|dr|prof)\.?\s+/i;
const ROLE_PREFIX_REGEX =
  /\b(?:mr|mrs|ms|dr|prof|minister|governor|chairman|ambassador|ceo)\.?\s+[A-Za-z][\p{L}'-]*(?:\s+[A-Za-z][\p{L}'-]*){0,2}/giu;
const ORG_MARKER_REGEX =
  /\b[A-Za-z][\p{L}&.'-]*(?:\s+[A-Za-z][\p{L}&.'-]*){0,3}\s+(?:ltd|inc|sa|llc|bank|ministry|authority|company|corporation|utility|operator)\b/giu;
const ACRONYM_REGEX = /\b[A-Z]{3,}\b/g;
const PROXIMITY_WINDOW = 80;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripLeadingHonorific(value: string): string {
  return value.replace(HONORIFIC_PREFIX_REGEX, "").trim();
}

function stripPunctuation(value: string): string {
  return value.replace(/[.,/#!$%^&*;:{}=_`~()\-+[\]\\'"?<>]/g, " ").trim();
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

    for (const match of window.matchAll(ROLE_PREFIX_REGEX)) {
      const found = normalizeSpaces(match[0] ?? "");
      if (found.length >= 3) candidates.add(found);
      const noTitle = stripLeadingHonorific(found);
      if (noTitle.length >= 3) candidates.add(noTitle);
    }

    const beforeOrg = window.slice(0, Math.max(0, window.toLowerCase().indexOf(orgAnchor.toLowerCase())));
    const trailingName = beforeOrg.match(
      /(?:[A-Z][\p{L}'-]{2,}\s+){0,2}[A-Z][\p{L}'-]{2,}$/u
    );
    if (trailingName?.[0]) {
      const found = normalizeSpaces(trailingName[0]);
      if (found.length >= 3) candidates.add(found);
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

    for (const match of window.matchAll(ORG_MARKER_REGEX)) {
      const found = normalizeSpaces(match[0] ?? "");
      if (found.length >= 3) candidates.add(found);
    }

    const acronyms = window.match(ACRONYM_REGEX) ?? [];
    for (const token of acronyms) {
      if (token.length >= 3) candidates.add(token);
    }
  }

  return [...candidates];
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

/**
 * Builds a cleaned transcript for display while preserving raw transcript as evidence.
 * Applies only targeted anchor replacements (interviewee/person + organization).
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
    const proximityVariants = canonicalOrg
      ? extractNameCandidatesNearOrg(rawTranscript, canonicalOrg)
      : [];
    replacements.push({
      canonical: canonicalName,
      variants: dedupeCandidates(canonicalName, [
        ...buildAnchorVariants(canonicalName),
        ...proximityVariants,
      ]),
    });
  }

  if (canonicalOrg) {
    const proximityVariants = canonicalName
      ? extractOrgCandidatesNearName(rawTranscript, canonicalName)
      : [];
    replacements.push({
      canonical: canonicalOrg,
      variants: dedupeCandidates(canonicalOrg, [
        ...buildAnchorVariants(canonicalOrg),
        ...proximityVariants,
      ]),
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
