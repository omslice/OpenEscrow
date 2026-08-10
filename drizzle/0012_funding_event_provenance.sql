ALTER TABLE funding_checkout_events
ADD COLUMN source TEXT NOT NULL DEFAULT 'browser_callback'
CHECK (source IN ('browser_callback', 'provider_webhook', 'operator_reconciliation'));
--> statement-breakpoint
ALTER TABLE funding_checkout_events
ADD COLUMN verification TEXT NOT NULL DEFAULT 'unverified'
CHECK (verification IN ('unverified', 'provider_signed', 'operator_verified'));
