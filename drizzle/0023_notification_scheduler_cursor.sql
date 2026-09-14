CREATE TABLE IF NOT EXISTS scheduled_job_cursors (
  name TEXT PRIMARY KEY,
  cursor_id TEXT,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS agreement_negotiations_status_id_idx
ON agreement_negotiations (status, id);
--> statement-breakpoint
PRAGMA optimize;
