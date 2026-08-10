ALTER TABLE `negotiation_tenants`
ADD COLUMN `deposit_share_bps` integer DEFAULT 10000 NOT NULL;
