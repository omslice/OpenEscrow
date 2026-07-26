CREATE TABLE IF NOT EXISTS `compliance_source_checks` (
	`source_key` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`jurisdiction` text NOT NULL,
	`profile_version` text NOT NULL,
	`citation` text NOT NULL,
	`url` text NOT NULL,
	`baseline_signature` text,
	`current_signature` text,
	`http_status` integer,
	`status` text NOT NULL DEFAULT 'pending',
	`last_checked_at` text,
	`last_changed_at` text,
	`error` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `compliance_source_checks_status_idx`
ON `compliance_source_checks` (`status`,`last_checked_at`);
