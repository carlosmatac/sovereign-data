// ============================================
// Sovereign Data — Database Types
// ============================================
// This file defines the Supabase Database type for full type safety.
// In production, regenerate with: npx supabase gen types typescript --local

export type InterviewStatus =
  | "UPLOADING"
  | "PROCESSING"
  | "TRANSCRIBING"
  | "EXTRACTING"
  | "EMBEDDING"
  | "COMPLETED"
  | "FAILED";

/**
 * Canonical entity type list, kept in sync with the PostgreSQL `entity_type`
 * enum. UIs, API allowlists, Zod schemas, and entity helpers should consume
 * this constant instead of duplicating local arrays.
 */
export const ENTITY_TYPE_VALUES = [
  "PERSON",
  "COMPANY",
  "GOVERNMENT",
  "ORGANIZATION",
  "LOCATION",
  "EVENT",
  "COUNTRY",
  "SECTOR",
  "COMMODITY",
  "PUBLIC_INSTITUTION",
  "STATE_OWNED_ENTERPRISE",
  "LAW_OR_POLICY",
  "MEDIA_OR_PUBLICATION",
] as const;

export type EntityType = (typeof ENTITY_TYPE_VALUES)[number];

const ENTITY_TYPE_SET: ReadonlySet<string> = new Set(ENTITY_TYPE_VALUES);

export function isEntityType(value: unknown): value is EntityType {
  return typeof value === "string" && ENTITY_TYPE_SET.has(value);
}

/**
 * Entity types that behave like organizations/institutions for upload anchors,
 * position prefetch, and broad person↔institution relationship semantics.
 */
export const ORG_LIKE_ENTITY_TYPES = [
  "COMPANY",
  "GOVERNMENT",
  "ORGANIZATION",
  "PUBLIC_INSTITUTION",
  "STATE_OWNED_ENTERPRISE",
  "MEDIA_OR_PUBLICATION",
] as const satisfies ReadonlyArray<EntityType>;

const ORG_LIKE_ENTITY_TYPE_SET: ReadonlySet<string> = new Set(ORG_LIKE_ENTITY_TYPES);

export function isOrgLikeEntityType(
  value: unknown
): value is (typeof ORG_LIKE_ENTITY_TYPES)[number] {
  return typeof value === "string" && ORG_LIKE_ENTITY_TYPE_SET.has(value);
}

export type UserRole = "owner" | "editor" | "viewer";

/** Platform-wide role (distinct from `project_members.role`). */
export type PlatformRole = "member" | "platform_admin" | "superuser";

export type RelationType =
  // ── Preferred taxonomy (v2, migration 00024) ─────────────────────────────
  | "supplier"
  | "competitor"
  | "investor"
  | "subsidiary"
  | "acquirer"
  | "critic"
  | "advisor"
  | "regulator"
  | "affiliated_with"
  | "operates_in"
  | "governs"
  | "customer_of"
  // ── Legacy (kept for existing rows; new extractions discouraged) ─────────
  | "business_partner"
  | "ally";

/**
 * Canonical list of relation types, kept in sync with the DB enum.
 *
 * Order matters: the **preferred v2 taxonomy** is listed first so any UI
 * that iterates this constant (e.g. the relation-type dropdown on the
 * interview detail page) surfaces the better labels above the legacy ones.
 *
 * Legacy values (`business_partner`, `ally`) remain valid so historical
 * rows render naturally, but extraction guidance prefers the v2 values.
 */
export const RELATION_TYPE_VALUES = [
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
  "business_partner",
  "ally",
] as const satisfies ReadonlyArray<RelationType>;

/** Editorial state on `entity_relationships` (added in migration 00023). */
export type RelationshipReviewStatus = "pending" | "approved" | "rejected";
export type RelationshipOrigin = "llm" | "human_created" | "human_edited";

/**
 * Source-level (source, entity) association layer (added in migration 00028).
 *
 * `link_type` describes WHAT the link is; `origin` describes HOW it was
 * learned. The `source_entities` table allows multiple provenance rows
 * for the same logical association via `UNIQUE(source_id, entity_id,
 * link_type, origin)`.
 */
export type SourceEntityLinkType =
  | "interviewee"
  | "interviewee_org"
  | "interviewer"
  | "translator"
  | "participant"
  | "author"
  | "primary_subject"
  | "subject_organization"
  | "account"
  | "source_owner"
  | "mentioned_at_source_level"
  | "related_entity";

