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

// ============================================
// JSON Column Types
// ============================================

export interface SpeakerMap {
  [speakerLabel: string]: string;
}

export interface SentimentData {
  overall: "positive" | "negative" | "neutral" | "mixed";
  score: number;
  highlights: Array<{
    text: string;
    sentiment: "positive" | "negative" | "neutral";
    timestamp?: number;
  }>;
}

export interface ChunkMetadata {
  country?: string;
  topics?: string[];
  entities?: string[];
  speaker_role?: string;
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
          created_by: string;
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
          user_id: string;
          role: UserRole;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          user_id: string;
          role?: UserRole;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          user_id?: string;
          role?: UserRole;
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
          summary: string | null;
          sentiment: SentimentData | null;
          topics: string[] | null;
          assemblyai_id: string | null;
          language: string;
          conducted_at: string | null;
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
          summary?: string | null;
          sentiment?: SentimentData | null;
          topics?: string[] | null;
          assemblyai_id?: string | null;
          language?: string;
          conducted_at?: string | null;
          created_by: string;
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
          summary?: string | null;
          sentiment?: SentimentData | null;
          topics?: string[] | null;
          assemblyai_id?: string | null;
          language?: string;
          conducted_at?: string | null;
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
          type: EntityType;
          description: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          type: EntityType;
          description?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          type?: EntityType;
          description?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
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
    };
    Views: Record<string, never>;
    Functions: {
      hybrid_search: {
        Args: {
          query_embedding: string;
          filter_project_ids?: string[] | null;
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
    };
    Enums: {
      interview_status: InterviewStatus;
      entity_type: EntityType;
      user_role: UserRole;
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
export type EntityMention = Tables<"entity_mentions">;
