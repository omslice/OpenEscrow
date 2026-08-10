CREATE TABLE IF NOT EXISTS `account_record_archives` (
	`user_id` text NOT NULL,
	`negotiation_id` text NOT NULL,
	`role` text NOT NULL,
	`archived_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `negotiation_id`, `role`),
	FOREIGN KEY (`negotiation_id`) REFERENCES `agreement_negotiations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `account_record_archives_user_idx`
ON `account_record_archives` (`user_id`,`role`,`archived_at`);
