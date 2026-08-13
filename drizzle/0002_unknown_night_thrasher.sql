CREATE TABLE `employee_actions` (
	`stamp_id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_employee_actions_employee` ON `employee_actions` (`employee_id`);--> statement-breakpoint
CREATE TABLE `employee_sessions` (
	`session_id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_employee_sessions_employee` ON `employee_sessions` (`employee_id`);--> statement-breakpoint
CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`display_name` text NOT NULL,
	`email` text,
	`login_code` text NOT NULL,
	`pin_hash` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_employees_merchant` ON `employees` (`merchant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_employees_email` ON `employees` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_employees_login_code` ON `employees` (`login_code`);--> statement-breakpoint
CREATE TABLE `stamp_requests` (
	`request_key` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`response_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_stamp_requests_merchant_created` ON `stamp_requests` (`merchant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `stamp_reward_links` (
	`stamp_id` text NOT NULL,
	`reward_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_stamp_reward_links_stamp` ON `stamp_reward_links` (`stamp_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_stamp_reward_links_reward` ON `stamp_reward_links` (`reward_id`);--> statement-breakpoint
PRAGMA optimize;
