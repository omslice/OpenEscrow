CREATE TABLE IF NOT EXISTS api_rate_limits (
  bucket TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  window_started_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (bucket, subject_hash, window_started_at)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS api_rate_limits_updated_idx
ON api_rate_limits (updated_at);
--> statement-breakpoint
PRAGMA optimize;
