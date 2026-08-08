# OpenEscrow owner actions

This is the running list of work that requires the project owner's credentials,
accounts, signatures, private decisions, or external professional engagement.
Codex should review and summarize the open items from this file whenever the
owner asks for a progress update.

For one supervised weekend session, start with the shorter
[`owner-weekend-checklist.md`](./owner-weekend-checklist.md), then return here for the complete
running list and future tracks.

Do not paste passwords, private keys, API keys, encryption keys, recovery
material, or identity documents into chat. Complete secret entry in the
provider or hosting control that owns the secret.

## Recommended weekend sequence

1. Review the exact hardened contract candidate and the independent-audit handoff.
2. In a private PowerShell window, use the encrypted Foundry keystore to broadcast the
   unified Base Sepolia escrow/reserve/registry cohort. Never paste the key or password here.
3. Share only the public candidate manifest and transaction hashes. Codex can verify code and
   bindings, prepare the reversible configuration switch, and preserve the current cohort.
4. Run the separate-account synthetic pilot and the incident/privacy drill after the new site
   candidate is explicitly approved and deployed.
5. Configure email, evidence encryption, address attestation, and the hosted scheduler when the
   matching release is ready; keep every secret in its owning dashboard.

## Actionable now

- [ ] **Choose the OpenEscrow Cloudflare domain.** The primary domain will serve both the public
  project introduction and the Base Sepolia MVP. If `app.<domain>` is reserved, it should redirect
  to the primary domain rather than host a second application. Confirm that the domain is an active
  zone in the intended Cloudflare account; do not share account credentials.
- [x] **Activate private Cloudflare R2 — completed 2026-08-08.** The owner activated R2 in the
  intended account. Codex created separate staging and production-testnet evidence buckets and
  verified that public `r2.dev` access is disabled, no custom domains are attached, and both
  buckets are empty. Application-layer encryption and recovery checks remain mandatory.
- [ ] **Choose the hosted-data continuity policy.** Decide whether the current synthetic Sites D1
  records and R2 evidence must be migrated or may remain in the rollback deployment while the
  owner-hosted Cloudflare pilot starts with a clearly disclosed fresh synthetic dataset. No
  migration or destination overwrite should occur until a complete export and comparison are
  verified.
- [ ] **Enter Cloudflare runtime secrets and update provider origins only after staging exists.**
  Keep notification, Privy, RPC, evidence-encryption, and address-attestation values in their
  owning private controls. Add the staging and final `app` origins to Privy/OAuth/provider
  allowlists without exposing a secret in a client build variable.
- [ ] **Review and explicitly approve the newest exact Sites candidate before deployment.** The
  public testnet matches the last approved exact source and exposes its release provenance. Newer
  validated work is saved as a separate undeployed candidate; selecting and promoting it remains
  a separate public action, followed by readiness verification.
- [ ] **Review and broadcast a hardened Base Sepolia escrow/reserve/registry cohort.** The latest source adds
  reciprocal immutable deployment binding, exact reserve phase gates, checks-effects-interactions
  funding, and a contract-wide cross-function reentrancy lock. The existing escrow and reserve are
  immutable and cannot be upgraded in place. After reviewing the exact candidate, use the private
  local deployment procedure to create one mutually bound three-contract cohort; share only its
  public transaction hashes and generated candidate manifest, never the keystore password. Do not
  change the app configuration or retire
  the existing testnet cohort until the new bytecode and mutual bindings have been verified. See
  [`base-sepolia-deployment.md`](./base-sepolia-deployment.md).
- [ ] **Return the public candidate manifest for verification before configuration changes.**
  Codex can verify all three receipts, runtime code, reciprocal bindings, token addresses,
  registry binding, deployment blocks, and source commit without receiving a secret. The existing
  Base Sepolia cohort remains configured and available as the explicit rollback target until the
  candidate and a new Sites build are approved.
- [ ] **Choose the first pilot markets for local-rule coverage.**
  State law is routed nationwide, but only Chicago, Seattle, and Portland have
  reviewed city overlays. Name the cities/counties most likely to be used in
  the first pilot so Codex can prioritize official-source local profiles.
- [ ] **Approve a property-timezone source and local-time policy for the pilot.** The candidate
  rejects ambiguous stored timestamps and shows the participant's device timezone, but it cannot
  yet attest that the device and property share the same IANA timezone or decide how a legal
  deadline should treat daylight-saving transitions. Select this with the address provider and
  qualified reviewer before relying on calculated deadlines in a supervised pilot.
- [ ] **Verify a notification sending domain and create a sending-only Resend
  key.** Prefer a dedicated subdomain such as `notify.openescrow.org`.
