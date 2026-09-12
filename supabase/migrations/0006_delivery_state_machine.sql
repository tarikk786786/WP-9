-- ============================================================
-- WP-9: DELIVERY STATE MACHINE & TRANSACTIONAL INBOUND CLAIMS (PHASE 23)
-- ============================================================

ALTER TABLE IF EXISTS inbound_event_claims 
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'CLAIMED',
  ADD COLUMN IF NOT EXISTS owner_id TEXT,
  ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS turn_id TEXT,
  ADD COLUMN IF NOT EXISTS attempt_count INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS error TEXT;

CREATE INDEX IF NOT EXISTS idx_inbound_event_claims_status ON inbound_event_claims(status);
CREATE INDEX IF NOT EXISTS idx_inbound_event_claims_lease ON inbound_event_claims(lease_until);
CREATE INDEX IF NOT EXISTS idx_inbound_event_claims_turn ON inbound_event_claims(turn_id);

-- Dedicated table for recording immutable NO_REPLY turn decisions
CREATE TABLE IF NOT EXISTS no_reply_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turn_id TEXT NOT NULL UNIQUE,
  chat_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  message_ids TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_no_reply_decisions_chat ON no_reply_decisions(chat_id);
