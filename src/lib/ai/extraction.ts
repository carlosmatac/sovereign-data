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
import {
  ACTIVE_RELATION_TYPE_VALUES,
  ENTITY_TYPE_VALUES,
  type EntityType,
  type RelationType,
} from "@/types/database";
import { withRetry } from "./retry";

export const EntityTypeSchema = z.enum(ENTITY_TYPE_VALUES);

/** Active canonical relation types for LLM structured output (no deprecated/legacy). */
const ACTIVE_RELATION_TYPES = ACTIVE_RELATION_TYPE_VALUES as unknown as [
  RelationType,
  ...RelationType[],
];

/** Prompt block for relationship extraction (Phase 3b). */
const RELATIONSHIP_EXTRACTION_GUIDANCE = `
RELATIONSHIPS — extract typed, directional edges between entities using canonical_name values from your entities array.

COMPLETENESS RULE: For every PERSON–ORG pair and every ORG–LOCATION pair that appear together in this source, you MUST extract a relationship. Omitting an obvious connection is a critical extraction error. If evidence is ambiguous, use works_at (person↔org) or has_presence_in (org↔location) with low confidence rather than omitting the relationship.

DIRECTION RULE: Relationships are directional. source_name is the entity that holds the role or takes the action; target_name is the entity the role/action is directed at.
Examples: Person → is_ceo_of → Company (person holds the CEO role); Company → has_presence_in → Country (company has presence in country). Do not reverse these directions.

EVIDENCE RULE: evidence_text must be a direct quote or paraphrase from the source for any relationship with confidence ≥ 0.7. For confidence < 0.7, null is acceptable. Inferred relationships with no textual support must have confidence < 0.5.

TYPE SELECTION (use the most specific type that fits):
- Employment/role: works_at, leads, is_ceo_of, is_cfo_of, is_cto_of, is_coo_of, is_cmo_of, is_cso_of, is_board_member_of, is_member_of, founded, advisor, represents
- Ownership/control: is_direct_parent_of, is_ultimate_parent_of, invested_in, is_beneficial_owner_of, is_controlled_person_of
- Geography: has_headquarters_in, has_presence_in, is_registered_in, located_in, within, has_nationality, native_to
- Governance/regulation: has_jurisdiction, operates_in_industry
- Events/activities: spoke_at, participates_in_corporate_event, studied_at, featured_in
- Markets/finance: listed_on, traded_on
- Products/works: manufactured_by, published_by, created_by, designed_by, operated_by
- Commercial: supplier, customer_of, competitor, acquirer, critic
- Generic fallback: affiliated_with (person↔org when no specific employment/role type fits)

DO NOT use business_partner or ally — they are legacy types not available for new extraction.
DO NOT use operates_in — use has_presence_in (org in location/country) or operates_in_industry (org in sector) instead.
DO NOT extract a relationship based solely on two entities being mentioned in the same paragraph — there must be explicit interaction or association in the text.`;

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
      type: EntityTypeSchema,
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
        .enum(ACTIVE_RELATION_TYPES)
        .describe(
          "Canonical directed relationship type from the active taxonomy. " +
            "source_name holds the role or takes the action; target_name is the object. " +
            "Prefer specific types (is_ceo_of, has_presence_in) over generic affiliated_with."
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
  // PR 2.3: source-level associations.
  // These describe the SOURCE-as-a-whole (this document / interview / report),
  // not chunk-level mentions. The pipeline only persists rows with
  // confidence ≥ 0.9 to keep precision high.
  //
  // NOTE: This MUST be a required array (not `.optional()` / not
  // `.default([])`) because OpenAI's structured-output strict mode
  // requires every property to appear in JSON Schema `required`.
  // The model is instructed to emit `[]` when no source-level
  // association applies — same convention as `entities`,
  // `relationships`, `risks`, `opportunities` above.
  source_associations: z
    .array(
      z.object({
        name: z
          .string()
          .describe(
            "canonical_name of the entity (must match a canonical_name in the entities array)"
          ),
        link_type: z
          .enum(["author", "primary_subject", "subject_organization"])
          .describe(
            "How this entity relates to the SOURCE itself, not to other entities. " +
              "author: explicitly authored, signed, or by-lined this source. " +
              "primary_subject: the source-as-a-whole is centrally about this person/entity (interviewee in an interview, profile subject in a profile piece). " +
              "subject_organization: the source-as-a-whole is centrally about this organization."
          ),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .describe(
            "0–1 confidence that the source-as-a-whole is by/about this entity. " +
              "Only emit when ≥ 0.9; lower-confidence guesses should NOT be in this list."
          ),
        evidence_text: z
          .string()
          .nullable()
          .describe(
            "Short quote or paraphrase that justifies the link (byline line, opening framing, etc.), null if structurally implicit"
          ),
      })
    )
    .describe(
      "Source-level associations. Use sparingly: at most one author and one primary_subject (and optionally one subject_organization) per source. Emit an empty array ([]) when the source is a generic article or panel that isn't 'about' a single person/org."
    ),
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

const ENTITY_TYPE_GUIDANCE_BASE = `ENTITY TYPE SELECTION (important — use the most specific type available):
- PERSON: named individual people only. Do not use for job titles or roles by themselves.
- COMPANY: private companies and commercial firms that are not primarily state-owned.
- GOVERNMENT: national/subnational government as an actor or administration when no specific institution is named.
- ORGANIZATION: NGOs, associations, multilaterals, non-company institutions that do not fit a more specific type.
- LOCATION: cities, regions, physical places, ports, fields, corridors, or non-country geography.
- EVENT: named conferences, elections, meetings, crises, or time-bounded happenings. Do not use for laws/policies.
- COUNTRY: sovereign countries or country actors (e.g. Nigeria, Ghana, Colombia). Prefer COUNTRY over GOVERNMENT/LOCATION for country names.
- SECTOR: economic sectors such as energy, telecoms, agriculture, mining, banking, or infrastructure.
- COMMODITY: traded resources/materials such as natural gas, oil, cocoa, lithium, copper, gold, or wheat.
- PUBLIC_INSTITUTION: ministries, regulators, agencies, central banks, commissions, courts, public authorities.
- STATE_OWNED_ENTERPRISE: state-controlled companies/utilities such as NNPC, TCN, national oil companies, public power utilities.
- LAW_OR_POLICY: laws, acts, reforms, tariffs, subsidy policies, regulations, policy frameworks (e.g. Petroleum Industry Act).
- MEDIA_OR_PUBLICATION: media outlets, publishers, newspapers, wire services, publications (e.g. Reuters, FT, Portafolio).`;

const THEMATIC_ENTITY_TYPE_GUIDANCE = `
- TOPIC: a substantive named theme or subject area discussed at length in this source (e.g. "Energy Transition", "Fiscal Reform", "Digital Infrastructure Policy"). Use for cross-cutting themes that deserve their own entity row so they can be linked across sources. Do NOT use for the short filter tags in the topics[] array — those remain lowercase single words. Only emit TOPIC when the interview dedicates significant discussion to a recognizable named theme.
- RISK: a named, specific risk or threat identified in the source that can be tracked across interviews (e.g. "Regulatory Uncertainty in Angola", "Currency Devaluation Risk", "Supply Chain Disruption"). Must be a distinct named risk, not a generic worry. Emit at most 3–4 RISK entities per source.
- OPPORTUNITY: a named, specific opportunity or positive prospect that can be tracked across sources (e.g. "LNG Export Corridor to Europe", "Green Hydrogen Investment", "Digital Payments Expansion"). Must be a distinct named opportunity. Emit at most 3–4 OPPORTUNITY entities per source.
- PROJECT: a named real-world project, initiative, or programme mentioned in the source (e.g. "Trans-Saharan Gas Pipeline", "Dangote Refinery", "National Broadband Policy"). Distinct from Aksum workspace projects. Use when a project is named and discussed substantively.`;

export function buildEntityTypeGuidance(topicEntitiesEnabled: boolean): string {
  return topicEntitiesEnabled
    ? ENTITY_TYPE_GUIDANCE_BASE + THEMATIC_ENTITY_TYPE_GUIDANCE
    : ENTITY_TYPE_GUIDANCE_BASE;
}

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
  topicEntitiesEnabled = true,
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
  /**
   * Phase 4b flag — when true (default), emit TOPIC/RISK/OPPORTUNITY/PROJECT
   * as entity types in addition to keeping topics[]/risks[]/opportunities[] as
   * denormalized string-array fallback. Set false to revert to pre-4b behaviour.
   */
  topicEntitiesEnabled?: boolean;
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

  const entityTypeGuidance = buildEntityTypeGuidance(topicEntitiesEnabled);

  const thematicEntitiesBlock = topicEntitiesEnabled
    ? `
- THEMATIC ENTITIES (TOPIC / RISK / OPPORTUNITY / PROJECT — Phase 4b):
  * These are ADDITIONAL to the topics[], risks[], and opportunities[] string arrays, which remain as short filter tags. Do NOT replace those arrays.
  * Emit TOPIC entities for substantive named themes the source discusses at length (e.g. "Energy Transition", "Fiscal Reform"). Use only when a theme is discussed in depth, not for passing mentions.
  * Emit RISK entities for named specific risks (e.g. "Regulatory Uncertainty in Angola"). Limit to the 3–4 most prominent risks.
  * Emit OPPORTUNITY entities for named specific opportunities (e.g. "LNG Export Corridor to Europe"). Limit to the 3–4 most prominent.
  * Emit PROJECT entities for named real-world projects/initiatives (e.g. "Trans-Saharan Gas Pipeline"). Only emit when a project is named and substantively discussed.
  * For TOPIC/RISK/OPPORTUNITY/PROJECT entities: link to people/orgs with works_at or affiliated_with; link projects to countries/locations with has_presence_in or located_in.
  * Keep descriptions informative: what this topic/risk/opportunity/project is, in the context of this source.`
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
- ${entityTypeGuidance}
- For each entity, provide BOTH:
  - raw_name: the name as it appears in the transcript (may contain ASR misspellings)
  - canonical_name: your best guess at the correct full name
- If Primary Entities were provided above, use those exact spellings as canonical_name when you believe a transcript mention refers to them — even if the transcript spells the name differently.
- If PROJECT ENTITIES were listed above, prefer matching those names as canonical_name when the transcript refers to the same entity. You may still create new entities if none of the listed entities match.
- ALWAYS provide a factual description for each entity based on what the transcript reveals. Even a short role or affiliation is valuable.
- Be precise with sentiment — distinguish between the interviewee's opinion and factual statements.
- topics[]: lowercase, single-word or hyphenated tags useful for database filtering (e.g. "energy", "regulation"). Keep this array as short filter tags; do not put full sentences here.
- risks[]: short actionable risk descriptions (2–10 words each). Keep as string tags; named risks are also captured as RISK entities when topicEntitiesEnabled.
- opportunities[]: short actionable opportunity descriptions (2–10 words each). Keep as string tags; named opportunities also captured as OPPORTUNITY entities when enabled.
- RELATIONSHIPS: Identify how entities are connected. Use canonical_name values from the entities array.
${RELATIONSHIP_EXTRACTION_GUIDANCE}
- If HUMAN-CONFIRMED ENTITIES were listed above, you must not omit them from the entities output when they are discussed in the transcript, and you must actively look for relationships involving them.${thematicEntitiesBlock}
- SOURCE-LEVEL ASSOCIATIONS (source_associations):
  * Distinct from entities/relationships: these describe the SOURCE itself, not links between entities.
  * Use ONLY when the source-as-a-whole is clearly about / by an entity. Examples:
    - An interview transcript whose interviewee is "Raji Bashir" → source_associations: [{ name: "Raji Bashir", link_type: "primary_subject", confidence: 0.95, evidence_text: "(speaker labels, opening intro)" }].
    - An article whose byline is "By Carlos Ruiz" → source_associations: [{ name: "Carlos Ruiz", link_type: "author", confidence: 0.97, evidence_text: "By Carlos Ruiz" }].
    - A company profile of "ANPG" → source_associations: [{ name: "ANPG", link_type: "subject_organization", confidence: 0.95, evidence_text: "ANPG, the National Oil, Gas and Biofuels Agency, ..." }].
  * Use VERY sparingly. At most: one author + one primary_subject (and optionally one subject_organization).
  * Confidence must be ≥ 0.9 — lower-confidence guesses should be omitted entirely. The pipeline drops anything below the threshold.
  * "name" must equal a canonical_name in your entities array (so downstream resolution can map it to an entity ID).
  * If the source is a generic article, a panel discussion, or a multi-speaker piece with no clear "subject", **return an empty array [] for source_associations** — do not omit the field.`,
      }),
    "extractIntelligence"
  );

  return object;
}
