# OpenEscrow owner actions

This is the running list of work that requires the project owner's credentials,
accounts, signatures, private decisions, or external professional engagement.
Codex should review and summarize the open items from this file whenever the
owner asks for a progress update.

Do not paste passwords, private keys, API keys, encryption keys, recovery
material, or identity documents into chat. Complete secret entry in the
provider or hosting control that owns the secret.

## Actionable now

- [ ] **Reauthorize the existing Sites project source repository.** The public site remains on
  saved version 56 while the validated candidate is on the GitHub branch
  `codex/account-wallet-onboarding`. The Sites source credential is currently unavailable, so
  Codex cannot push the exact candidate source and save a new undeployed version. Reauthorize the
  project connection in the Sites/Codex UI; never paste the short-lived token into chat.
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
  manager. Give the active evidence key a stable `EVIDENCE_ENCRYPTION_KEY_ID`;
  during rotation, retain the prior key in the secret
  `EVIDENCE_DECRYPTION_KEYS` keyring until an approved retention/deletion policy
  permits its removal.
- [ ] **Enter the notification, address-attestation, and evidence values in the
  existing Sites/Worker configuration.** Required values and verification
  steps are in [`pilot-services-setup.md`](./pilot-services-setup.md). Do this
  only when the corresponding development release is approved for deployment.
- [ ] **Activate the 15-minute hosted Cron Trigger** and confirm its first
  successful run after the notification/source-monitor release is deployed.
- [ ] **Let the official-source baseline complete and resolve every blocking
  source alert.** Ask Codex for the deployed readiness report after each
  scheduled batch; a changed source needs a new official-source review and
  versioned rule update, not a configuration bypass.
- [ ] **Run the separate-account operator test.** Use invented identities,
  separate landlord and tenant Google accounts, and worthless Base Sepolia
  tokens; follow [`testnet-pilot-runbook.md`](./testnet-pilot-runbook.md).

## Needed before fiat sandbox evaluation

- [ ] **Enable a sandbox on-ramp provider in the existing Privy application**
  and add the local and hosted OpenEscrow origins. Let Privy's funding layer
  present eligible providers rather than hard-wiring a vendor in the client.
  No real-money provider mode should be enabled while the contracts are on Base
  Sepolia.
- [ ] **Complete any provider sandbox approval or credential setup required by
  the Privy dashboard.** Keep all secret material in provider/hosting controls;
  never put a secret in a `VITE_` build variable or send it in chat.
- [ ] **Choose whether the pilot needs ACH/bank-deposit funding in addition to
  card and wallet checkout.** Privy's bank-deposit path currently requires
  separate Bridge setup, API keys, and KYC operations, so it should be evaluated
  as a second phase for full-sized deposits.

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
