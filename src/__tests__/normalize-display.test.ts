/**
 * Conservative-fidelity tests for `normalizeTranscriptDisplay`.
 *
 * Regression coverage for the corruption modes that motivated the
 * Transcript Review fidelity fix (branch `ventura/fix-transcript-review`):
 *
 *   1. Bare-surname person variants (e.g. "Brown" derived from
 *      "Mrs. Brown") used to be globally rewritten to the canonical,
 *      producing "Mr. Mrs. Brown" when another person shared the
 *      surname.
 *   2. Proximity-based discovery used to scan around an anchor for
 *      acronyms / org markers and globally rewrite them to the
 *      interviewee org (e.g. "NNPC" → "Dangote Group").
 *
 * Both behaviors are gone. The display layer must now only apply
 * formatting-safe variants of the *full* canonical anchor.
 */

import { describe, it, expect } from "vitest";
import { normalizeTranscriptDisplay } from "@/lib/transcript/normalizeDisplay";

describe("normalizeTranscriptDisplay — fidelity guarantees", () => {
  it("does NOT rewrite an unrelated 'Mr. Brown' when the anchor is 'Mrs. Brown'", () => {
    const transcript =
      "Mrs. Brown joined the cabinet last year. Earlier, Mr. Brown chaired the committee.";
    const { transcriptDisplay, stats } = normalizeTranscriptDisplay(
      transcript,
      { intervieweeName: "Mrs. Brown", intervieweeOrg: null }
    );

    expect(transcriptDisplay).toBe(transcript);
    expect(transcriptDisplay).not.toContain("Mr. Mrs. Brown");
    expect(stats.replacementsApplied).toBe(0);
  });

  it("does NOT globally rewrite a nearby acronym to the interviewee org", () => {
    const transcript =
      "Aliko Dangote, the chairman of Dangote Group, said NNPC has improved supply. " +
      "Independent observers separately note that NNPC missed last quarter's targets.";
    const { transcriptDisplay } = normalizeTranscriptDisplay(transcript, {
      intervieweeName: "Aliko Dangote",
      intervieweeOrg: "Dangote Group",
    });

    expect(transcriptDisplay).toContain("NNPC has improved supply");
    expect(transcriptDisplay).toContain("NNPC missed last quarter");
    expect(transcriptDisplay).not.toMatch(/Dangote Group has improved/);
  });

  it("keeps reviewed text byte-stable when no safe variant matches", () => {
    const reviewed =
      "Q: What is the priority?\n" +
      "A: Power sector reform — specifically transmission and distribution losses.";
    const { transcriptDisplay, stats } = normalizeTranscriptDisplay(reviewed, {
      intervieweeName: "Mrs. Brown",
      intervieweeOrg: "Federal Ministry of Power",
    });

    expect(transcriptDisplay).toBe(reviewed);
    expect(stats.replacementsApplied).toBe(0);
  });

  it("still applies safe punctuation/spacing normalization for the full anchor", () => {
    const transcript =
      "Today we sit with Dr Mohamed Bello, head of NEPC.\n" +
      "Dr. Mohamed Bello opened the discussion.";
    const { transcriptDisplay, stats } = normalizeTranscriptDisplay(
      transcript,
      { intervieweeName: "Dr. Mohamed Bello", intervieweeOrg: null }
    );

    expect(transcriptDisplay).toContain("Dr. Mohamed Bello, head of NEPC");
    expect(transcriptDisplay).toContain(
      "Dr. Mohamed Bello opened the discussion"
    );
    expect(stats.replacementsApplied).toBeGreaterThan(0);
  });

  it("does NOT touch the surname even when the canonical anchor has a honorific", () => {
    const transcript =
      "Brown stood by the decision. Later, Smith publicly disagreed with Brown.";
    const { transcriptDisplay, stats } = normalizeTranscriptDisplay(
      transcript,
      { intervieweeName: "Mrs. Brown", intervieweeOrg: null }
    );

    expect(transcriptDisplay).toBe(transcript);
    expect(stats.replacementsApplied).toBe(0);
  });

  it("returns the transcript unchanged when no anchors are provided", () => {
    const transcript = "Some transcript content with various names like Brown.";
    const { transcriptDisplay, stats } = normalizeTranscriptDisplay(
      transcript,
      { intervieweeName: null, intervieweeOrg: null }
    );

    expect(transcriptDisplay).toBe(transcript);
    expect(stats.replacementsApplied).toBe(0);
  });
});
