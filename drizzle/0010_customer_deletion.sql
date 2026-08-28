ALTER TABLE memberships ADD COLUMN deleted_at TEXT;
ALTER TABLE memberships ADD COLUMN deleted_by_role TEXT;
ALTER TABLE customers ADD COLUMN anonymized_at TEXT;
ALTER TABLE apple_wallet_passes ADD COLUMN voided_at TEXT;

CREATE TABLE wallet_invalidation_jobs (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  merchant_id TEXT NOT NULL,
  membership_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_memberships_merchant_active
  ON memberships(merchant_id, deleted_at, updated_at);
CREATE INDEX idx_wallet_invalidation_jobs_retry
  ON wallet_invalidation_jobs(status, next_attempt_at);
CREATE INDEX idx_wallet_invalidation_jobs_membership
  ON wallet_invalidation_jobs(membership_id, platform);
