ALTER TABLE agreement_negotiations ADD COLUMN onchain_contract_address TEXT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS agreement_negotiations_onchain_cohort_idx
ON agreement_negotiations (onchain_contract_address, onchain_agreement_id, status);
--> statement-breakpoint
PRAGMA optimize;
