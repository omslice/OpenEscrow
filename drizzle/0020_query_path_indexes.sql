CREATE INDEX IF NOT EXISTS agreement_negotiations_landlord_discovery_idx
ON agreement_negotiations (lower(landlord_email), updated_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS agreement_negotiations_arbiter_discovery_idx
ON agreement_negotiations (lower(arbiter_email), updated_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS agreement_negotiations_status_updated_idx
ON agreement_negotiations (status, updated_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS negotiation_tenants_email_discovery_idx
ON negotiation_tenants (lower(email), negotiation_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS arbiter_replacement_access_email_discovery_idx
ON arbiter_replacement_access (lower(email), negotiation_id)
WHERE status = 'confirmed';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS negotiation_account_access_expires_idx
ON negotiation_account_access (expires_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS negotiation_account_access_session_idx
ON negotiation_account_access
  (negotiation_id, user_id, role, created_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS negotiation_account_access_user_idx
ON negotiation_account_access (user_id, expires_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notification_preferences_email_consent_idx
ON notification_preferences (lower(email))
WHERE consented_at IS NOT NULL;
--> statement-breakpoint
PRAGMA optimize;
