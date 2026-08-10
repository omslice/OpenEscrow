CREATE TABLE IF NOT EXISTS `evidence_files` (
	`id` text PRIMARY KEY NOT NULL,
	`negotiation_id` text NOT NULL,
	`uploader_role` text NOT NULL,
	`storage_kind` text NOT NULL,
	`object_key` text,
	`cid` text,
	`original_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`negotiation_id`) REFERENCES `agreement_negotiations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `evidence_files_negotiation_id_idx` ON `evidence_files` (`negotiation_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `notification_unsubscribe_tokens` (
	`user_id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL UNIQUE,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `notification_preferences`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `notification_deliveries` (
	`idempotency_key` text PRIMARY KEY NOT NULL,
	`negotiation_id` text,
	`recipient_email` text NOT NULL,
	`notification_type` text NOT NULL,
	`scheduled_for` text,
	`status` text NOT NULL,
	`provider_message_id` text,
	`created_at` text NOT NULL,
	`sent_at` text,
	FOREIGN KEY (`negotiation_id`) REFERENCES `agreement_negotiations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notification_deliveries_negotiation_id_idx` ON `notification_deliveries` (`negotiation_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `negotiation_tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`negotiation_id` text NOT NULL,
	`name` text,
	`email` text NOT NULL,
	`token_hash` text NOT NULL UNIQUE,
	`approved_revision` integer,
	`wallet` text,
	`is_funding_tenant` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`accepted_at` text,
	FOREIGN KEY (`negotiation_id`) REFERENCES `agreement_negotiations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `negotiation_tenants_email_idx` ON `negotiation_tenants` (`negotiation_id`,`email`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `negotiation_account_access_context` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`tenant_id` text,
	FOREIGN KEY (`token_hash`) REFERENCES `negotiation_account_access`(`token_hash`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`) REFERENCES `negotiation_tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `scheduled_job_runs` (
	`name` text PRIMARY KEY NOT NULL,
	`last_started_at` text NOT NULL
);
