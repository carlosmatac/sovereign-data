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

export type EntityType =
  | "PERSON"
  | "COMPANY"
  | "GOVERNMENT"
  | "ORGANIZATION"
  | "LOCATION"
  | "EVENT";

export type UserRole = "owner" | "editor" | "viewer";

/** Platform-wide role (distinct from `project_members.role`). */
export type PlatformRole = "member" | "platform_admin" | "superuser";

export type RelationType =
  | "business_partner"
  | "competitor"
  | "regulator"
  | "critic"
  | "ally"
  | "subsidiary"
  | "investor"
  | "advisor"
  | "supplier"
  | "acquirer";

export type SourceType = "audio" | "document" | "video";

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
    Views: Record<string, never>;
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
      clear_interview_derived_data: {
        Args: { p_interview_id: string };
        Returns: undefined;
      };
      list_distinct_position_titles: {
        Args: { p_limit?: number | null };
        Returns: Array<{ title: string }>;
      };
    };
    Enums: {
      interview_status: InterviewStatus;
      entity_type: EntityType;
      user_role: UserRole;
      relation_type: RelationType;
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
