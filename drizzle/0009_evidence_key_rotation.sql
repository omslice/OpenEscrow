ALTER TABLE evidence_files ADD COLUMN encryption_key_id TEXT;
--> statement-breakpoint
UPDATE evidence_files
SET encryption_key_id = 'primary'
WHERE encryption_version IS NOT NULL AND encryption_key_id IS NULL;
