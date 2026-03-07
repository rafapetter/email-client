CREATE TABLE `cached_emails` (
	`id` text NOT NULL,
	`account_id` text NOT NULL,
	`subject` text,
	`from_address` text,
	`from_name` text,
	`to_json` text,
	`cc_json` text,
	`date` integer,
	`body_text` text,
	`body_html` text,
	`snippet` text,
	`is_read` integer DEFAULT false NOT NULL,
	`is_starred` integer DEFAULT false NOT NULL,
	`labels_json` text,
	`attachments_json` text,
	`thread_id` text,
	`folder` text NOT NULL,
	`ai_processed` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `email_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cached_emails_account_id_idx` ON `cached_emails` (`account_id`,`id`);--> statement-breakpoint
CREATE INDEX `cached_emails_folder_idx` ON `cached_emails` (`account_id`,`folder`);--> statement-breakpoint
CREATE INDEX `cached_emails_date_idx` ON `cached_emails` (`account_id`,`date`);--> statement-breakpoint
CREATE INDEX `cached_emails_ai_processed_idx` ON `cached_emails` (`account_id`,`ai_processed`);--> statement-breakpoint
ALTER TABLE `ai_enrichments` ADD `topics` text;--> statement-breakpoint
ALTER TABLE `ai_enrichments` ADD `extracted_data` text;