export type SourceEntityOrigin =
  | "upload_anchor"
  | "metadata_import"
  | "extraction"
  | "crm_import"
  | "manual_tag"
  | "ai_inference"
  | "human_review"
  | "alias_propagation"
  | "prior_context";

/**
 * Review statuses that count as **active** in the operational graph
 * (Network Explorer edges + connections panel, chat-tool relationship
 * lookups, report intelligence, dashboard counts).
 *
 * `rejected` is intentionally excluded — rejected rows survive in the DB
 * for editorial workflows (interview-detail review UI, suppression on
 * reprocess) but must not appear as active relationships anywhere else.
 */
export const ACTIVE_RELATIONSHIP_REVIEW_STATUSES: readonly RelationshipReviewStatus[] = [
  "pending",
  "approved",
];

export type SourceType = "audio" | "document" | "video" | "text";

export type SnippetPlatform = "linkedin" | "twitter" | "newsletter" | "summary";
export type SnippetTone = "professional" | "casual" | "provocative";
export type SnippetStatus = "draft" | "approved" | "published";

export type ReportStatus = "generating" | "completed" | "failed";
export type ReportTemplate =
  | "country_risk"
  | "sector_analysis"
  | "entity_profile"
  | "executive_briefing"
  | "custom";

export type TranscriptReviewStatus = "none" | "draft" | "ready" | "reprocessing";

export type PositionState =
  | "active"
  | "ended"
  | "pending_review"
  | "uncertain";

export type DatePrecision = "exact" | "approximate" | "unknown";

export type ChatMessageRole = "user" | "assistant";

// ============================================
// JSON Column Types
// ============================================

/**
 * Stored in `interviews.reviewed_utterances`.
 * `start` / `end` are **seconds** (wall-clock, same as HTMLMediaElement.currentTime).
 */
export interface ReviewedUtterance {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

/** Stored in `interviews.source_utterances` — immutable ASR rows; **milliseconds** (AssemblyAI). */
export interface SourceUtterance {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

export interface SpeakerMap {
  [speakerLabel: string]: string;
}

export interface SentimentData {
  overall: "positive" | "negative" | "neutral" | "mixed";
  score: number;
  highlights: Array<{
    text: string;
    sentiment: "positive" | "negative" | "neutral";
    timestamp?: number | null;
  }>;
}

export interface ChunkMetadata {
  country?: string;
  topics?: string[];
  entities?: string[];
  speaker_role?: string;

  // ── Anchor-aware normalization layer ──────────────────────────
  // Raw evidence lives in interview_chunks.content (never mutated).
  // Prefer anchor enrichment over speculative text replacement.
  normalized_content?: string;
  content_for_embedding?: string;
  normalization_applied?: boolean;
  normalization_confidence?: "high" | "medium" | "low";
  primary_person_name?: string | null;
  primary_org_name?: string | null;
  primary_person_entity_id?: string | null;
  primary_org_entity_id?: string | null;

