CREATE TABLE `agreement_negotiations` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`status` text NOT NULL,
	`revision` integer NOT NULL,
	`terms_json` text NOT NULL,
	`landlord_email` text NOT NULL,
	`tenant_email` text NOT NULL,
	`arbiter_email` text,
	`landlord_token_hash` text NOT NULL,
	`tenant_token_hash` text NOT NULL,
	`arbiter_token_hash` text,
	`tenant_approved_revision` integer,
	`arbiter_approved_revision` integer,
	`tenant_wallet` text,
	`arbiter_wallet` text,
	`onchain_agreement_id` text,
	`onchain_tx_hash` text
);
--> statement-breakpoint
CREATE TABLE `negotiation_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`negotiation_id` text NOT NULL,
	`created_at` text NOT NULL,
	`actor_role` text NOT NULL,
	`action` text NOT NULL,
	`summary` text NOT NULL,
	`revision` integer NOT NULL,
	`metadata_json` text,
	FOREIGN KEY (`negotiation_id`) REFERENCES `agreement_negotiations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `negotiation_events_negotiation_id_idx` ON `negotiation_events` (`negotiation_id`,`id`);
