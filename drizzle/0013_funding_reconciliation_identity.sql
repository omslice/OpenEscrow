ALTER TABLE funding_checkout_events
ADD COLUMN reconciliation_key TEXT;
--> statement-breakpoint
ALTER TABLE funding_checkout_events
ADD COLUMN payload_digest TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS funding_checkout_events_reconciliation_idx
ON funding_checkout_events (reconciliation_key)
WHERE reconciliation_key IS NOT NULL;
