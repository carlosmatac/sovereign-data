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
import type { EntityType } from "@/types/database";
import { withRetry } from "./retry";

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
          // ── Preferred taxonomy (v2) ─────────────────────────────────
          "supplier",
          "competitor",
          "investor",
          "subsidiary",
          "acquirer",
          "critic",
          "advisor",
          "regulator",
          "affiliated_with",
          "operates_in",
          "governs",
          "customer_of",
          // ── Legacy (kept compatible; prefer values above) ───────────
          "business_partner",
          "ally",
        ])
        .describe(
          "Type of relationship between source and target. Prefer the v2 taxonomy. Selection guidance:\n" +
            "- affiliated_with: PERSON ↔ ORG/COMPANY/GOVERNMENT generic association (employee, director, manager, ministry official, spokesperson, marketing lead, senior staff). Use this — NOT business_partner — for almost every person↔org link.\n" +
            "- operates_in: COMPANY/ORGANIZATION ↔ LOCATION/COUNTRY where the org has operational presence, an office, projects or activity. Use this — NOT business_partner / ally — for org↔country.\n" +
            "- governs: GOVERNMENT/regulator ↔ COMPANY/ORGANIZATION/COUNTRY institutional control (ministry oversight, central bank, regulatory authority).\n" +
            "- customer_of: source buys goods/services from target. Pair with `supplier` (target sells to source).\n" +
            "- supplier: source sells goods/services to target.\n" +
            "- competitor / investor / subsidiary / acquirer / critic / advisor / regulator: only when the transcript clearly establishes that specific dynamic.\n" +
            "- business_partner / ally: legacy generic types; only emit when no other type fits and the transcript explicitly frames it as a partnership/alliance."
        ),
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

// ── Source-type prompt overlays ───────────────────────────────────────────

