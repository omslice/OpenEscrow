CREATE TABLE IF NOT EXISTS `negotiation_account_access` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`negotiation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL UNIQUE,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`negotiation_id`) REFERENCES `agreement_negotiations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `negotiation_account_access_lookup_idx` ON `negotiation_account_access` (`negotiation_id`,`token_hash`,`expires_at`);
