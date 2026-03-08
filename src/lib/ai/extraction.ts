// ============================================
// GPT-4o-mini Extraction — Structured Intel from Transcripts
// ============================================
// Stage 1 of the two-stage pipeline: raw intelligence extraction.
// This stage extracts entities, relationships, and intelligence
// as-they-appear in the transcript, without assuming canonical names.
// Stage 2 (entity resolution) happens downstream in the pipeline.

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { AI_CONFIG } from "@/lib/constants";

const ExtractionSchema = z.object({
  summary: z
    .string()
    .describe(
      "Executive summary of the interview (3-5 sentences). Focus on key decisions, signals, and actionable intelligence."
    ),
  sentiment: z.object({
    overall: z.enum(["positive", "negative", "neutral", "mixed"]),
    score: z
      .number()
      .min(-1)
      .max(1)
      .describe(
        "Sentiment score from -1 (very negative) to 1 (very positive)"
      ),
    highlights: z
      .array(
        z.object({
          text: z
            .string()
            .describe("Quote or paraphrase from the interview"),
          sentiment: z.enum(["positive", "negative", "neutral"]),
          timestamp: z
            .number()
            .nullable()
            .describe(
              "Approximate time in seconds if available, null if not"
            ),
        })
      )
      .max(5),
  }),
  topics: z
    .array(z.string())
    .describe(
      "3-8 topic tags relevant for search filtering (e.g., 'energy', 'infrastructure', 'corruption', 'regulation')"
    ),
  entities: z.array(
    z.object({
      raw_name: z
        .string()
        .describe(
          "The name exactly as it appears or is most commonly referred to in the transcript, including any ASR misspellings"
        ),
      canonical_name: z
        .string()
        .describe(
          "Your best guess at the correct/canonical spelling of this entity's full name. If you're confident the transcript spelling is correct, repeat it. If the primary person or institution was provided, use that exact spelling when you believe the mention refers to them."
        ),
      type: z.enum([
        "PERSON",
        "COMPANY",
        "GOVERNMENT",
        "ORGANIZATION",
        "LOCATION",
        "EVENT",
      ]),
      description: z
        .string()
        .describe(
          "Factual description based on what the transcript reveals (e.g., 'Minister of Energy, Nigeria', 'State-owned oil company in Angola'). Always provide a description if any context is available."
        ),
      sentiment: z
        .enum(["positive", "negative", "neutral"])
        .nullable()
        .describe(
          "How the interview portrays this entity, null if unclear"
        ),
    })
  ),
  relationships: z.array(
    z.object({
      source_name: z
        .string()
        .describe(
          "canonical_name of the source entity (must match a canonical_name in the entities array)"
        ),
      target_name: z
        .string()
        .describe(
          "canonical_name of the target entity (must match a canonical_name in the entities array)"
        ),
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
        .describe(
          "Confidence score 0-1 for how clearly the transcript establishes this relationship"
        ),
      evidence_text: z
        .string()
        .nullable()
        .describe(
          "Direct quote or paraphrase from the transcript that establishes this relationship, null if inferred"
        ),
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
 * Stage 1: Extract raw structured intelligence from a transcript.
 *
 * Entities are extracted with both raw_name (as-heard) and canonical_name
 * (GPT's best guess). Downstream entity resolution (Stage 2) reconciles
 * these against known entities, aliases, and interview anchors.
 */
export async function extractIntelligence({
  transcript,
  interviewTitle,
  country,
  speakerMap,
  primaryPerson,
  primaryOrg,
}: {
  transcript: string;
  interviewTitle: string;
  country?: string;
  speakerMap?: Record<string, string>;
  primaryPerson?: string | null;
  primaryOrg?: string | null;
}): Promise<ExtractionResult> {
  const speakerContext = speakerMap
    ? `\nSpeaker identification: ${JSON.stringify(speakerMap)}`
    : "";
  const primaryEntitiesContext =
    primaryPerson || primaryOrg
      ? `\nPrimary Entities (provided by the uploader — use these exact spellings when the transcript refers to them, even if the transcript misspells them):
- Primary PERSON: ${primaryPerson ?? "unknown"}
- Primary ORG: ${primaryOrg ?? "unknown"}`
      : "";

  const { object } = await generateObject({
    model: openai(AI_CONFIG.extractionModel),
    schema: ExtractionSchema,
    prompt: `You are an expert political and business intelligence analyst specializing in emerging markets (Global South: Africa, Latin America, Asia).

Analyze the following interview transcript and extract structured intelligence.

Interview: "${interviewTitle}"
${country ? `Country/Region: ${country}` : ""}${speakerContext}${primaryEntitiesContext}

TRANSCRIPT:
${transcript}

INSTRUCTIONS:
- Focus on geopolitical risks, market opportunities, regulatory changes, and power dynamics.
- Extract EVERY named entity (people, companies, government bodies, locations).
- For each entity, provide BOTH:
  - raw_name: the name as it appears in the transcript (may contain ASR misspellings)
  - canonical_name: your best guess at the correct full name
- If Primary Entities were provided above, use those exact spellings as canonical_name when you believe a transcript mention refers to them — even if the transcript spells the name differently.
- ALWAYS provide a factual description for each entity based on what the transcript reveals. Even a short role or affiliation is valuable.
- Be precise with sentiment — distinguish between the interviewee's opinion and factual statements.
- Topics should be lowercase, single-word or hyphenated tags useful for database filtering.
- Risks and opportunities should be actionable intelligence, not generic statements.
- RELATIONSHIPS: Identify how entities are connected to each other. Use canonical_name values from the entities array. Include the direct quote that establishes the relationship when possible.`,
  });

  return object;
}
