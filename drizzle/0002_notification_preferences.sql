CREATE TABLE IF NOT EXISTS `notification_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`agreement_activity` integer DEFAULT 0 NOT NULL,
	`deadline_reminders` integer DEFAULT 0 NOT NULL,
	`consented_at` text,
	`updated_at` text NOT NULL
);
