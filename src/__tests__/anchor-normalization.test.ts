/**
 * Conservative-fidelity tests for `normalizeChunkWithAnchors`.
 *
 * Mirrors the regression coverage in `normalize-display.test.ts`:
 * chunk-level anchor normalization must NOT generate bare-surname /
 * honorific-stripped variants, otherwise embeddings get polluted with
 * substitutions like "Mr. Brown" → "Mr. Mrs. Brown" before the text
 * is sent to the embedding model.
 *
 * Anchor enrichment (the appended `Primary interviewee:` /
 * `Primary institution:` lines on `contentForEmbedding`) is the
 * intended retrieval mechanism — not destructive sub-token
 * substitution inside the chunk body.
 */

import { describe, it, expect } from "vitest";
import { normalizeChunkWithAnchors } from "@/lib/chunks/anchor-normalization";

describe("normalizeChunkWithAnchors — fidelity guarantees", () => {
  it("does NOT rewrite 'Mr. Brown' into 'Mr. Mrs. Brown' when the person anchor is 'Mrs. Brown'", () => {
    const raw =
      "Mrs. Brown leads the unit. Mr. Brown — a separate official — provided historical context.";
    const result = normalizeChunkWithAnchors(raw, {
      intervieweeName: "Mrs. Brown",
      intervieweeOrg: null,
    });

    expect(result.normalizedContent).toBe(raw);
    expect(result.normalizedContent).not.toContain("Mr. Mrs. Brown");
    expect(result.contentForEmbedding).not.toContain("Mr. Mrs. Brown");
    expect(result.contentForEmbedding).toContain(
      "Primary interviewee: Mrs. Brown"
    );
  });

  it("does NOT replace bare surname mentions globally", () => {
    const raw =
      "Brown said the policy is final. Senator Brown disagreed during questioning.";
    const result = normalizeChunkWithAnchors(raw, {
      intervieweeName: "Mrs. Brown",
      intervieweeOrg: null,
    });

    expect(result.normalizedContent).toBe(raw);
    expect(result.replacementCount).toBe(0);
  });

  it("still applies the safe punctuation-tidy variant of the full anchor at high confidence", () => {
    // Both anchors present + a replacement against one of them ⇒ confidence "high",
    // so the normalized text surfaces as `normalizedContent` (see deriveConfidence).
    const raw =
      "Dr Mohamed Bello, Minister of Power, addressed the Federal Ministry of Power.";
    const result = normalizeChunkWithAnchors(raw, {
      intervieweeName: "Dr. Mohamed Bello",
      intervieweeOrg: "Federal Ministry of Power",
    });

    expect(result.replacementCount).toBeGreaterThan(0);
    expect(result.confidence).toBe("high");
    expect(result.normalizedContent).toContain("Dr. Mohamed Bello, Minister");
  });

  it("appends anchor enrichment so embeddings still capture the primary entities without rewriting the body", () => {
    const raw = "We discussed quarterly results and the supply outlook.";
    const result = normalizeChunkWithAnchors(raw, {
      intervieweeName: "Aliko Dangote",
      intervieweeOrg: "Dangote Group",
    });

    expect(result.normalizedContent).toBe(raw);
    expect(result.contentForEmbedding).toBe(
      `${raw}\nPrimary interviewee: Aliko Dangote\nPrimary institution: Dangote Group`
    );
  });

  it("returns raw content untouched when no anchors are provided", () => {
    const raw = "A chunk with no anchor context to apply.";
    const result = normalizeChunkWithAnchors(raw, {
      intervieweeName: null,
      intervieweeOrg: null,
    });

    expect(result.normalizedContent).toBe(raw);
    expect(result.contentForEmbedding).toBe(raw);
    expect(result.normalizationApplied).toBe(false);
    expect(result.confidence).toBe("low");
  });
});