  [key: string]: unknown;
}

// ============================================
// Supabase Database Type
// ============================================

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          country: string | null;
          region: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          country?: string | null;
          region?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          country?: string | null;
          region?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      project_members: {
        Row: {
          id: string;
          project_id: string;
          user_id: string | null;
          role: UserRole;
          invited_email: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          user_id?: string | null;
          role?: UserRole;
          invited_email?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          user_id?: string | null;
          role?: UserRole;
          invited_email?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      interviews: {
        Row: {
          id: string;
          project_id: string;
          title: string;
          description: string | null;
          audio_url: string | null;
          audio_duration: number | null;
          status: InterviewStatus;
          error_message: string | null;
          speaker_map: SpeakerMap;
          transcript_full: string | null;
          transcript_display: string | null;
          source_utterances: SourceUtterance[] | null;
          summary: string | null;
          sentiment: SentimentData | null;
          topics: string[] | null;
          assemblyai_id: string | null;
          language: string;
          interviewee_name: string | null;
          interviewee_org: string | null;
          interviewee_title: string | null;
          interviewee_entity_id: string | null;
          interviewee_org_entity_id: string | null;
          source_type: SourceType;
          semantic_source_type: string | null;
          source_metadata: Record<string, unknown> | null;
          expected_speakers: number | null;
          conducted_at: string | null;
          reviewed_utterances: ReviewedUtterance[] | null;
          transcript_review_status: TranscriptReviewStatus;
          last_intel_source: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          title: string;
          description?: string | null;
          audio_url?: string | null;
          audio_duration?: number | null;
          status?: InterviewStatus;
          error_message?: string | null;
          speaker_map?: SpeakerMap;
          transcript_full?: string | null;
          transcript_display?: string | null;
          source_utterances?: SourceUtterance[] | null;
          summary?: string | null;
          sentiment?: SentimentData | null;
          topics?: string[] | null;
          assemblyai_id?: string | null;
          language?: string;
          interviewee_name?: string | null;
          interviewee_org?: string | null;
          interviewee_title?: string | null;
          interviewee_entity_id?: string | null;
          interviewee_org_entity_id?: string | null;
          source_type?: SourceType;
          semantic_source_type?: string | null;
          source_metadata?: Record<string, unknown> | null;
          expected_speakers?: number | null;
          conducted_at?: string | null;
          reviewed_utterances?: ReviewedUtterance[] | null;
          transcript_review_status?: TranscriptReviewStatus;
          last_intel_source?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          title?: string;
          description?: string | null;
          audio_url?: string | null;
          audio_duration?: number | null;
          status?: InterviewStatus;
          error_message?: string | null;
          speaker_map?: SpeakerMap;
          transcript_full?: string | null;
          transcript_display?: string | null;
          source_utterances?: SourceUtterance[] | null;
          summary?: string | null;
          sentiment?: SentimentData | null;
          topics?: string[] | null;
          assemblyai_id?: string | null;
          language?: string;
          interviewee_name?: string | null;
          interviewee_org?: string | null;
          interviewee_title?: string | null;
          interviewee_entity_id?: string | null;
          interviewee_org_entity_id?: string | null;
          source_type?: SourceType;
          semantic_source_type?: string | null;
          source_metadata?: Record<string, unknown> | null;
          expected_speakers?: number | null;
          conducted_at?: string | null;
          reviewed_utterances?: ReviewedUtterance[] | null;
          transcript_review_status?: TranscriptReviewStatus;
          last_intel_source?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "interviews_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interviews_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interviews_interviewee_entity_id_fkey";
            columns: ["interviewee_entity_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interviews_interviewee_org_entity_id_fkey";
            columns: ["interviewee_org_entity_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
        ];
      };
      /**
       * Canonical source table after Phase 2.1 (`interviews` is kept as a
       * read-only back-compat view for one release).
       */
      sources: Database["public"]["Tables"]["interviews"];
      interview_review_entities: {
        Row: {
          id: string;
          interview_id: string;
          entity_id: string | null;
          display_name: string;
          entity_type: EntityType;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          interview_id: string;
          entity_id?: string | null;
          display_name: string;
          entity_type: EntityType;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          interview_id?: string;
          entity_id?: string | null;
          display_name?: string;
          entity_type?: EntityType;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "interview_review_entities_interview_id_fkey";
            columns: ["interview_id"];
            isOneToOne: false;
            referencedRelation: "interviews";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interview_review_entities_entity_id_fkey";
            columns: ["entity_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interview_review_entities_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      interview_chunks: {
        Row: {
          id: string;
          interview_id: string;
          chunk_index: number;
          content: string;
          speaker: string | null;
          start_time: number | null;
          end_time: number | null;
          embedding: string | null;
          metadata: ChunkMetadata;
          created_at: string;
        };
        Insert: {
          id?: string;
          interview_id: string;
          chunk_index: number;
          content: string;
          speaker?: string | null;
          start_time?: number | null;
          end_time?: number | null;
          embedding?: string | null;
          metadata?: ChunkMetadata;
          created_at?: string;
        };
        Update: {
          id?: string;
          interview_id?: string;
          chunk_index?: number;
          content?: string;
          speaker?: string | null;
          start_time?: number | null;
          end_time?: number | null;
          embedding?: string | null;
          metadata?: ChunkMetadata;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "interview_chunks_interview_id_fkey";
            columns: ["interview_id"];
            isOneToOne: false;
            referencedRelation: "interviews";
            referencedColumns: ["id"];
          },
        ];
      };
      source_entities: {
        Row: {
          id: string;
          source_id: string;
          entity_id: string;
          link_type: SourceEntityLinkType;
          origin: SourceEntityOrigin;
          is_primary: boolean;
          speaker_label: string | null;
          source_metadata: Record<string, unknown> | null;
          evidence: Record<string, unknown> | null;
          confidence: number | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          source_id: string;
          entity_id: string;
          link_type: SourceEntityLinkType;
          origin: SourceEntityOrigin;
          is_primary?: boolean;
          speaker_label?: string | null;
          source_metadata?: Record<string, unknown> | null;
          evidence?: Record<string, unknown> | null;
          confidence?: number | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          source_id?: string;
          entity_id?: string;
          link_type?: SourceEntityLinkType;
          origin?: SourceEntityOrigin;
          is_primary?: boolean;
          speaker_label?: string | null;
          source_metadata?: Record<string, unknown> | null;
          evidence?: Record<string, unknown> | null;
          confidence?: number | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "source_entities_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "source_entities_entity_id_fkey";
            columns: ["entity_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
        ];
      };
      source_chunks: {
        Row: {
          id: string;
          source_id: string;
          chunk_index: number;
          content: string;
          speaker: string | null;
          start_time: number | null;
          end_time: number | null;
          embedding: string | null;
          metadata: ChunkMetadata;
          created_at: string;
        };
        Insert: {
          id?: string;
          source_id: string;
          chunk_index: number;
          content: string;
          speaker?: string | null;
          start_time?: number | null;
          end_time?: number | null;
          embedding?: string | null;
          metadata?: ChunkMetadata;
          created_at?: string;
        };
        Update: {
          id?: string;
          source_id?: string;
          chunk_index?: number;
          content?: string;
          speaker?: string | null;
          start_time?: number | null;
          end_time?: number | null;
          embedding?: string | null;
          metadata?: ChunkMetadata;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "source_chunks_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
      };
      entities: {
        Row: {
          id: string;
          name: string;
          project_id: string | null;
          canonical_entity_id: string | null;
          normalized_name: string;
          type: EntityType;
          description: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          project_id?: string | null;
          canonical_entity_id?: string | null;
          normalized_name?: string;
          type: EntityType;
          description?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          project_id?: string | null;
          canonical_entity_id?: string | null;
          normalized_name?: string;
          type?: EntityType;
          description?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "entities_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "entities_canonical_entity_id_fkey";
            columns: ["canonical_entity_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
        ];
      };
      entity_aliases: {
        Row: {
          id: string;
          entity_id: string;
          alias: string;
          alias_normalized: string;
          source: string | null;
          confidence: number;
          project_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          entity_id: string;
          alias: string;
          alias_normalized: string;
          source?: string | null;
          confidence?: number;
          project_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          entity_id?: string;
          alias?: string;
          alias_normalized?: string;
          source?: string | null;
          confidence?: number;
          project_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "entity_aliases_entity_id_fkey";
            columns: ["entity_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "entity_aliases_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      entity_mentions: {
        Row: {
          id: string;
          entity_id: string;
          interview_id: string;
          chunk_id: string | null;
          context: string | null;
          sentiment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          entity_id: string;
          interview_id: string;
          chunk_id?: string | null;
          context?: string | null;
          sentiment?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          entity_id?: string;
          interview_id?: string;
          chunk_id?: string | null;
          context?: string | null;
          sentiment?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "entity_mentions_entity_id_fkey";
            columns: ["entity_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "entity_mentions_interview_id_fkey";
            columns: ["interview_id"];
            isOneToOne: false;
            referencedRelation: "interviews";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "entity_mentions_chunk_id_fkey";
            columns: ["chunk_id"];
            isOneToOne: false;
            referencedRelation: "interview_chunks";
            referencedColumns: ["id"];
          },
        ];
      };
      entity_relationships: {
        Row: {
          id: string;
          source_entity_id: string;
          target_entity_id: string;
          relation_type: RelationType;
          confidence: number;
          evidence_text: string | null;
          interview_id: string;
          created_at: string;
          review_status: RelationshipReviewStatus;
          origin: RelationshipOrigin;
          reviewed_by: string | null;
          reviewed_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          source_entity_id: string;
          target_entity_id: string;
          relation_type: RelationType;
          confidence?: number;
          evidence_text?: string | null;
          interview_id: string;
          created_at?: string;
          review_status?: RelationshipReviewStatus;
          origin?: RelationshipOrigin;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          source_entity_id?: string;
          target_entity_id?: string;
          relation_type?: RelationType;
          confidence?: number;
          evidence_text?: string | null;
          interview_id?: string;
          created_at?: string;
          review_status?: RelationshipReviewStatus;
          origin?: RelationshipOrigin;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "entity_relationships_source_entity_id_fkey";
            columns: ["source_entity_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "entity_relationships_target_entity_id_fkey";
            columns: ["target_entity_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "entity_relationships_interview_id_fkey";
            columns: ["interview_id"];
            isOneToOne: false;
            referencedRelation: "interviews";
            referencedColumns: ["id"];
          },
        ];
      };
      content_snippets: {
        Row: {
          id: string;
          interview_id: string;
          platform: SnippetPlatform;
          content: string;
          tone: SnippetTone;
          status: SnippetStatus;
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          interview_id: string;
          platform: SnippetPlatform;
          content: string;
          tone?: SnippetTone;
          status?: SnippetStatus;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          interview_id?: string;
          platform?: SnippetPlatform;
          content?: string;
          tone?: SnippetTone;
          status?: SnippetStatus;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_snippets_interview_id_fkey";
            columns: ["interview_id"];
            isOneToOne: false;
            referencedRelation: "interviews";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          id: string;
          project_id: string;
          title: string;
          template: ReportTemplate;
          status: ReportStatus;
          content: string | null;
          summary: string | null;
          interview_ids: string[];
          parameters: Record<string, unknown>;
          error_message: string | null;
          share_token: string | null;
          share_password: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          title: string;
          template: ReportTemplate;
          status?: ReportStatus;
          content?: string | null;
          summary?: string | null;
          interview_ids: string[];
          parameters?: Record<string, unknown>;
          error_message?: string | null;
          share_token?: string | null;
          share_password?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          title?: string;
          template?: ReportTemplate;
          status?: ReportStatus;
          content?: string | null;
          summary?: string | null;
          interview_ids?: string[];
          parameters?: Record<string, unknown>;
          error_message?: string | null;
          share_token?: string | null;
          share_password?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reports_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      validated_positions: {
        Row: {
          id: string;
          person_entity_id: string;
          organization_entity_id: string | null;
          title: string;
          is_main: boolean;
          state: PositionState;
          valid_from_date: string | null;
          valid_from_precision: DatePrecision;
          valid_to_date: string | null;
          valid_to_precision: DatePrecision;
          validated_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          person_entity_id: string;
          organization_entity_id?: string | null;
          title: string;
          is_main?: boolean;
          state?: PositionState;
          valid_from_date?: string | null;
          valid_from_precision?: DatePrecision;
          valid_to_date?: string | null;
          valid_to_precision?: DatePrecision;
          validated_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          person_entity_id?: string;
          organization_entity_id?: string | null;
          title?: string;
          is_main?: boolean;
          state?: PositionState;
          valid_from_date?: string | null;
          valid_from_precision?: DatePrecision;
          valid_to_date?: string | null;
          valid_to_precision?: DatePrecision;
          validated_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "validated_positions_person_entity_id_fkey";
            columns: ["person_entity_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "validated_positions_organization_entity_id_fkey";
            columns: ["organization_entity_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_conversation_seq: {
        Row: {
          conversation_id: string;
          next_val: number;
        };
        Insert: {
          conversation_id: string;
          next_val?: number;
        };
        Update: {
          conversation_id?: string;
          next_val?: number;
        };
        Relationships: [
          {
            foreignKeyName: "chat_conversation_seq_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: true;
            referencedRelation: "chat_conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_conversations: {
        Row: {
          id: string;
          user_id: string;
          project_id: string | null;
          interview_id: string | null;
          title: string;
          title_user_set: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id?: string | null;
          interview_id?: string | null;
          title?: string;
          title_user_set?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          project_id?: string | null;
          interview_id?: string | null;
          title?: string;
          title_user_set?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_conversations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_conversations_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_conversations_interview_id_fkey";
            columns: ["interview_id"];
            isOneToOne: false;
            referencedRelation: "interviews";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_messages: {
        Row: {
          id: string;
          conversation_id: string;
          role: ChatMessageRole;
          content: string;
          sequence: number;
          client_message_id: string | null;
          user_message_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          role: ChatMessageRole;
          content: string;
          sequence: number;
          client_message_id?: string | null;
          user_message_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          role?: ChatMessageRole;
          content?: string;
          sequence?: number;
          client_message_id?: string | null;
          user_message_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "chat_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_messages_user_message_id_fkey";
            columns: ["user_message_id"];
            isOneToOne: false;
            referencedRelation: "chat_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      user_platform_roles: {
        Row: {
          id: string;
          user_id: string;
          role: PlatformRole;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role: PlatformRole;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          role?: PlatformRole;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_platform_roles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    /**
     * Back-compat views created in migration 00027 (Phase 2.1).
     * Both are read-only SELECT views — INSERT/UPDATE/DELETE go through the
     * canonical `sources` / `source_chunks` tables. These views will be
     * dropped in a future "Soon" PR once no live reader uses the old names.
     */
    Views: {
      /** Read-only view over `sources`. All columns pass-through. */
      interviews: {
        Row: Database["public"]["Tables"]["interviews"]["Row"];
        Insert: never;
        Update: never;
        Relationships: [];
      };
      /** Read-only view over `source_chunks` with `source_id` aliased back to `interview_id`. */
      interview_chunks: {
        Row: Database["public"]["Tables"]["interview_chunks"]["Row"];
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Functions: {
      is_superuser: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      has_entity_governance_access: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      hybrid_search: {
        Args: {
          query_embedding: string;
          filter_project_ids?: string[] | null;
          filter_interview_ids?: string[] | null;
          filter_country?: string | null;
          filter_topics?: string[] | null;
          match_threshold?: number;
          match_count?: number;
        };
        Returns: Array<{
          chunk_id: string;
          interview_id: string;
          content: string;
          speaker: string | null;
          start_time: number | null;
          end_time: number | null;
          metadata: ChunkMetadata;
          similarity: number;
        }>;
      };
      clear_source_derived_data: {
        Args: { p_source_id: string };
        Returns: undefined;
      };
      get_source_project: {
        Args: { p_source_id: string };
        Returns: string | null;
      };
      list_distinct_position_titles: {
        Args: { p_limit?: number | null };
        Returns: Array<{ title: string }>;
      };
      next_chat_message_sequence: {
        Args: { p_conversation_id: string };
        Returns: number;
      };
      /**
       * Phase 1 + Phase 2.4 — UNION of:
       *   1. entity_mentions rows (role="mention", kind="mention")
       *   2. source_entities rows (role=link_type, kind="anchor"|"source_entity")
       *   3. entity_relationships rows (role="related_via_relationship", kind="relationship")
       *
       * `kind` mapping by origin:
       *   upload_anchor | metadata_import | manual_tag | human_review → "anchor"
       *   extraction | ai_inference | alias_propagation | prior_context → "source_entity"
       */
      entity_intel: {
        Args: {
          p_entity_id: string;
          p_project_id?: string | null;
        };
        Returns: Array<{
          source_id: string;
          source_title: string;
          /** All SourceEntityLinkType values for source_entities rows; "mention" for chunk rows; "related_via_relationship" for relationship rows. */
          role: SourceEntityLinkType | "mention" | "related_via_relationship";
          kind: "mention" | "anchor" | "source_entity" | "relationship";
          evidence: string | null;
          chunk_id: string | null;
          sentiment: string | null;
          conducted_at: string | null;
          created_at: string;
        }>;
      };
    };
    Enums: {
      interview_status: InterviewStatus;
      entity_type: EntityType;
      user_role: UserRole;
      relation_type: RelationType;
      relationship_review_status: RelationshipReviewStatus;
      relationship_origin: RelationshipOrigin;
      source_entity_link_type: SourceEntityLinkType;
      source_entity_origin: SourceEntityOrigin;
      source_type: SourceType;
      snippet_platform: SnippetPlatform;
      snippet_tone: SnippetTone;
      snippet_status: SnippetStatus;
      report_status: ReportStatus;
      report_template: ReportTemplate;
      transcript_review_status: TranscriptReviewStatus;
      position_state: PositionState;
      date_precision: DatePrecision;
      platform_role: PlatformRole;
      chat_message_role: ChatMessageRole;
    };
    CompositeTypes: Record<string, never>;
  };
}

// ============================================
// Convenience type aliases
// ============================================

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type InsertTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type Profile = Tables<"profiles">;
export type Project = Tables<"projects">;
export type ProjectMember = Tables<"project_members">;
export type Source = Tables<"sources">;
export type SourceChunk = Tables<"source_chunks">;
export type SourceEntity = Tables<"source_entities">;
export type Interview = Tables<"interviews">;
export type InterviewChunk = Tables<"interview_chunks">;
export type Entity = Tables<"entities">;
export type EntityAlias = Tables<"entity_aliases">;
export type EntityMention = Tables<"entity_mentions">;
export type EntityRelationship = Tables<"entity_relationships">;
export type ContentSnippet = Tables<"content_snippets">;
export type Report = Tables<"reports">;
export type InterviewReviewEntity = Tables<"interview_review_entities">;
export type ValidatedPosition = Tables<"validated_positions">;
export type UserPlatformRole = Tables<"user_platform_roles">;
export type ChatConversation = Tables<"chat_conversations">;
export type ChatMessage = Tables<"chat_messages">;
