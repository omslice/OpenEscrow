# OpenEscrow owner actions

This is the running list of work that requires the project owner's credentials,
accounts, signatures, private decisions, or external professional engagement.
Codex should review and summarize the open items from this file whenever the
owner asks for a progress update.

Do not paste passwords, private keys, API keys, encryption keys, recovery
material, or identity documents into chat. Complete secret entry in the
provider or hosting control that owns the secret.

## Actionable now

- [ ] **Broadcast the version-matched Base Sepolia activity registry.**
  From a private local PowerShell terminal, run
  `.\scripts\Broadcast-AgreementActivityRegistryBaseSepolia.ps1` and enter the
  encrypted `openescrow-base-sepolia` keystore password only at the local
  Foundry prompt. Send Codex the resulting public transaction hash or confirm
  that `deployments/base-sepolia-activity-registry.json` was created. See
  [`agreement-activity-registry-deployment.md`](./agreement-activity-registry-deployment.md).
- [ ] **Choose the first pilot markets for local-rule coverage.**
  State law is routed nationwide, but only Chicago, Seattle, and Portland have
  reviewed city overlays. Name the cities/counties most likely to be used in
  the first pilot so Codex can prioritize official-source local profiles.
- [ ] **Verify a notification sending domain and create a sending-only Resend
  key.** Prefer a dedicated subdomain such as `notify.openescrow.org`.
- [ ] **Create and safely store hosted runtime secrets.** Generate an
  `ADDRESS_ATTESTATION_SECRET` from at least 32 random bytes and an
  `EVIDENCE_ENCRYPTION_KEY` as documented. Keep the evidence key in a password
  manager; losing or changing it makes existing encrypted evidence
  unrecoverable.
- [ ] **Enter the notification, address-attestation, and evidence values in the
  existing Sites/Worker configuration.** Required values and verification
  steps are in [`pilot-services-setup.md`](./pilot-services-setup.md). Do this
  only when the corresponding development release is approved for deployment.
- [ ] **Activate the 15-minute hosted Cron Trigger** and confirm its first
  successful run after the notification/source-monitor release is deployed.
- [ ] **Run the separate-account operator test.** Use invented identities,
  separate landlord and tenant Google accounts, and worthless Base Sepolia
  tokens; follow [`testnet-pilot-runbook.md`](./testnet-pilot-runbook.md).

## Needed before fiat sandbox evaluation

- [ ] **Enable a sandbox on-ramp provider in the existing Privy application**
  and add the local and hosted OpenEscrow origins. No real-money provider mode
  should be enabled while the contracts are on Base Sepolia.
- [ ] **Supply provider sandbox credentials/configuration through the provider
  and hosting controls** after Codex has finished and validated the selected
  adapter.

## Needed before any real-money or production pilot

- [ ] **Retain qualified counsel** for the selected pilot jurisdictions,
  escrow/custody, money-transmission, consumer-finance, privacy, tax, sanctions,
  and yield-product analysis. Software research is not a substitute for legal
  advice.
- [ ] **Commission an independent smart-contract and application security
  audit** for the exact release candidate and deployed configuration.
- [ ] **Select and contract with regulated on-ramp/off-ramp and custody
  providers**, complete their application review, and approve the full
  KYC/AML, webhook, failure, refund, fee, and support flows.
- [ ] **Approve production policies and operations** for evidence retention,
  encryption-key recovery/rotation, incident response, customer support,
  disputes, accessibility, privacy requests, and breach notification.
- [ ] **Approve the mainnet release envelope** only after the legal, security,
  provider, reliability, and supervised-pilot gates are documented as passed.

## Completed owner actions

Move an item here with its completion date and public verification reference.
Never record a secret value.
