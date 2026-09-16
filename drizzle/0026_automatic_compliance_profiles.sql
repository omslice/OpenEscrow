CREATE TABLE IF NOT EXISTS compliance_source_texts (
  source_key TEXT NOT NULL, source_digest TEXT NOT NULL, base_version TEXT NOT NULL,
  source_text TEXT NOT NULL, first_checked_at TEXT NOT NULL, profile_version TEXT,
  PRIMARY KEY (source_key, source_digest)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS compliance_generated_profiles (
  profile_version TEXT PRIMARY KEY, source_key TEXT NOT NULL, source_digest TEXT NOT NULL,
  base_version TEXT NOT NULL, generated_at TEXT NOT NULL, changes_json TEXT NOT NULL, profile_json TEXT,
  UNIQUE (source_key, source_digest, base_version)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS compliance_update_locks (
  source_key TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at TEXT NOT NULL
);
