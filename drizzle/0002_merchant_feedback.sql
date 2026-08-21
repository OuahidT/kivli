ALTER TABLE merchants ADD COLUMN welcome_seen_at TEXT;

CREATE TABLE IF NOT EXISTS merchant_feedback (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  business_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  email TEXT NOT NULL,
  feedback_type TEXT NOT NULL,
  message TEXT NOT NULL,
  program_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_merchant_feedback_merchant_created ON merchant_feedback(merchant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_merchant_feedback_status_created ON merchant_feedback(status, created_at);
