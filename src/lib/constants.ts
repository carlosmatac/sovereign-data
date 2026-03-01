// ============================================
// Sovereign Data — Application Constants
// ============================================

export const APP_NAME = "Sovereign Data";
export const APP_DESCRIPTION = "Frontier Markets Intelligence Platform";

// Interview processing statuses with UI labels
export const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  UPLOADING: { label: "Uploading", color: "bg-blue-100 text-blue-800" },
  PROCESSING: { label: "Processing", color: "bg-yellow-100 text-yellow-800" },
  TRANSCRIBING: { label: "Transcribing", color: "bg-purple-100 text-purple-800" },
  EXTRACTING: { label: "Extracting Intel", color: "bg-orange-100 text-orange-800" },
  EMBEDDING: { label: "Indexing", color: "bg-indigo-100 text-indigo-800" },
  COMPLETED: { label: "Ready", color: "bg-green-100 text-green-800" },
  FAILED: { label: "Failed", color: "bg-red-100 text-red-800" },
};

// Regions for the Global South focus
export const REGIONS = [
  "West Africa",
  "East Africa",
  "Southern Africa",
  "North Africa",
  "Central Africa",
  "Latin America & Caribbean",
  "Southeast Asia",
  "South Asia",
  "Central Asia",
  "Middle East",
] as const;

// Country → Region mapping for Global South markets
export const COUNTRIES: Record<string, string> = {
  // West Africa
  "Nigeria": "West Africa",
  "Ghana": "West Africa",
  "Senegal": "West Africa",
  "Côte d'Ivoire": "West Africa",
  "Mali": "West Africa",
  "Burkina Faso": "West Africa",
  "Niger": "West Africa",
  "Guinea": "West Africa",
  "Benin": "West Africa",
  "Togo": "West Africa",
  "Sierra Leone": "West Africa",
  "Liberia": "West Africa",
  "Mauritania": "West Africa",
  "The Gambia": "West Africa",
  "Guinea-Bissau": "West Africa",
  "Cape Verde": "West Africa",
  // East Africa
  "Kenya": "East Africa",
  "Ethiopia": "East Africa",
  "Tanzania": "East Africa",
  "Uganda": "East Africa",
  "Rwanda": "East Africa",
  "Burundi": "East Africa",
  "Somalia": "East Africa",
  "South Sudan": "East Africa",
  "Eritrea": "East Africa",
  "Djibouti": "East Africa",
  "Madagascar": "East Africa",
  "Mauritius": "East Africa",
  "Seychelles": "East Africa",
  "Comoros": "East Africa",
  // Southern Africa
  "South Africa": "Southern Africa",
  "Angola": "Southern Africa",
  "Mozambique": "Southern Africa",
  "Zambia": "Southern Africa",
  "Zimbabwe": "Southern Africa",
  "Namibia": "Southern Africa",
  "Botswana": "Southern Africa",
  "Malawi": "Southern Africa",
  "Lesotho": "Southern Africa",
  "Eswatini": "Southern Africa",
  // North Africa
  "Egypt": "North Africa",
  "Morocco": "North Africa",
  "Algeria": "North Africa",
  "Tunisia": "North Africa",
  "Libya": "North Africa",
  "Sudan": "North Africa",
  // Central Africa
  "Democratic Republic of the Congo": "Central Africa",
  "Republic of the Congo": "Central Africa",
  "Cameroon": "Central Africa",
  "Gabon": "Central Africa",
  "Equatorial Guinea": "Central Africa",
  "Central African Republic": "Central Africa",
  "Chad": "Central Africa",
  "São Tomé and Príncipe": "Central Africa",
  // Latin America & Caribbean
  "Brazil": "Latin America & Caribbean",
  "Mexico": "Latin America & Caribbean",
  "Colombia": "Latin America & Caribbean",
  "Argentina": "Latin America & Caribbean",
  "Chile": "Latin America & Caribbean",
  "Peru": "Latin America & Caribbean",
  "Ecuador": "Latin America & Caribbean",
  "Venezuela": "Latin America & Caribbean",
  "Bolivia": "Latin America & Caribbean",
  "Paraguay": "Latin America & Caribbean",
  "Uruguay": "Latin America & Caribbean",
  "Guyana": "Latin America & Caribbean",
  "Suriname": "Latin America & Caribbean",
  "Panama": "Latin America & Caribbean",
  "Costa Rica": "Latin America & Caribbean",
  "Guatemala": "Latin America & Caribbean",
  "Honduras": "Latin America & Caribbean",
  "El Salvador": "Latin America & Caribbean",
  "Nicaragua": "Latin America & Caribbean",
  "Dominican Republic": "Latin America & Caribbean",
  "Cuba": "Latin America & Caribbean",
  "Jamaica": "Latin America & Caribbean",
  "Haiti": "Latin America & Caribbean",
  "Trinidad and Tobago": "Latin America & Caribbean",
  // Southeast Asia
  "Indonesia": "Southeast Asia",
  "Philippines": "Southeast Asia",
  "Vietnam": "Southeast Asia",
  "Thailand": "Southeast Asia",
  "Malaysia": "Southeast Asia",
  "Myanmar": "Southeast Asia",
  "Cambodia": "Southeast Asia",
  "Laos": "Southeast Asia",
  "Singapore": "Southeast Asia",
  "Timor-Leste": "Southeast Asia",
  // South Asia
  "India": "South Asia",
  "Bangladesh": "South Asia",
  "Pakistan": "South Asia",
  "Sri Lanka": "South Asia",
  "Nepal": "South Asia",
  "Afghanistan": "South Asia",
  "Maldives": "South Asia",
  "Bhutan": "South Asia",
  // Central Asia
  "Kazakhstan": "Central Asia",
  "Uzbekistan": "Central Asia",
  "Turkmenistan": "Central Asia",
  "Kyrgyzstan": "Central Asia",
  "Tajikistan": "Central Asia",
  "Mongolia": "Central Asia",
  // Middle East
  "Saudi Arabia": "Middle East",
  "United Arab Emirates": "Middle East",
  "Qatar": "Middle East",
  "Kuwait": "Middle East",
  "Bahrain": "Middle East",
  "Oman": "Middle East",
  "Iraq": "Middle East",
  "Iran": "Middle East",
  "Jordan": "Middle East",
  "Lebanon": "Middle East",
  "Yemen": "Middle East",
  "Syria": "Middle East",
  "Turkey": "Middle East",
  "Israel": "Middle East",
  "Palestine": "Middle East",
};

export const COUNTRY_LIST = Object.keys(COUNTRIES).sort();

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
