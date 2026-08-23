ALTER TABLE apple_wallet_passes ADD COLUMN notification_delivery_id TEXT;

CREATE TABLE IF NOT EXISTS google_wallet_passes (
  membership_id TEXT PRIMARY KEY,
  object_id TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  last_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_notification_settings (
  merchant_id TEXT PRIMARY KEY,
  near_reward_enabled INTEGER NOT NULL DEFAULT 0,
  near_reward_threshold INTEGER NOT NULL DEFAULT 2,
  reactivation_enabled INTEGER NOT NULL DEFAULT 0,
  reactivation_days INTEGER NOT NULL DEFAULT 45,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_notification_campaigns (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  program_id TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  target_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT
);

CREATE TABLE IF NOT EXISTS wallet_notification_marketing_locks (
  merchant_id TEXT PRIMARY KEY,
  next_allowed_at TEXT NOT NULL DEFAULT '1970-01-01 00:00:00',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_notification_deliveries (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  merchant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  membership_id TEXT NOT NULL,
  program_id TEXT NOT NULL,
  campaign_id TEXT,
  notification_type TEXT NOT NULL,
  cycle_key TEXT NOT NULL,
  platform TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_google_wallet_pass_active ON google_wallet_passes(active, updated_at);
CREATE INDEX IF NOT EXISTS idx_wallet_notification_campaigns_merchant ON wallet_notification_campaigns(merchant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_notification_deliveries_retry ON wallet_notification_deliveries(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_wallet_notification_deliveries_merchant ON wallet_notification_deliveries(merchant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_notification_deliveries_membership ON wallet_notification_deliveries(membership_id, notification_type, cycle_key);
CREATE INDEX IF NOT EXISTS idx_stamps_membership_activity ON stamps(membership_id, created_at);
