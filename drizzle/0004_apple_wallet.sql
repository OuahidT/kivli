CREATE TABLE IF NOT EXISTS apple_wallet_passes (
  membership_id TEXT PRIMARY KEY,
  serial_number TEXT NOT NULL UNIQUE,
  pass_type_identifier TEXT NOT NULL,
  authentication_token_hash TEXT NOT NULL,
  last_updated_tag INTEGER NOT NULL,
  push_pending INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS apple_wallet_devices (
  device_library_identifier TEXT PRIMARY KEY,
  push_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS apple_wallet_registrations (
  device_library_identifier TEXT NOT NULL,
  pass_type_identifier TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (device_library_identifier, pass_type_identifier, serial_number)
);

CREATE INDEX IF NOT EXISTS idx_apple_wallet_pass_serial
  ON apple_wallet_passes(pass_type_identifier, serial_number);
CREATE INDEX IF NOT EXISTS idx_apple_wallet_registration_pass
  ON apple_wallet_registrations(pass_type_identifier, serial_number);

