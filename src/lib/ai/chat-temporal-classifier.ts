import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

const TemporalClassifierSchema = z.object({
  temporal_intent: z
    .enum([
      "current_state",
      "point_in_time",
      "timeline",
      "general_background",
    ])
    .describe(
      "current_state: who is X now / current CEO; point_in_time: who was X in YEAR; timeline: how leadership changed; general_background: broad what do we know"
    ),
  focus: z
    .enum(["person", "organization", "person_org", "relationship", "general"])
    .describe("Primary entity focus of the question"),
  person_name: z
    .string()
    .nullable()
    .describe("Person name if identifiable, else null"),
  organization_name: z
    .string()
    .nullable()
    .describe("Company/org name if identifiable, else null"),
  target_date_iso: z
    .string()
    .nullable()
    .describe(
      "If user implied a historical date, YYYY-MM-DD (use Dec 31 of year if only year given), else null"
    ),
});

export type TemporalClassification = z.infer<typeof TemporalClassifierSchema>;

const FALLBACK: TemporalClassification = {
  temporal_intent: "general_background",
  focus: "general",
  person_name: null,
  organization_name: null,
  target_date_iso: null,
};

/**
 * Lightweight structured classification before chat RAG (one cheap model call).
 */
export async function classifyChatTemporalIntent(
  queryText: string
): Promise<TemporalClassification> {
  const trimmed = queryText.trim();
  if (!trimmed) return FALLBACK;

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: TemporalClassifierSchema,
      maxOutputTokens: 256,
      maxRetries: 1,
      timeout: 10_000,
      prompt: `Classify this user question for an Copilot system about interviews, people, and organizations.

User message:
"""${trimmed.slice(0, 4000)}"""

Rules:
- temporal_intent=general_background for vague "tell me about", themes, sales prep, topics without a time anchor.
- point_in_time when a specific past time or year is asked ("in 2022", "before 2020").
- timeline when evolution / changes over time is asked.
- current_state for present roles ("who is the CEO now", "currently").
- Extract person_name and organization_name only if reasonably explicit (null otherwise).
- target_date_iso: for "in 2022" use "2022-12-31"; for "March 2020" use "2020-03-15"; null if not applicable.`,
    });
    return object;
  } catch (e) {
    console.warn("[chat-temporal-classifier] fallback:", e);
    return FALLBACK;
  }
}
