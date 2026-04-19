/**
 * Unit tests for `parseTextInterviewToUtterances` — the structure-aware
 * parser used by the transcript review page when `source_type` is `text` or
 * `document` (i.e. no AssemblyAI `source_utterances` to seed from).
 *
 * The review editor relies on three guarantees:
 *   1. Non-empty input always yields ≥ 1 utterance with non-empty text.
 *   2. Every utterance has `end > start` (so `isValidChunkTimeRange` works
 *      consistently — even though audio playback is gated off for text).
 *   3. The returned `speakerMap` covers every `speaker` code emitted, so the
 *      editor never falls back to a "Speaker Q" placeholder.
 */

import { describe, it, expect } from "vitest";
import { parseTextInterviewToUtterances } from "@/lib/interviews/transcript-utterances-from-full";

function assertCommonInvariants(
  result: ReturnType<typeof parseTextInterviewToUtterances>
) {
  for (const u of result.utterances) {
    expect(u.text.length).toBeGreaterThan(0);
    expect(u.end).toBeGreaterThan(u.start);
    expect(result.speakerMap[u.speaker]).toBeDefined();
  }
}

describe("parseTextInterviewToUtterances — qa_structured", () => {
  const QA_TEXT = `Q: What is your role at the ministry?
A: I am the Deputy Minister for Energy Policy.

Q: How long have you been in this position?
A: Three years now. Before that I was at the state oil company.

Q: What are the main challenges you face?
A: Funding and regulatory capacity.`;

  it("auto-detects qa_structured and emits Q/A utterances", () => {
    const result = parseTextInterviewToUtterances(QA_TEXT);
    expect(result.detectedStructure).toBe("qa_structured");
    expect(result.utterances.length).toBe(6);
    expect(result.utterances.map((u) => u.speaker)).toEqual([
      "Q",
      "A",
      "Q",
      "A",
      "Q",
      "A",
    ]);
    expect(result.speakerMap).toMatchObject({ Q: "Question", A: "Answer" });
    assertCommonInvariants(result);
  });

  it("strips the Q:/A: prefix from utterance text", () => {
    const result = parseTextInterviewToUtterances(QA_TEXT);
    for (const u of result.utterances) {
      expect(u.text.startsWith("Q:")).toBe(false);
      expect(u.text.startsWith("A:")).toBe(false);
    }
    expect(result.utterances[0].text).toBe(
      "What is your role at the ministry?"
    );
  });

  it("handles long-form answers with implicit A separation (blank line after Q)", () => {
    const text = `Q: Tell me about the funding gap.

It is around $4 billion annually. We are pursuing multilateral partners.

We also expect bilateral commitments to grow over the next two years.

Q: And the regulatory side?

There we are working with the World Bank.`;

    const result = parseTextInterviewToUtterances(text);
    expect(result.detectedStructure).toBe("qa_structured");
    const speakers = result.utterances.map((u) => u.speaker);
    expect(speakers[0]).toBe("Q");
    expect(speakers[1]).toBe("A");
    assertCommonInvariants(result);
  });

  it("supports Spanish Pregunta:/Respuesta: markers", () => {
    const text = `Pregunta: ¿Cuál es su cargo?
Respuesta: Soy ministra de energía.

Pregunta: ¿Cuánto tiempo lleva?
Respuesta: Dos años.`;

    const result = parseTextInterviewToUtterances(text);
    expect(result.detectedStructure).toBe("qa_structured");
    expect(result.utterances.map((u) => u.speaker)).toEqual([
      "Q",
      "A",
      "Q",
      "A",
    ]);
    assertCommonInvariants(result);
  });
});

describe("parseTextInterviewToUtterances — speaker_transcript", () => {
  const SPEAKER_TEXT = `Moderator: Welcome to the panel.
Carlos: Thank you for having me.
Maria: It is a pleasure to be here.
Moderator: Let us start with you, Carlos.
Carlos: I would like to discuss the policy framework first.`;

  it("detects speaker_transcript and groups consecutive lines per speaker", () => {
    const result = parseTextInterviewToUtterances(SPEAKER_TEXT);
    expect(result.detectedStructure).toBe("speaker_transcript");
    expect(result.utterances.length).toBe(5);
    expect(result.utterances.map((u) => u.speaker)).toEqual([
      "Moderator",
      "Carlos",
      "Maria",
      "Moderator",
      "Carlos",
    ]);
    expect(result.speakerMap).toMatchObject({
      Moderator: "Moderator",
      Carlos: "Carlos",
      Maria: "Maria",
    });
    assertCommonInvariants(result);
  });
});

describe("parseTextInterviewToUtterances — article_style / freeform", () => {
  const ARTICLE_TEXT = `The minister spoke at length about the energy transition.

Investment in renewables grew thirty percent year on year, supported by a new tariff regime that incentivises private capital.

Critics argue that grid capacity remains the binding constraint and that further reforms to the transmission operator are needed.`;

  it("emits one utterance per paragraph for article-style prose", () => {
    const result = parseTextInterviewToUtterances(ARTICLE_TEXT);
    expect(result.detectedStructure).toBe("article_style");
    expect(result.utterances.length).toBe(3);
    expect(result.utterances.every((u) => u.speaker === "P")).toBe(true);
    expect(result.speakerMap).toEqual({ P: "Paragraph" });
    assertCommonInvariants(result);
  });

  it("returns a single utterance for short single-line input", () => {
    const text = "Single line of prose with no paragraph breaks at all.";
    const result = parseTextInterviewToUtterances(text);
    expect(result.utterances.length).toBe(1);
    expect(result.utterances[0].text).toBe(text);
    assertCommonInvariants(result);
  });

  it("returns no utterances for empty/whitespace input", () => {
    expect(parseTextInterviewToUtterances("").utterances).toEqual([]);
    expect(parseTextInterviewToUtterances("   \n\n  ").utterances).toEqual([]);
  });
});

describe("parseTextInterviewToUtterances — structureHint override", () => {
  it("falls back to paragraph parsing when QA hint matches no Q/A markers", () => {
    const text = `First paragraph of plain prose.

Second paragraph, also plain.`;
    const result = parseTextInterviewToUtterances(text, "qa_structured");
    expect(result.utterances.length).toBe(2);
    expect(result.utterances.every((u) => u.speaker === "P")).toBe(true);
    expect(result.detectedStructure).toBe("article_style");
  });

  it("respects an explicit freeform hint even when Q/A markers are present", () => {
    const text = `Q: question
A: answer`;
    const result = parseTextInterviewToUtterances(text, "freeform");
    expect(result.detectedStructure).toBe("freeform");
    // Single block (no paragraph break) → one utterance carrying both lines.
    expect(result.utterances.length).toBe(1);
  });
});
