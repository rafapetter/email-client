CREATE TABLE `email_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`provider_type` text NOT NULL,
	`credentials_encrypted` text NOT NULL,
	`ai_adapter` text,
	`ai_api_key_encrypted` text,
	`ai_model` text,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`theme` text DEFAULT 'dark' NOT NULL,
	`pane_layout` text DEFAULT 'three-pane' NOT NULL,
	`sidebar_width` integer DEFAULT 220 NOT NULL,
	`list_width` integer DEFAULT 400 NOT NULL,
	`keyboard_shortcuts_enabled` integer DEFAULT true NOT NULL,
	`ai_summaries_enabled` integer DEFAULT true NOT NULL,
	`ai_priority_enabled` integer DEFAULT true NOT NULL,
	`ai_classification_enabled` integer DEFAULT true NOT NULL,
	`focused_inbox_enabled` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_preferences_user_id_unique` ON `user_preferences` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);