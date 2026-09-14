ALTER TABLE indexed_chain_events ADD COLUMN topics_json TEXT;
--> statement-breakpoint
ALTER TABLE indexed_chain_events ADD COLUMN data_hex TEXT;
--> statement-breakpoint
PRAGMA optimize;
