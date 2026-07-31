CREATE TRIGGER IF NOT EXISTS funding_checkout_events_provenance_insert_guard
BEFORE INSERT ON funding_checkout_events
FOR EACH ROW
WHEN NOT COALESCE((
  (
    NEW.source = 'browser_callback'
    AND NEW.verification = 'unverified'
    AND NEW.reconciliation_key IS NULL
    AND NEW.payload_digest IS NULL
  )
  OR
  (
    NEW.source = 'provider_webhook'
    AND NEW.verification = 'provider_signed'
    AND length(NEW.reconciliation_key) = 71
    AND substr(NEW.reconciliation_key, 1, 7) = 'sha256:'
    AND substr(NEW.reconciliation_key, 8) NOT GLOB '*[^0-9a-f]*'
    AND length(NEW.payload_digest) = 71
    AND substr(NEW.payload_digest, 1, 7) = 'sha256:'
    AND substr(NEW.payload_digest, 8) NOT GLOB '*[^0-9a-f]*'
  )
  OR
  (
    NEW.source = 'operator_reconciliation'
    AND NEW.verification = 'operator_verified'
    AND length(NEW.reconciliation_key) = 71
    AND substr(NEW.reconciliation_key, 1, 7) = 'sha256:'
    AND substr(NEW.reconciliation_key, 8) NOT GLOB '*[^0-9a-f]*'
    AND length(NEW.payload_digest) = 71
    AND substr(NEW.payload_digest, 1, 7) = 'sha256:'
    AND substr(NEW.payload_digest, 8) NOT GLOB '*[^0-9a-f]*'
  )
), 0)
BEGIN
  SELECT RAISE(ABORT, 'invalid funding checkout event provenance');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS funding_checkout_events_provenance_update_guard
BEFORE UPDATE OF source, verification, reconciliation_key, payload_digest
ON funding_checkout_events
FOR EACH ROW
WHEN NOT COALESCE((
  (
    NEW.source = 'browser_callback'
    AND NEW.verification = 'unverified'
    AND NEW.reconciliation_key IS NULL
    AND NEW.payload_digest IS NULL
  )
  OR
  (
    NEW.source = 'provider_webhook'
    AND NEW.verification = 'provider_signed'
    AND length(NEW.reconciliation_key) = 71
    AND substr(NEW.reconciliation_key, 1, 7) = 'sha256:'
    AND substr(NEW.reconciliation_key, 8) NOT GLOB '*[^0-9a-f]*'
    AND length(NEW.payload_digest) = 71
    AND substr(NEW.payload_digest, 1, 7) = 'sha256:'
    AND substr(NEW.payload_digest, 8) NOT GLOB '*[^0-9a-f]*'
  )
  OR
  (
    NEW.source = 'operator_reconciliation'
    AND NEW.verification = 'operator_verified'
    AND length(NEW.reconciliation_key) = 71
    AND substr(NEW.reconciliation_key, 1, 7) = 'sha256:'
    AND substr(NEW.reconciliation_key, 8) NOT GLOB '*[^0-9a-f]*'
    AND length(NEW.payload_digest) = 71
    AND substr(NEW.payload_digest, 1, 7) = 'sha256:'
    AND substr(NEW.payload_digest, 8) NOT GLOB '*[^0-9a-f]*'
  )
), 0)
BEGIN
  SELECT RAISE(ABORT, 'invalid funding checkout event provenance');
END;
