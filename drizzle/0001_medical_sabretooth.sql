CREATE TABLE `ai_enrichments` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`email_id` text NOT NULL,
	`priority` text,
	`classification` text,
	`summary` text,
	`action_items` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `email_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_enrichments_account_email_idx` ON `ai_enrichments` (`account_id`,`email_id`);