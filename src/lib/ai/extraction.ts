// ============================================
// GPT-4o-mini Extraction — Structured Intel from Transcripts
// ============================================

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { AI_CONFIG } from "@/lib/constants";

// Zod schema for structured extraction output
const ExtractionSchema = z.object({
  summary: z
    .string()
    .describe(
      "Executive summary of the interview (3-5 sentences). Focus on key decisions, signals, and actionable intelligence."
    ),
  sentiment: z.object({
    overall: z.enum(["positive", "negative", "neutral", "mixed"]),
    score: z.number().min(-1).max(1).describe("Sentiment score from -1 (very negative) to 1 (very positive)"),
    highlights: z.array(
      z.object({
        text: z.string().describe("Quote or paraphrase from the interview"),
        sentiment: z.enum(["positive", "negative", "neutral"]),
        timestamp: z.number().nullable().describe("Approximate time in seconds if available, null if not"),
      })
    ).max(5),
  }),
  topics: z
    .array(z.string())
    .describe(
      "3-8 topic tags relevant for search filtering (e.g., 'energy', 'infrastructure', 'corruption', 'regulation')"
    ),
  entities: z.array(
    z.object({
      name: z.string().describe("Full name of the entity"),
      type: z.enum(["PERSON", "COMPANY", "GOVERNMENT", "ORGANIZATION", "LOCATION", "EVENT"]),
      description: z
        .string()
        .nullable()
        .describe("Brief context (e.g., 'Minister of Energy, Nigeria'), null if unknown"),
      sentiment: z
        .enum(["positive", "negative", "neutral"])
        .nullable()
        .describe("How the interview portrays this entity, null if unclear"),
    })
  ),
  relationships: z.array(
    z.object({
      source_name: z
        .string()
        .describe("Name of the source entity (must match an entity in the entities array)"),
      target_name: z
        .string()
        .describe("Name of the target entity (must match an entity in the entities array)"),
      relation_type: z
        .enum([
          "business_partner",
          "competitor",
          "regulator",
          "critic",
          "ally",
          "subsidiary",
          "investor",
          "advisor",
          "supplier",
          "acquirer",
        ])
        .describe("Type of relationship between source and target"),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .describe("Confidence score 0-1 for how clearly the transcript establishes this relationship"),
      evidence_text: z
        .string()
        .nullable()
        .describe("Direct quote or paraphrase from the transcript that establishes this relationship, null if inferred"),
    })
  ),
  risks: z
    .array(z.string())
    .describe("Key risks or threats mentioned in the interview"),
  opportunities: z
    .array(z.string())
    .describe("Key opportunities or positive signals mentioned"),
});

export type ExtractionResult = z.infer<typeof ExtractionSchema>;

/**
 * Extract structured intelligence from a transcript using GPT-4o-mini.
 * Uses Vercel AI SDK's `generateObject` for guaranteed schema conformance.
 */
export async function extractIntelligence({
  transcript,
  interviewTitle,
  country,
  speakerMap,
}: {
  transcript: string;
  interviewTitle: string;
  country?: string;
  speakerMap?: Record<string, string>;
}): Promise<ExtractionResult> {
  const speakerContext = speakerMap
    ? `\nSpeaker identification: ${JSON.stringify(speakerMap)}`
    : "";

  const { object } = await generateObject({
    model: openai(AI_CONFIG.extractionModel),
    schema: ExtractionSchema,
    prompt: `You are an expert political and business intelligence analyst specializing in emerging markets (Global South: Africa, Latin America, Asia).

Analyze the following interview transcript and extract structured intelligence.

Interview: "${interviewTitle}"
${country ? `Country/Region: ${country}` : ""}${speakerContext}

TRANSCRIPT:
${transcript}

INSTRUCTIONS:
- Focus on geopolitical risks, market opportunities, regulatory changes, and power dynamics.
- Extract EVERY named entity (people, companies, government bodies, locations).
- Be precise with sentiment — distinguish between the interviewee's opinion and factual statements.
- Topics should be lowercase, single-word or hyphenated tags useful for database filtering.
- Risks and opportunities should be actionable intelligence, not generic statements.
- RELATIONSHIPS: Identify how entities are connected to each other. For every pair of entities with a discernible relationship, output a relationship edge. Use the exact entity names from the entities array. Include the direct quote that establishes the relationship when possible.`,
  });

  return object;
}
