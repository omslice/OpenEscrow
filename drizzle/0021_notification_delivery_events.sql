CREATE TABLE IF NOT EXISTS `notification_delivery_events` (
	`provider_event_id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_message_id` text NOT NULL,
	`event_type` text NOT NULL,
	`status` text NOT NULL,
	`occurred_at` text NOT NULL,
	`received_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notification_delivery_events_message_idx` ON `notification_delivery_events` (`provider_message_id`,`occurred_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notification_deliveries_provider_message_idx` ON `notification_deliveries` (`provider_message_id`) WHERE `provider_message_id` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `notification_suppressions` (
	`email` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`reason` text NOT NULL,
	`provider_event_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notification_suppressions_updated_idx` ON `notification_suppressions` (`updated_at`);
