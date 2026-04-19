/**
 * PR5 — Unit tests for chunkTextInterview()
 *
 * Tests:
 * 1. qa_structured: Q/A-formatted text → detects qa_structured, produces chunks without speaker field
 * 2. speaker_transcript: "Name:" labels → detects speaker_transcript, chunks carry speaker
 * 3. freeform: continuous prose without patterns → detected as freeform/article_style
 * 4. structureHint override: explicit hint overrides auto-detection
 */

import { describe, it, expect } from "vitest";
import {
  chunkTextInterview,
  detectTextStructure,
} from "@/lib/ai/chunking-text-interview";

// ── Q&A structured ───────────────────────────────────────────────────────────

describe("chunkTextInterview — qa_structured", () => {
  const QA_TEXT = `Q: What is your role at the ministry?
A: I am the Deputy Minister for Energy Policy.

Q: How long have you been in this position?
A: Three years now. Before that I was at the state oil company.

Q: What are the main challenges you face?
A: Funding and regulatory capacity. We have ambitious targets but limited resources.

Q: Can you elaborate on the funding gap?
A: The gap is around $4 billion annually. We are seeking bilateral and multilateral partners.`;

  it("auto-detects qa_structured structure", () => {
    expect(detectTextStructure(QA_TEXT)).toBe("qa_structured");
  });

  it("chunks qa text and marks detectedStructure", () => {
    const chunks = chunkTextInterview(QA_TEXT);
    expect(chunks.detectedStructure).toBe("qa_structured");
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("produces chunks with null speaker for Q/A text", () => {
    const chunks = chunkTextInterview(QA_TEXT);
    for (const chunk of chunks) {
      expect(chunk.speaker).toBeNull();
    }
  });

  it("includes Q: content in chunks", () => {
    const chunks = chunkTextInterview(QA_TEXT);
    const allContent = chunks.map((c) => c.content).join("\n");
    expect(allContent).toContain("Deputy Minister");
    expect(allContent).toContain("funding gap");
  });
});

// ── Speaker transcript ───────────────────────────────────────────────────────

describe("chunkTextInterview — speaker_transcript", () => {
  const SPEAKER_TEXT = `John: Good morning, thank you for joining us today.
Mary: Happy to be here. I have been looking forward to this conversation.
John: Let me start by asking about your work in renewable energy.
Mary: Of course. We have been developing solar projects across three countries.
John: That is impressive. What has been the biggest challenge?
Mary: Access to financing, without a doubt. Local banks are still skeptical.`;

  it("auto-detects speaker_transcript structure", () => {
    expect(detectTextStructure(SPEAKER_TEXT)).toBe("speaker_transcript");
  });

  it("assigns speaker labels to chunks", () => {
    const chunks = chunkTextInterview(SPEAKER_TEXT);
    expect(chunks.detectedStructure).toBe("speaker_transcript");
    const speakers = chunks.map((c) => c.speaker).filter(Boolean);
    expect(speakers.length).toBeGreaterThan(0);
  });

  it("assigns 'John' as a speaker in at least one chunk", () => {
    const chunks = chunkTextInterview(SPEAKER_TEXT);
    const johnChunk = chunks.find((c) => c.speaker === "John");
    expect(johnChunk).toBeDefined();
  });

  it("assigns 'Mary' as a speaker in at least one chunk", () => {
    const chunks = chunkTextInterview(SPEAKER_TEXT);
    const maryChunk = chunks.find((c) => c.speaker === "Mary");
    expect(maryChunk).toBeDefined();
  });
});

// ── Freeform / article_style ──────────────────────────────────────────────────

describe("chunkTextInterview — freeform / article_style", () => {
  const ARTICLE_TEXT = `The meeting took place at the ministry headquarters in the capital.
Officials from three government departments attended the closed-door session.

The discussion focused on energy policy reform and the proposed amendments to the
national electricity act. Representatives from the private sector were also present.

Several key decisions were announced following the meeting. The minister confirmed
that a new regulatory framework would be published within sixty days. This decision
was welcomed by industry stakeholders who had been seeking clarity.

The framework is expected to address long-standing issues around licensing fees,
connection requirements, and dispute resolution mechanisms.`;

  it("auto-detects article_style for paragraph text", () => {
    const structure = detectTextStructure(ARTICLE_TEXT);
    expect(["article_style", "freeform"]).toContain(structure);
  });

  it("produces chunks with null speakers", () => {
    const chunks = chunkTextInterview(ARTICLE_TEXT);
    for (const chunk of chunks) {
      expect(chunk.speaker).toBeNull();
    }
  });

  it("preserves key content in chunks", () => {
    const chunks = chunkTextInterview(ARTICLE_TEXT);
    const allContent = chunks.map((c) => c.content).join("\n");
    expect(allContent).toContain("regulatory framework");
  });
});

// ── structureHint override ────────────────────────────────────────────────────

describe("chunkTextInterview — structureHint override", () => {
  const FREEFORM_TEXT = `This is a paragraph of continuous text without any speaker labels
or question and answer formatting. It simply flows as narrative prose.

There is a second paragraph here with more content. The writing style is descriptive
and does not follow any interview structure.`;

  it("respects qa_structured hint even on freeform text", () => {
    const chunks = chunkTextInterview(FREEFORM_TEXT, "qa_structured");
    expect(chunks.detectedStructure).toBe("qa_structured");
  });

  it("respects speaker_transcript hint even on freeform text", () => {
    const chunks = chunkTextInterview(FREEFORM_TEXT, "speaker_transcript");
    expect(chunks.detectedStructure).toBe("speaker_transcript");
  });

  it("respects freeform hint", () => {
    const chunks = chunkTextInterview(FREEFORM_TEXT, "freeform");
    expect(chunks.detectedStructure).toBe("freeform");
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("chunkTextInterview — edge cases", () => {
  it("produces at least one chunk for non-empty input", () => {
    const text = "This is a short text with enough characters to pass minimum validation checks.";
    const chunks = chunkTextInterview(text);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("all chunks have sequential chunkIndex starting at 0", () => {
    const text = "Q: What do you think?\nA: I think it is important.\n\nQ: Why?\nA: Because it matters.";
    const chunks = chunkTextInterview(text);
    chunks.forEach((c, i) => {
      expect(c.chunkIndex).toBe(i);
    });
  });
});
