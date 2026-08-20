ALTER TABLE merchants ADD COLUMN email_verified_at TEXT;
UPDATE merchants SET email_verified_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE email_verified_at IS NULL;

ALTER TABLE programs ADD COLUMN earning_mode TEXT NOT NULL DEFAULT 'visits';
ALTER TABLE programs ADD COLUMN spend_amount_cents INTEGER NOT NULL DEFAULT 100;

ALTER TABLE customers ADD COLUMN phone TEXT;
ALTER TABLE customers ADD COLUMN marketing_consent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN marketing_consented_at TEXT;

ALTER TABLE stamps ADD COLUMN amount_cents INTEGER;
ALTER TABLE stamps ADD COLUMN note TEXT;

ALTER TABLE rewards ADD COLUMN tier_id TEXT;
ALTER TABLE rewards ADD COLUMN reward_text TEXT;
ALTER TABLE rewards ADD COLUMN threshold INTEGER;
UPDATE rewards SET
  reward_text = COALESCE(reward_text, (SELECT p.reward_text FROM programs p WHERE p.id = rewards.program_id)),
  threshold = COALESCE(threshold, (SELECT p.goal FROM programs p WHERE p.id = rewards.program_id));

CREATE TABLE IF NOT EXISTS program_reward_tiers (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL,
  threshold INTEGER NOT NULL,
  reward_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(program_id, threshold)
);
INSERT OR IGNORE INTO program_reward_tiers (id, program_id, threshold, reward_text, sort_order)
SELECT 'tier_' || id, id, goal, reward_text, 0 FROM programs;

CREATE TABLE IF NOT EXISTS merchant_email_verifications (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  last_sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_merchant_phone ON customers(merchant_id, phone);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_merchant_phone_unique ON customers(merchant_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_program_reward_tiers_program ON program_reward_tiers(program_id, sort_order, threshold);
CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON merchant_email_verifications(email, created_at);
