# OpenEscrow owner weekend checklist

Use this short checklist for one supervised testnet session. The complete running list remains in
[`owner-actions.md`](./owner-actions.md); contract commands and verification details remain in the
linked deployment and pilot runbooks.

## Safety boundary

- [ ] Use only invented identities and worthless Base Sepolia assets.
- [ ] Keep every password, private key, API key, encryption key, recovery value, and identity
  document in its owning private control. Never paste one into chat, Git, a screenshot, or a
  candidate artifact.
- [ ] Stop if the source commit, candidate checksum, chain ID, contract address, D1/R2 binding,
  or readiness release provenance differs from the reviewed value.
- [ ] Do not enable production fiat, mainnet contracts, FRNT, USDY, or yield routes.

## Choose the release path

- [ ] **Code-only testnet candidate:** review an exact candidate that preserves the currently
  configured contract cohort. This can be evaluated without broadcasting contracts.
- [ ] **Hardened-cohort promotion:** review the contract candidate first, then follow the private
  [`base-sepolia-deployment.md`](./base-sepolia-deployment.md) procedure. Do not switch the app or
  retire the old cohort until the public manifest and all reciprocal bindings are verified.

Do not treat these paths as one automatic action. A new contract broadcast and a synchronized
Cloudflare/ChatGPT Sites application release are separate approvals with separate rollback
evidence.

## Credentialed setup

- [ ] Configure the sending-only email provider in the Cloudflare Worker secret control. Private
  R2, evidence encryption/keyring, address attestation, the 15-minute scheduler, RPC, and the
  current Privy origin are already configured and should not be recreated.
- [ ] Keep the official-source monitor enabled until every source is baselined, fresh, and free of
  changed/unreachable blockers. Investigate an alert; never bypass it by editing a status.
- [ ] Set a conservative Base Sepolia sponsorship budget and alert in Privy before inviting pilot
  accounts.
- [ ] Leave the funding provider sandbox disabled unless that separate no-money evaluation is the
  explicit purpose of the session.

## Supervised checks

- [ ] After any approved release, confirm both public pages and both `/api/system/readiness`
  endpoints return HTTP 200 and report the same exact reviewed source commit.
- [ ] Run the separate-account landlord/tenant workflow in
  [`testnet-pilot-runbook.md`](./testnet-pilot-runbook.md), including mobile/keyboard checks and
  the stop conditions.
- [ ] Run the owner-led incident/privacy exercise in
  [`testnet-incident-response-runbook.md`](./testnet-incident-response-runbook.md) with an incident
  lead and recorder.
- [ ] Record failures, decisions, and remediation without recording secrets or synthetic
  invitation credentials.

## What to return for verification

Share only public or sanitized evidence:

- [ ] the 40-character source commit and candidate-evidence SHA-256;
- [ ] public contract transaction hashes and the generated candidate deployment manifest, if a
  cohort was broadcast;
- [ ] both deployment URLs and sanitized readiness JSON after an approved dual-host release; and
- [ ] pilot/incident pass-fail notes and unresolved policy questions with identities and temporary
  credentials removed.

Do not return a keystore, password, provider credential, runtime secret, encryption key, recovery
value, bearer link, or identity document.
