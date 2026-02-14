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