- [ ] **Create and safely store hosted runtime secrets.** Generate an
  `ADDRESS_ATTESTATION_SECRET` from at least 32 random bytes and an
  `EVIDENCE_ENCRYPTION_KEY` as documented. Keep the evidence key in a password
  manager. Give the active evidence key a stable `EVIDENCE_ENCRYPTION_KEY_ID`;
  during rotation, retain the prior key in the secret
  `EVIDENCE_DECRYPTION_KEYS` keyring until an approved retention/deletion policy
  permits its removal. After restoring or rotating a key, require hosted
  readiness to report zero missing, unverified, and mismatched evidence keys.
- [ ] **Enter the notification, address-attestation, and evidence values in the
  existing Sites/Worker configuration.** Required values and verification
  steps are in [`pilot-services-setup.md`](./pilot-services-setup.md). Do this
  only when the corresponding development release is approved for deployment.
- [ ] **Activate the 15-minute hosted Cron Trigger** and confirm its first
  successful run after the notification/source-monitor release is deployed.
- [ ] **Set a conservative Privy Base Sepolia sponsorship policy, budget, and alert.** The Worker
  now limits hosted API traffic, but a wallet can submit sponsored transactions without passing
  through that API limiter. Keep sponsorship testnet-only, restrict eligible methods/contracts if
  the dashboard supports it, and choose a spend threshold that stops abuse without affecting the
  synthetic pilot.
- [ ] **Let the official-source baseline complete and resolve every blocking
  source alert.** Ask Codex for the deployed readiness report after each
  scheduled batch; a changed source needs a new official-source review and
  versioned rule update, not a configuration bypass. The proposal's source
  recheck also remains unavailable until the hosted monitor and D1 storage are
  enabled.
- [ ] **Run the separate-account operator test.** Use invented identities,
  separate landlord and tenant Google accounts, and worthless Base Sepolia
  tokens; follow [`testnet-pilot-runbook.md`](./testnet-pilot-runbook.md).
- [ ] **Lead the supervised incident-response and privacy-request drill.** Assign an incident
  lead and recorder, use only synthetic testnet data, and follow
  [`testnet-incident-response-runbook.md`](./testnet-incident-response-runbook.md). Record the
  stop/resume decision and unresolved policy questions without putting secrets in the log.

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
  audit** for the exact release candidate and deployed configuration. Start with
  [`independent-audit-handoff.md`](./independent-audit-handoff.md) and require the reviewer to name
  the exact commit and regenerate its contract-assurance evidence.
- [ ] **Select and contract with regulated on-ramp/off-ramp and custody
  providers**, complete their application review, and approve the full
  KYC/AML, webhook, failure, refund, fee, and support flows.
- [ ] **Approve production policies and operations** for evidence retention,
  encryption-key recovery/rotation, incident response, customer support,
  disputes, accessibility, privacy requests, and breach notification.
- [ ] **Approve the mainnet release envelope** only after the legal, security,
  provider, reliability, and supervised-pilot gates are documented as passed.

## Needed before international expansion

- [ ] **Choose the first international market cohort.** Canada, the United
  Kingdom, Australia, and Germany are current research candidates, but the
  launch order should follow actual pilot demand.
- [ ] **Choose supported languages, currencies, tenancy segments, and local
  coverage for each market.** Deposit-only residential coverage is the current
  planning boundary.
- [ ] **Retain qualified local reviewers before enabling a market.** The
  landlord confirmation and official-source links are safeguards, not a
  substitute for accurate product guidance and local review.

## Needed when monetization discovery begins

- [ ] **Recruit a small set of pilot interviewees across customer types.** Include at least
  individual landlords, property managers, and tenant advocates so pricing is based on a useful
  managed outcome rather than limiting access to the open-source core.
- [ ] **Choose the first commercial hypothesis only after those interviews.** Likely candidates
  are managed hosting, professional multi-property workflows, integrations, and support; defer
  billing implementation until willingness to pay and cost to serve are documented.
- [ ] **Approve the business-model guardrails.** No sale of personal data, essential-record
  paywalls, undisclosed provider incentives, pay-to-route behavior, or production custody/yield
  monetization without the required legal and provider review.

## Completed owner actions

Move an item here with its completion date and public verification reference.
Never record a secret value.

- [x] **Authorized the local Cloudflare deployment session — 2026-08-07.** Wrangler OAuth is
  active for `Omrigross@gmail.com's Account`. The unrelated `Piper` account remains out of scope,
  and no credential was stored in the repository or chat.

- [x] **Approved exact Sites version 145 deployed — 2026-08-03.** The public site and readiness
  endpoint returned HTTP 200 and reported source commit
  `7eee06088eda8241b242eaeb882eaab1e09d0191`. Existing D1/R2 bindings and hosted data were
  preserved.

- [x] **Sites source connection refreshed and exact candidate saved undeployed — 2026-07-29.**
  The source credential was used ephemerally and was not persisted. Production was not changed.
