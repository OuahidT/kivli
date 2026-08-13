CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`first_name` text NOT NULL,
	`email` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_customers_merchant_email` ON `customers` (`merchant_id`,`email`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`program_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`code` text NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`total_points` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_memberships_code` ON `memberships` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_memberships_program_customer` ON `memberships` (`program_id`,`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_memberships_merchant_updated` ON `memberships` (`merchant_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `merchant_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sessions_token` ON `merchant_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_sessions_merchant` ON `merchant_sessions` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `merchants` (
	`id` text PRIMARY KEY NOT NULL,
	`business_name` text NOT NULL,
	`slug` text NOT NULL,
	`email` text NOT NULL,
	`pin_hash` text NOT NULL,
	`accent_color` text DEFAULT '#f05b3c' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_merchants_slug` ON `merchants` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_merchants_email` ON `merchants` (`email`);--> statement-breakpoint
CREATE TABLE `programs` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`name` text NOT NULL,
	`goal` integer DEFAULT 10 NOT NULL,
	`reward_text` text NOT NULL,
	`terms` text DEFAULT 'Une visite par jour et par client.' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_programs_merchant` ON `programs` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `rewards` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`program_id` text NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`earned_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`redeemed_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_rewards_membership_status` ON `rewards` (`membership_id`,`status`);--> statement-breakpoint
CREATE TABLE `stamps` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`delta` integer NOT NULL,
	`reason` text DEFAULT 'visit' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_stamps_merchant_created` ON `stamps` (`merchant_id`,`created_at`);
--> statement-breakpoint
PRAGMA optimize;
