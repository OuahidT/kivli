CREATE TABLE `login_attempts` (
	`key_hash` text PRIMARY KEY NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`window_started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`locked_until` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_login_attempts_updated` ON `login_attempts` (`updated_at`);--> statement-breakpoint
ALTER TABLE `merchant_sessions` ADD `role` text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE `merchants` ADD `employee_pin_hash` text;--> statement-breakpoint
ALTER TABLE `stamps` ADD `actor_role` text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE `stamps` ADD `points_before` integer;--> statement-breakpoint
ALTER TABLE `stamps` ADD `points_after` integer;--> statement-breakpoint
ALTER TABLE `stamps` ADD `reward_id` text;--> statement-breakpoint
ALTER TABLE `stamps` ADD `reverses_stamp_id` text;--> statement-breakpoint
ALTER TABLE `stamps` ADD `reversed_at` text;--> statement-breakpoint
ALTER TABLE `stamps` ADD `reversed_by_role` text;
