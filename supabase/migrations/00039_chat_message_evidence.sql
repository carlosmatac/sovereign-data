-- Phase 4a — Persisted chat message evidence
-- Adds chat_message_evidence table that links each assistant message turn to
-- the RAG chunks that backed it, enabling persistent citation chips after
-- page reload.
--
-- Prerequisites met by prior migrations:
--   00033: chat_messages.tenant_id NOT NULL
--   00034: RLS on chat_messages
--   00037: no duplicate FKs on source_chunks

-- ── Step 1: Add (id, tenant_id) UNIQUE on chat_messages ────────────────────
-- Required so chat_message_evidence can carry a compound FK to
-- chat_messages(id, tenant_id), enforcing the tenant boundary without a join.

ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_id_tenant_unique UNIQUE (id, tenant_id);

-- ── Step 2: Create chat_message_evidence ───────────────────────────────────

CREATE TABLE public.chat_message_evidence (
  id           UUID        NOT NULL DEFAULT uuid_generate_v4(),
  message_id   UUID        NOT NULL,
  tenant_id    UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  chunk_id     UUID        NOT NULL REFERENCES public.source_chunks(id) ON DELETE CASCADE,
  similarity   FLOAT       NOT NULL,
  position     INT         NOT NULL,  -- 1-based citation index matching [1], [2], … in text
  used_in_text BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chat_message_evidence_pkey PRIMARY KEY (id),

  -- Compound FK: enforces tenant boundary at the DB level (Phase 3a forward-compat)
  CONSTRAINT chat_message_evidence_message_tenant_fkey
    FOREIGN KEY (message_id, tenant_id)
    REFERENCES public.chat_messages(id, tenant_id)
    ON DELETE CASCADE
);

-- ── Step 3: Indexes ─────────────────────────────────────────────────────────

-- Primary lookup: all evidence rows for a given message
CREATE INDEX idx_chat_message_evidence_message_id
  ON public.chat_message_evidence (message_id);

-- Tenant-scoped queries and RLS fast-path
CREATE INDEX idx_chat_message_evidence_tenant_id
  ON public.chat_message_evidence (tenant_id);

-- ── Step 4: RLS ──────────────────────────────────────────────────────────────

ALTER TABLE public.chat_message_evidence ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read evidence that belongs to their tenant.
CREATE POLICY "tenant members can read evidence"
  ON public.chat_message_evidence
  FOR SELECT
  USING (public.is_tenant_member(tenant_id));

-- Writes go through the admin (service-role) client in the API route.
-- No INSERT/UPDATE/DELETE policy for the anon/cookie client.
