CREATE TABLE IF NOT EXISTS `merchant_admin_state` (
  `merchant_id` text PRIMARY KEY NOT NULL,
  `status` text DEFAULT 'active' NOT NULL CHECK (`status` IN ('active', 'suspended')),
  `internal_note` text DEFAULT '' NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `admin_audit_log` (
  `id` text PRIMARY KEY NOT NULL,
  `admin_email` text NOT NULL,
  `action` text NOT NULL,
  `merchant_id` text,
  `details_json` text DEFAULT '{}' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `admin_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `admin_email` text NOT NULL,
  `token_hash` text NOT NULL,
  `expires_at` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `admin_login_attempts` (
  `key_hash` text PRIMARY KEY NOT NULL,
  `failed_count` integer DEFAULT 0 NOT NULL,
  `window_started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `locked_until` text,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_admin_state_status` ON `merchant_admin_state` (`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_admin_audit_created` ON `admin_audit_log` (`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_admin_audit_merchant` ON `admin_audit_log` (`merchant_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_admin_sessions_expires` ON `admin_sessions` (`expires_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_admin_sessions_token` ON `admin_sessions` (`token_hash`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_admin_login_updated` ON `admin_login_attempts` (`updated_at`);
--> statement-breakpoint
PRAGMA optimize;
