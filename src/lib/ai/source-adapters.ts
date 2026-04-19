// ============================================
// Source Adapters — CanonicalSourceInput type
// ============================================
// Defines the canonical shape that all ingestion sources
// (audio, document, text) normalise into before calling
// runIntelPipelineFromCanonicalSource.

import type { EntityType, SpeakerMap } from "@/types/database";
import type { TranscriptUtterance } from "./chunking";
import type { TextStructureType } from "./chunking-text-interview";

export interface CanonicalSourceInput {
  interviewId: string;
  /** Technical format of the source material. */
  sourceType: "audio" | "document" | "text";
  /** Semantic category (e.g. 'interview', 'report', 'published_article'). */
  semanticSourceType: string;
  /** Full text used for extraction (may be derived from utterances). */
  rawText: string;
  /** Display-normalised text stored in transcript_display. */
  displayText: string;
  /** Utterance array — empty for non-audio sources. */
  chunkUtterances: TranscriptUtterance[];
  speakerMap: SpeakerMap;
  language: string;
  title: string;
  country?: string;
  projectId: string;
  anchors: {
    intervieweeName: string | null;
    intervieweeOrg: string | null;
    intervieweeEntityId?: string | null;
    intervieweeOrgEntityId?: string | null;
  };
  /** Structured metadata (e.g. detected structure_type for text sources, num_pages for PDFs). */
  sourceMetadata?: {
    structure_type?: TextStructureType;
    [key: string]: unknown;
  };
  // ── Pipeline control ───────────────────────────────────────
  clearDerivedBeforeInsert: boolean;
  lastIntelSource: "assemblyai_auto" | "human_review" | "direct_ingest";
  reviewerSeedsForExtraction?: Array<{ displayName: string; type: EntityType }>;
  reviewerSeedsForMerge?: Array<{
    display_name: string;
    entity_type: EntityType;
    entity_id: string | null;
  }>;
  completedInterviewExtra?: Record<string, unknown>;
}
