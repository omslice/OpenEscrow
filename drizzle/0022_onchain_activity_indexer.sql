CREATE TABLE IF NOT EXISTS onchain_indexer_state (
  name TEXT PRIMARY KEY,
  next_block INTEGER NOT NULL,
  latest_finalized_block INTEGER,
  last_started_at TEXT,
  last_succeeded_at TEXT,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS indexed_chain_events (
  chain_id INTEGER NOT NULL,
  contract_address TEXT NOT NULL,
  transaction_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  block_hash TEXT NOT NULL,
  onchain_agreement_id TEXT NOT NULL,
  negotiation_id TEXT,
  event_type TEXT NOT NULL,
  processing_status TEXT NOT NULL,
  indexed_at TEXT NOT NULL,
  processed_at TEXT,
  PRIMARY KEY (chain_id, transaction_hash, log_index),
  FOREIGN KEY (negotiation_id)
    REFERENCES agreement_negotiations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS indexed_chain_events_reconciliation_idx
ON indexed_chain_events (processing_status, onchain_agreement_id, block_number);

CREATE INDEX IF NOT EXISTS indexed_chain_events_negotiation_idx
ON indexed_chain_events (negotiation_id, block_number, log_index);

CREATE UNIQUE INDEX IF NOT EXISTS negotiation_events_scheduled_notice_idx
ON negotiation_events (
  negotiation_id,
  json_extract(metadata_json, '$.idempotencyKey')
)
WHERE action = 'scheduled_notification_due';

PRAGMA optimize;
