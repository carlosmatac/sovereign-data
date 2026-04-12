// ============================================
// Sovereign Data — Application Constants
// ============================================

export const APP_NAME = "Sovereign Data";
export const APP_DESCRIPTION = "Frontier Markets Intelligence Platform";

// Interview processing statuses with UI labels and badge variants
export const STATUS_LABELS: Record<
  string,
  { label: string; variant: "success" | "warning" | "destructive-soft" | "secondary" }
> = {
  UPLOADING: { label: "Uploading", variant: "warning" },
  PROCESSING: { label: "Processing", variant: "warning" },
  TRANSCRIBING: { label: "Transcribing", variant: "warning" },
  EXTRACTING: { label: "Extracting Intel", variant: "warning" },
  EMBEDDING: { label: "Indexing", variant: "warning" },
  COMPLETED: { label: "Ready", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive-soft" },
};

/** Country list + region buckets for projects — generated; see `country-region-data.ts`. */
export {
  REGIONS,
  COUNTRIES,
  COUNTRY_LIST,
} from "./country-region-data";

// AI pipeline config
export const AI_CONFIG = {
  embeddingModel: "text-embedding-3-small" as const,
  embeddingDimensions: 1536,
  extractionModel: "gpt-4o-mini" as const,
  chunkSize: 500, // target tokens per chunk
  chunkOverlap: 50, // overlapping tokens between chunks
  similarityThreshold: 0.25,
  maxSearchResults: 10,
} as const;

// Speaker diarization — expected speaker count range for AssemblyAI `speakers_expected`
export const MIN_EXPECTED_SPEAKERS = 1;
export const MAX_EXPECTED_SPEAKERS = 8;

/**
 * Validate and parse an `expectedSpeakers` value from user input.
 * Returns the validated integer, or `null` if the value represents "Auto".
 * Throws a descriptive error string if the value is present but invalid.
 */
export function parseExpectedSpeakers(
  value: unknown
): number | null {
  if (value === undefined || value === null || value === "") return null;

  const num = typeof value === "string" ? parseInt(value, 10) : Number(value);

  if (!Number.isInteger(num)) {
    throw new Error(
      `expectedSpeakers must be an integer (received "${value}")`
    );
  }
  if (num < MIN_EXPECTED_SPEAKERS || num > MAX_EXPECTED_SPEAKERS) {
    throw new Error(
      `expectedSpeakers must be between ${MIN_EXPECTED_SPEAKERS} and ${MAX_EXPECTED_SPEAKERS} (received ${num})`
    );
  }

  return num;
}

// Supported audio formats
export const SUPPORTED_AUDIO_FORMATS = [
  "audio/mpeg",      // .mp3
  "audio/mp4",       // .m4a
  "audio/wav",       // .wav
  "audio/webm",      // .webm
  "audio/ogg",       // .ogg
  "audio/x-m4a",     // .m4a alternative
] as const;

export const MAX_AUDIO_SIZE_MB = 500;
export const MAX_AUDIO_SIZE_BYTES = MAX_AUDIO_SIZE_MB * 1024 * 1024;

// PDF document interview limits
export const MAX_PDF_SIZE_MB = 50;
export const MAX_PDF_SIZE_BYTES = MAX_PDF_SIZE_MB * 1024 * 1024;
export const MIN_PDF_TEXT_LENGTH = 100;

/** Max length for optional interviewee job title on upload (metadata only). */
export const MAX_INTERVIEWEE_TITLE_LENGTH = 200;

/** Semantic classification values for interviews — stored in interviews.semantic_source_type. */
export const SEMANTIC_SOURCE_TYPES = {
  INTERVIEW: "interview",
  REPORT: "report",
  INTERNAL_NOTE: "internal_note",
  PUBLISHED_ARTICLE: "published_article",
  OTHER: "other",
} as const;

export type SemanticSourceType =
  (typeof SEMANTIC_SOURCE_TYPES)[keyof typeof SEMANTIC_SOURCE_TYPES];

// Report templates
export const REPORT_TEMPLATES = {
  country_risk: {
    label: "Country Risk Assessment",
    description:
      "Political, economic, and operational risk analysis for a specific country based on interview intelligence.",
    icon: "Shield",
    sections: [
      "Executive Summary",
      "Political Risk",
      "Economic Risk",
      "Operational Risk",
      "Key Actors & Relationships",
      "Outlook & Recommendations",
    ],
  },
  sector_analysis: {
    label: "Sector Analysis",
    description:
      "Deep-dive into a specific industry sector with competitive landscape, trends, and opportunities.",
    icon: "TrendingUp",
    sections: [
      "Executive Summary",
      "Market Overview",
      "Key Players",
      "Trends & Drivers",
      "Competitive Landscape",
      "Opportunities & Risks",
      "Strategic Recommendations",
    ],
  },
  entity_profile: {
    label: "Entity Profile",
    description:
      "Comprehensive dossier on a person, company, or organization based on interview mentions.",
    icon: "User",
    sections: [
      "Profile Overview",
      "Key Relationships",
      "Sentiment Analysis",
      "Notable Quotes & Context",
      "Risk Flags",
      "Assessment",
    ],
  },
  executive_briefing: {
    label: "Executive Briefing",
    description:
      "High-level synthesis across multiple interviews for leadership decision-making.",
    icon: "FileText",
    sections: [
      "Key Findings",
      "Strategic Implications",
      "Market Intelligence",
      "Relationship Map",
      "Recommended Actions",
    ],
  },
  custom: {
    label: "Custom Report",
    description:
      "Free-form intelligence report with a custom focus area you define.",
    icon: "Pencil",
    sections: [],
  },
} as const;
