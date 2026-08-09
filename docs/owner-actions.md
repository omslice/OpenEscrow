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
5. Configure only the remaining sending-email values when ready. Evidence encryption, address
   attestation, private R2, and the hosted scheduler are already configured and verified; preserve
   those existing controls and keep every secret in its owning dashboard.

## Actionable now

- [x] **Choose and connect the OpenEscrow canonical domain — completed 2026-08-08.**
  `https://openescrow.io/` serves the single unified public introduction and Base Sepolia MVP.
  The `workers.dev` origin remains a rollback route, and ChatGPT Sites remains the synchronized
  mirror/data reference. There is no second public landing application.
- [x] **Activate private Cloudflare R2 — completed 2026-08-08.** The owner activated R2 in the
  intended account. Codex created separate staging and production-testnet evidence buckets and
  verified that public `r2.dev` access is disabled, no custom domains are attached, and both
  buckets are empty. Application-layer encryption and recovery checks remain mandatory.
- [x] **Choose the hosted-data continuity policy — completed 2026-08-08.** Cloudflare D1/R2 is
  the sole writable hosted record for new activity. The Sites hostname redirects users to
  `openescrow.io` and rejects writes while its historical synthetic D1/R2 remains untouched as a
  rollback archive. No migration is claimed. A future import remains optional and must satisfy the
  complete-export and fail-closed comparison procedure in
  [`hosted-data-continuity.md`](./hosted-data-continuity.md).
- [x] **Add the canonical Cloudflare app origin to Privy — completed 2026-08-08.**
  `https://openescrow.io`, the `workers.dev` fallback, and the ChatGPT Sites mirror are allowed
  origins for the existing OpenEscrow Privy application. The deploy verifier fails closed when
  a hosted origin is not accepted.
- [x] **Finish the verified OpenEscrow sending domain — completed 2026-08-08.** Resend sends as
  `OpenEscrow <notifications@updates.openescrow.io>`. SPF, DKIM, DMARC, the signed delivery webhook,
  notification scheduler, and default participant preferences are configured. A live custom-domain
  message reached `delivered`, with both `email.sent` and `email.delivered` webhook events recorded
  in canonical D1. Keep credentials in Worker secret controls and never expose a secret in a client
  build variable.
- [ ] **Finish acceptance testing for the published privacy/security contact.** The Privacy Policy,
  Terms, Security Policy and Code of Conduct publish `privacy@openescrow.io`. Owner-authorized
  Cloudflare forwarding for `privacy@` and `omri@` now targets a verified private destination, and
  root MX/SPF records resolve. Define an authenticated outbound reply path, record a private operator
  and backup cadence, and pass external receive and reply tests from two providers. Preserve the
  working `updates.openescrow.io` Resend records. The detailed acceptance record remains in the
  private funding workspace; no DNS, mailbox or test-message action is authorized by this file.
- [ ] **Approve the reviewer-safe repository publication tranche.** Review the community-health,
  funding-transparency and evidence-manifest changes. The release commits are already pushed to the
  public feature branch, while the default `main` branch still exposes the older July snapshot. A
  read-only 2026-08-09 inspection proved that the independently modified
  `frontend-site-dist.tar` exactly matches the ignored 320-file July `site-deploy-artifact/` tree;
  both the working and `HEAD` tar contain the legacy Sites hostname, lack `openescrow.io`, and
  predate the funding route. Keep it outside the selected path commit. The recommended separate
  owner decision is to remove the obsolete tracked bundle after confirming no supported workflow
  consumes it; do not restore or publish it as current evidence. Approve the exact branch, path
  list, commit message and push separately; follow
  [`reviewer-publication-runbook.md`](./reviewer-publication-runbook.md).
- [ ] **Confirm the public funding opening facts and deployment.** The local `/funding` route is
  fail-closed and currently publishes no balance or recipient. Before deployment, confirm all prior
  grants, donations, sponsorships, rewards and investment; the recipient/entity/fiscal-host
  description; any public receiving address; a monitored funding contact; the confirmation date;
  and whether pending applications may be named. Publishing source does not authorize deploying
  the route or changing those facts.
