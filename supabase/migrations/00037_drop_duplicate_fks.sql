-- Migration 00037: Drop single-column FKs that are superseded by compound FKs added in 00033.
--
-- Context: migration 00033 added compound FKs (col, tenant_id) on every child table to enforce
-- tenant consistency at the DB level. Those compound FKs already imply the old single-column FKs
-- (the compound FK's first column is the same parent reference). Keeping both FKs causes PostgREST
-- to find multiple paths when embedding relationships (e.g. interviews→projects, chunks→sources)
-- and refuse to resolve them with "more than one relationship was found" errors.
--
-- Fix: drop the old single-column originals. The compound FKs remain and cover referential integrity.

-- sources → projects
ALTER TABLE public.sources
  DROP CONSTRAINT IF EXISTS interviews_project_id_fkey;

-- source_chunks → sources
ALTER TABLE public.source_chunks
  DROP CONSTRAINT IF EXISTS interview_chunks_interview_id_fkey;

-- source_entities → sources
ALTER TABLE public.source_entities
  DROP CONSTRAINT IF EXISTS source_entities_source_id_fkey;

-- entity_mentions → sources
ALTER TABLE public.entity_mentions
  DROP CONSTRAINT IF EXISTS entity_mentions_interview_id_fkey;

-- entity_relationships → sources
ALTER TABLE public.entity_relationships
  DROP CONSTRAINT IF EXISTS entity_relationships_interview_id_fkey;

-- content_snippets → sources
ALTER TABLE public.content_snippets
  DROP CONSTRAINT IF EXISTS content_snippets_interview_id_fkey;

-- interview_review_entities → sources
ALTER TABLE public.interview_review_entities
  DROP CONSTRAINT IF EXISTS interview_review_entities_interview_id_fkey;

-- reports → projects
ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_project_id_fkey;

-- project_members → projects
ALTER TABLE public.project_members
  DROP CONSTRAINT IF EXISTS project_members_project_id_fkey;

-- chat_conversation_seq → chat_conversations
ALTER TABLE public.chat_conversation_seq
  DROP CONSTRAINT IF EXISTS chat_conversation_seq_conversation_id_fkey;

-- chat_messages → chat_conversations
ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_conversation_id_fkey;
