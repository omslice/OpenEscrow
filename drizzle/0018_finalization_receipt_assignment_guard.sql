CREATE TRIGGER IF NOT EXISTS negotiation_receipt_guards_unique_finalization
BEFORE INSERT ON negotiation_receipt_guards
FOR EACH ROW
WHEN NEW.action = 'posted_onchain'
AND EXISTS (
  SELECT 1
  FROM negotiation_receipt_guards
  WHERE action = 'posted_onchain'
    AND transaction_hash = lower(NEW.transaction_hash)
    AND negotiation_id <> NEW.negotiation_id
)
BEGIN
  SELECT RAISE(ABORT, 'finalization receipt already assigned');
END;
