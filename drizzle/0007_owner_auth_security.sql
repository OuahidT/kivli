ALTER TABLE merchants ADD COLUMN owner_pin_change_required INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS owner_trusted_devices (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  device_label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS owner_security_tokens (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  trusted_device_id TEXT,
  purpose TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_owner_devices_merchant
  ON owner_trusted_devices(merchant_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_owner_security_tokens_merchant
  ON owner_security_tokens(merchant_id, purpose, used_at);
