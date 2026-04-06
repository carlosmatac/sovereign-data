-- ============================================
-- Copilot — persisted conversations & messages (V1)
-- ============================================

CREATE TYPE chat_message_role AS ENUM ('user', 'assistant');

CREATE TABLE chat_conversations (
  id            UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,
  interview_id  UUID REFERENCES interviews(id) ON DELETE SET NULL,
  title         TEXT NOT NULL DEFAULT 'New chat',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_conversation_seq (
  conversation_id UUID PRIMARY KEY REFERENCES chat_conversations(id) ON DELETE CASCADE,
  next_val        BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE chat_messages (
  id                  UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  conversation_id     UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role                chat_message_role NOT NULL,
  content             TEXT NOT NULL,
  sequence            BIGINT NOT NULL,
  client_message_id   TEXT,
  user_message_id     UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, sequence)
);

CREATE UNIQUE INDEX chat_messages_user_client_id_unique
  ON chat_messages (conversation_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE UNIQUE INDEX chat_messages_one_assistant_per_user_turn
  ON chat_messages (conversation_id, user_message_id)
  WHERE role = 'assistant' AND user_message_id IS NOT NULL;

CREATE INDEX idx_chat_conversations_user_updated
  ON chat_conversations (user_id, updated_at DESC);

CREATE INDEX idx_chat_messages_conv_sequence
  ON chat_messages (conversation_id, sequence DESC);

CREATE TRIGGER update_chat_conversations_updated_at
  BEFORE UPDATE ON chat_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Bump parent conversation updated_at when a message is stored (listing / replay).
CREATE OR REPLACE FUNCTION public.touch_chat_conversation_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE chat_conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER chat_messages_touch_conversation_updated_at
  AFTER INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION touch_chat_conversation_on_message();

-- Atomic sequence allocation per conversation (server / service_role only).
CREATE OR REPLACE FUNCTION public.next_chat_message_sequence(p_conversation_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next BIGINT;
BEGIN
  UPDATE chat_conversation_seq
  SET next_val = next_val + 1
  WHERE conversation_id = p_conversation_id
  RETURNING next_val INTO v_next;

  IF v_next IS NULL THEN
    RAISE EXCEPTION 'Missing sequence row for conversation %', p_conversation_id;
  END IF;

  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.next_chat_message_sequence(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_chat_message_sequence(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.touch_chat_conversation_on_message() FROM PUBLIC;
-- Trigger runs on inserts from API (service_role); keep execute for that role.
GRANT EXECUTE ON FUNCTION public.touch_chat_conversation_on_message() TO service_role;

-- ── RLS ─────────────────────────────────────────────────────────

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_conversation_seq ENABLE ROW LEVEL SECURITY;

-- Read own threads; if scoped to a project, still require membership.
CREATE POLICY "Users read own chat conversations"
  ON chat_conversations FOR SELECT
  USING (
    user_id = auth.uid()
    AND (project_id IS NULL OR is_project_member(project_id))
  );

CREATE POLICY "Users read messages in visible conversations"
  ON chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_conversations c
      WHERE c.id = chat_messages.conversation_id
        AND c.user_id = auth.uid()
        AND (c.project_id IS NULL OR is_project_member(c.project_id))
    )
  );

-- No policies on chat_conversation_seq: only service_role (bypasses RLS) touches it.
