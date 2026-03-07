CREATE TABLE `workflow_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`conditions_json` text NOT NULL,
	`condition_logic` text DEFAULT 'and' NOT NULL,
	`actions_json` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`trigger_count` integer DEFAULT 0 NOT NULL,
	`last_triggered` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `email_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workflow_rules_account_idx` ON `workflow_rules` (`account_id`);