CREATE TABLE IF NOT EXISTS funding_checkout_attempts (
  attempt_id TEXT PRIMARY KEY,
  negotiation_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  intent_key TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment = 'sandbox'),
  asset_id TEXT NOT NULL,
  provider_strategy TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  amount_micros TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (negotiation_id) REFERENCES agreement_negotiations(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES negotiation_tenants(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS funding_checkout_attempts_history_idx
ON funding_checkout_attempts (negotiation_id, tenant_id, created_at DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS funding_checkout_attempts_active_tenant_idx
ON funding_checkout_attempts (negotiation_id, tenant_id)
WHERE status IN ('opening', 'submitted', 'unknown', 'confirmed', 'refund_pending');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS funding_checkout_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_status TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  UNIQUE (attempt_id, event_id),
  FOREIGN KEY (attempt_id) REFERENCES funding_checkout_attempts(attempt_id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS funding_checkout_events_attempt_idx
ON funding_checkout_events (attempt_id, sequence);
