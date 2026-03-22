-- Manual chat titles: once set by the user, automatic first-message titling must not overwrite.

ALTER TABLE chat_conversations
  ADD COLUMN title_user_set BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN chat_conversations.title_user_set IS
  'When true, title was set or confirmed by the user (rename); skip automatic title from first message.';