const SOURCE_OVERLAYS: Record<string, string> = {
  "text+interview":
    "This is a written interview transcript. Speaker labels may appear as 'Q:'/'A:' or name prefixes.",
  "document+interview":
    "This is a PDF interview transcript. It may not have speaker labels; extract intelligence from the narrative.",
  "document+report":
    "This is a report or document source. It may not follow interview structure. Focus on extracting entities, relationships, and intelligence from the content.",
  "document+published_article":
    "This is a published article. Attribution of statements to sources is important; distinguish between the author's voice and quoted entities.",
  "text+published_article":
    "This is a published article. Attribution of statements to sources is important; distinguish between the author's voice and quoted entities.",
};

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
  reviewerSeedEntities,
  sourceType,
  semanticSourceType,
  candidateEntities,
}: {
  transcript: string;
  interviewTitle: string;
  country?: string;
  speakerMap?: Record<string, string>;
  primaryPerson?: string | null;
  primaryOrg?: string | null;
  /** Human-confirmed entities from transcript review — strong inputs for mention + relationship extraction. */
  reviewerSeedEntities?: Array<{
    displayName: string;
    type: EntityType;
  }>;
  /** Technical source type ('audio' | 'document' | 'text'). Used for prompt overlay. */
  sourceType?: string;
  /** Semantic source type ('interview' | 'report' | etc.). Used for prompt overlay. */
  semanticSourceType?: string;
  /** Known project entities to help extraction match existing entities. */
  candidateEntities?: Array<{
    name: string;
    type: EntityType;
    aliases?: string[];
  }>;
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

  // Candidate entities block (project context for better entity matching)
  const candidateEntitiesContext =
    candidateEntities && candidateEntities.length > 0
      ? `\nPROJECT ENTITIES (reference for matching — you may still create new entities if none match):\n` +
        candidateEntities
          .map(
            (e) =>
              `- "${e.name}" (${e.type})${
                e.aliases?.length
                  ? ` [aka: ${e.aliases.join(", ")}]`
                  : ""
              }`
          )
          .join("\n")
      : "";

  // Source-type overlay (only for non-audio or non-interview sources)
  const overlayKey = `${sourceType ?? "audio"}+${semanticSourceType ?? "interview"}`;
  const sourceOverlay = SOURCE_OVERLAYS[overlayKey]
    ? `\nSOURCE NOTE: ${SOURCE_OVERLAYS[overlayKey]}`
    : "";

  const reviewerSeedsContext =
    reviewerSeedEntities && reviewerSeedEntities.length > 0
      ? `\nHUMAN-CONFIRMED ENTITIES (non-optional — you MUST treat these as real entities in this interview):
${reviewerSeedEntities
  .map(
    (s) =>
      `- "${s.displayName}" (type: ${s.type}) — include in your entities array when they appear in the transcript; use this exact spelling as canonical_name when the transcript refers to them. Infer relationships between these and other entities when the transcript supports it, with evidence quotes.`
  )
  .join("\n")}`
      : "";

  const { object } = await withRetry(
    () =>
      generateObject({
        model: openai(AI_CONFIG.extractionModel),
        schema: ExtractionSchema,
        prompt: `You are an expert political and business intelligence analyst specializing in emerging markets (Global South: Africa, Latin America, Asia).

Analyze the following interview transcript and extract structured intelligence.

Interview: "${interviewTitle}"
${country ? `Country/Region: ${country}` : ""}${speakerContext}${primaryEntitiesContext}${candidateEntitiesContext}${sourceOverlay}${reviewerSeedsContext}

TRANSCRIPT:
${transcript}

INSTRUCTIONS:
- Focus on geopolitical risks, market opportunities, regulatory changes, and power dynamics.
- Extract EVERY named entity (people, companies, government bodies, locations).
- For each entity, provide BOTH:
  - raw_name: the name as it appears in the transcript (may contain ASR misspellings)
  - canonical_name: your best guess at the correct full name
- If Primary Entities were provided above, use those exact spellings as canonical_name when you believe a transcript mention refers to them — even if the transcript spells the name differently.
- If PROJECT ENTITIES were listed above, prefer matching those names as canonical_name when the transcript refers to the same entity. You may still create new entities if none of the listed entities match.
- ALWAYS provide a factual description for each entity based on what the transcript reveals. Even a short role or affiliation is valuable.
- Be precise with sentiment — distinguish between the interviewee's opinion and factual statements.
- Topics should be lowercase, single-word or hyphenated tags useful for database filtering.
- Risks and opportunities should be actionable intelligence, not generic statements.
- RELATIONSHIPS: Identify how entities are connected to each other. Use canonical_name values from the entities array. Include the direct quote that establishes the relationship when possible.
- RELATIONSHIP TYPE SELECTION (important — avoid generic catch-all labels):
  * For PERSON ↔ COMPANY / ORGANIZATION / GOVERNMENT: prefer "affiliated_with" (covers executives, directors, managers, ministry officials, spokespersons, marketing leads, senior staff). Do NOT use "business_partner" for a person-to-organisation tie.
  * For COMPANY / ORGANIZATION ↔ LOCATION / COUNTRY: prefer "operates_in" when the org has operational presence, offices, projects, or activity in that location. Do NOT use "business_partner" or "ally" for an organisation-to-country tie.
  * For GOVERNMENT / regulator ↔ COMPANY / ORGANIZATION / COUNTRY: use "governs" when the relationship is institutional control or oversight; use "regulator" when the transcript specifically frames it as a regulatory body.
  * For commercial sales: pair "supplier" (seller → buyer) and "customer_of" (buyer → seller).
  * Only use "business_partner" or "ally" when no other type fits AND the transcript explicitly frames the link as a partnership or alliance.
- If HUMAN-CONFIRMED ENTITIES were listed above, you must not omit them from the entities output when they are discussed in the transcript, and you must actively look for relationships involving them.`,
      }),
    "extractIntelligence"
  );

  return object;
}