- [ ] **Resolve the legacy Sites rollback.** A dual-host transition release was recorded on
  2026-08-08, but current applications, demos and reviewer links must use only `openescrow.io`.
  Do not republish the stale tracked Sites tar. Before any external host deletion, owner must review
  the data-continuity/export requirements and explicitly approve decommissioning; until then, treat
  the legacy host and artifact as rollback/forensic state rather than a public product URL.
- [x] **Broadcast the reviewed narrow Base Sepolia registry recovery — completed 2026-08-09.**
  Registry `0x5ba6...092e` was deployed at block `45,247,418`, bound immutably to the active F18
  escrow, without moving agreement state or funds. The local encrypted keystore remained outside
  the repository and chat.
- [x] **Return and independently verify the public registry record — completed 2026-08-09.** The
  receipt succeeded; two public RPC reads returned the reviewed 1,837-byte runtime and expected
  runtime hash; `ESCROW()` returned F18; and no-broadcast calls succeeded for the live landlord and
  both tenants while rejecting an outsider. The retired C004 registry remains an immutable
  historical reference and is not a fallback for the active escrow.
- [ ] **Evaluate a future hardened three-contract cohort separately.** A later escrow/reserve/
  registry deployment can incorporate the newest reviewed contract hardening, but it will not
  migrate active F18 agreement state. Keep it separate from the narrow registry readiness repair
  and require the full [`base-sepolia-deployment.md`](./base-sepolia-deployment.md) gate.
- [ ] **Choose the first pilot markets for local-rule coverage.**
  State law is routed nationwide, but only Chicago, Seattle, and Portland have
  reviewed city overlays. Name the cities/counties most likely to be used in
  the first pilot so Codex can prioritize official-source local profiles.
- [ ] **Activate the New Hampshire external source workflow after this release reaches `main`.**
  In GitHub repository settings, confirm Actions has `Read and write permissions`, then manually
  run the **Compliance source monitor** workflow once. Confirm it creates the public
  `compliance-attestations` branch with `state-nh.json` reporting `unchanged`, and confirm the next
  scheduled run succeeds. No new secret is required. Do not edit the attestation by hand or turn
  off the hosted compliance monitor. The app will block New Hampshire proposals if the
  observation is changed, malformed, unavailable, or more than 48 hours old.
- [ ] **Approve a property-timezone source and local-time policy for the pilot.** The candidate
  rejects ambiguous stored timestamps and shows the participant's device timezone, but it cannot
  yet attest that the device and property share the same IANA timezone or decide how a legal
  deadline should treat daylight-saving transitions. Select this with the address provider and
  qualified reviewer before relying on calculated deadlines in a supervised pilot.
- [x] **Create and safely store the Cloudflare evidence and address secrets — completed
  2026-08-08.** Hosted readiness verifies tamper-resistant address profiles, encrypted private-R2
  evidence, the active key ID, and a complete retained keyring with zero missing, unverified, or
  mismatched referenced keys. Continue to keep recovery material outside chat and Git.
- [x] **Activate the 15-minute hosted Cron Trigger — completed 2026-08-08.** Cloudflare readiness
  reports a healthy scheduled run at the expected cadence. Notification jobs will begin sending
  only after the separate email-provider credential is configured.
- [ ] **Set a conservative Privy Base Sepolia sponsorship policy, budget, and alert.** The Worker
  now limits hosted API traffic, but a wallet can submit sponsored transactions without passing
  through that API limiter. Keep sponsorship testnet-only, restrict eligible methods/contracts if
  the dashboard supports it, and choose a spend threshold that stops abuse without affecting the
  synthetic pilot.
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

- [x] **Authorized the local Cloudflare deployment session — 2026-08-07.** Wrangler OAuth was
  active for the owner-authorized Cloudflare account. Unrelated accounts remained out of scope,
  and no credential was stored in the repository or chat.

- [x] **Approved exact Sites version 145 deployed — 2026-08-03.** The public site and readiness
  endpoint returned HTTP 200 and reported source commit
  `7eee06088eda8241b242eaeb882eaab1e09d0191`. Existing D1/R2 bindings and hosted data were
  preserved.

- [x] **Sites source connection refreshed and exact candidate saved undeployed — 2026-07-29.**
  The source credential was used ephemerally and was not persisted. Production was not changed.
