-- ============================================================
-- WP-9: RESPONSE INTEGRITY & ATOMIC INBOUND CLAIMS (PHASE 22)
-- ============================================================

CREATE TABLE IF NOT EXISTS inbound_event_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT NOT NULL UNIQUE,
  event_id TEXT NOT NULL UNIQUE,
  chat_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  content_hash TEXT,
  source TEXT NOT NULL DEFAULT 'notify',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inbound_event_claims_chat ON inbound_event_claims(chat_id);
CREATE INDEX IF NOT EXISTS idx_inbound_event_claims_hash ON inbound_event_claims(content_hash, chat_id);
CREATE INDEX IF NOT EXISTS idx_inbound_event_claims_created ON inbound_event_claims(created_at);

-- Ensure required unique constraints on conversation_turns, response_commits, message_outbox
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_turns_turn_id ON conversation_turns(turn_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_response_commits_turn_id ON response_commits(turn_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_response_commits_resp_id ON response_commits(response_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_outbox_resp_id ON message_outbox(response_id);
