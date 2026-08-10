ALTER TABLE evidence_files ADD COLUMN encryption_version TEXT;
--> statement-breakpoint
ALTER TABLE evidence_files ADD COLUMN encryption_iv TEXT;
