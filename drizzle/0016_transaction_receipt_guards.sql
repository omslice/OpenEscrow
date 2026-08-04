CREATE TABLE IF NOT EXISTS negotiation_receipt_guards (
  negotiation_id TEXT NOT NULL,
  action TEXT NOT NULL,
  transaction_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (negotiation_id, action, transaction_hash),
  FOREIGN KEY (negotiation_id)
    REFERENCES agreement_negotiations(id) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT OR IGNORE INTO negotiation_receipt_guards
  (negotiation_id, action, transaction_hash, created_at)
SELECT negotiation_id, action,
       lower(json_extract(metadata_json, '$.transactionHash')),
       MIN(created_at)
FROM negotiation_events
WHERE action IN (
  'posted_onchain',
  'operations_reserve_paid',
  'tenant_share_funded',
  'agreement_funded',
  'record_snapshot_anchored',
  'activity_hash_published',
  'deduction_claim_submitted',
  'deduction_claim_amended',
  'claim_response_submitted',
  'arbiter_ruling_submitted',
  'withdrawal_completed',
  'timeout_executed',
  'arbiter_replacement_proposed',
  'arbiter_replacement_confirmed',
  'arbiter_replacement_cancelled',
  'arbiter_replacement_accepted'
)
AND json_type(metadata_json, '$.transactionHash') = 'text'
GROUP BY negotiation_id, action,
         lower(json_extract(metadata_json, '$.transactionHash'));
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS negotiation_events_receipt_guard
BEFORE INSERT ON negotiation_events
WHEN NEW.action IN (
  'posted_onchain',
  'operations_reserve_paid',
  'tenant_share_funded',
  'agreement_funded',
  'record_snapshot_anchored',
  'activity_hash_published',
  'deduction_claim_submitted',
  'deduction_claim_amended',
  'claim_response_submitted',
  'arbiter_ruling_submitted',
  'withdrawal_completed',
  'timeout_executed',
  'arbiter_replacement_proposed',
  'arbiter_replacement_confirmed',
  'arbiter_replacement_cancelled',
  'arbiter_replacement_accepted'
)
AND json_type(NEW.metadata_json, '$.transactionHash') = 'text'
BEGIN
  INSERT INTO negotiation_receipt_guards
    (negotiation_id, action, transaction_hash, created_at)
  VALUES (
    NEW.negotiation_id,
    NEW.action,
    lower(json_extract(NEW.metadata_json, '$.transactionHash')),
    NEW.created_at
  );
END;
