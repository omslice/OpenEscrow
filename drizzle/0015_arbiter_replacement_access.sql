CREATE TABLE IF NOT EXISTS arbiter_replacement_access (
  negotiation_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  wallet TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  proposed_by_role TEXT NOT NULL
    CHECK (proposed_by_role IN ('landlord', 'tenant')),
  status TEXT NOT NULL
    CHECK (status IN ('proposed', 'confirmed')),
  proposed_tx_hash TEXT NOT NULL UNIQUE,
  confirmed_tx_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (negotiation_id)
    REFERENCES agreement_negotiations(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS arbiter_replacement_access_status_idx
ON arbiter_replacement_access (status, updated_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS arbiter_replacement_account_access (
  token_hash TEXT PRIMARY KEY,
  negotiation_id TEXT NOT NULL,
  FOREIGN KEY (token_hash)
    REFERENCES negotiation_account_access(token_hash) ON DELETE CASCADE,
  FOREIGN KEY (negotiation_id)
    REFERENCES agreement_negotiations(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS arbiter_replacement_account_access_negotiation_idx
ON arbiter_replacement_account_access (negotiation_id);
