# OpenEscrow mission-driven UAT plan

Status: active; exact candidate deployed and supervised hosted lifecycle in progress

Current release candidate: `356f76e8684a0078b04d43f4ef15528710081531`

Canonical hosted application: `https://openescrow.io/`  
Test-data rule: synthetic or disposable data only unless the owner explicitly authorizes otherwise.

## Acceptance north star

OpenEscrow succeeds when a landlord and every tenant can understand and complete a rental-security-deposit lifecycle—from mutually accepted terms, through funding and any documented deductions, to refund or withdrawal—while each participant sees only the information and actions appropriate to them and receives a clear, accurate, independently useful shared record.

A technically successful transaction is not sufficient. The experience must also be understandable, role-correct, privacy-preserving, recoverable, accessible, and honest about testnet and legal limitations.

## Release decision rule

Recommend release for grant-reviewer UAT only when:

1. Every critical requirement below is `Pass` or has a documented external blocker that does not expose funds, identities, private records, or misleading outcomes.
2. No open Severity 0 or Severity 1 defect remains.
3. Every fixed Severity 0–2 defect has focused regression coverage, a successful retest, and an adjacent regression pass.
4. The complete synthetic landlord/two-tenant lifecycle produces correct balances, notifications, state transitions, exports, and role-specific views.
5. Interrupted, stale, duplicate, unauthorized, and recovery paths fail safely and explain the next action.
6. Hosted provenance, readiness, accessibility, responsive behavior, and account isolation are verified against the exact candidate being recommended.

## Requirements traceability and measurable acceptance criteria

| ID | Mission requirement | Acceptance criteria | Priority | Source of truth | State |
|---|---|---|---|---|---|
| UAT-001 | Public purpose and safety boundary are immediately understandable. | A first-time visitor can identify the product, intended landlord/tenant outcome, testnet status, and prohibition on real deposits or personal documents without opening a technical guide. | Critical | README; public UI; owner direction | Local public-route review passes at 390, 768, and 1440 px; hosted first-visit comprehension pending |
| UAT-002 | Authentication and role selection are predictable. | Signed-out access offers Google or wallet authentication; general sign-in does not force a role; a valid role invitation selects only its intended role; the active role is visible beside the account name. | Critical | Grant reviewer guide; owner direction | Automated role/account regressions pass; hosted multi-account authentication pending |
| UAT-003 | Accounts and roles are isolated. | A participant can access only records and evidence authorized for that verified identity, wallet, role, and current invitation; alternate accounts, stale links, role swaps, and guessed identifiers fail closed without leaking existence or content. | Critical | Server authorization model; owner direction | Automated authorization/recovery baseline passes; manual adversarial account-isolation suite pending |
| UAT-004 | A landlord can create understandable, valid terms. | Required fields, tenant shares, dates, token choice, address validation, jurisdiction notes, and error recovery produce one coherent revision; shares total 100%; invalid or ambiguous inputs cannot be finalized. | Critical | MVP workflow; owner direction | Empty-save validation and non-JSON recovery pass locally; complete valid/ambiguous authoring matrix pending |
| UAT-005 | Every tenant reviews exactly the same current revision. | Each tenant receives a distinct current link, sees only their role, can compare material terms, and records explicit approval; publishing a new revision invalidates prior approvals and stale links. | Critical | Negotiation record; grant reviewer guide | Automated invitation/revision regressions pass; hosted distinct-recipient rehearsal pending |
| UAT-006 | Finalization is faithful and auditable. | Finalization is possible only after all required approvals; onchain values and participants match the approved revision; duplicate, rejected, interrupted, and stale finalization attempts recover without creating ambiguous records. | Critical | Contract and server lifecycle guards | Contract and recovery baselines pass; rendered multi-wallet finalization rehearsal pending |
| UAT-007 | Funding is role-correct and value-correct. | Each tenant funds only their disclosed share and reserve; required action is prominent; wallet and deposit balances show understandable USD-equivalent value plus token units; repeated or interrupted funding cannot overfund or misreport state. | Critical | Contract; funding UI; owner direction | Contract, funding recovery, reserve-refund, and value-label regressions pass locally; rendered multi-tenant hosted reconciliation pending |
| UAT-008 | Deposit yield benefits tenants without inflating landlord deductions. | For a yield-bearing test asset, a deduction entered in USD-equivalent terms converts to the correct token amount at settlement; the landlord cannot capture tenant yield; unused reserve and accrued tenant value return to tenants according to disclosed rules. | Critical | Owner acceptance direction; settlement accounting ADR | MVP contract settlement, reserve refund, and cross-surface regressions pass locally; hosted lifecycle pending |
| UAT-009 | Claims, responses, refunds, and withdrawals implement the approved policy. | Every permitted outcome has an unambiguous actor, deadline, amount, notification, and terminal state; silence is recorded according to the approved policy; the final allocation conserves value and matches the shared record. | Critical | Contract; MVP specification; owner-approved 2026-08-12 policy | Local remediation and regressions pass; hosted lifecycle pending |
| UAT-010 | Notifications are timely, private, and actionable. | Appropriate parties receive in-app and email notices for invitations, approval/finalization, funding, deadlines, claims, responses, allocations, failures, and withdrawals; every email has OpenEscrow branding and a canonical app link; bodies omit private agreement details. | High | Notification map; owner direction | Local notification-map and claim-policy regressions pass; hosted delivery/recipient/spam rehearsal pending |
| UAT-011 | The shared record is complete and useful. | The record contains the authoritative revision history, participants, timestamps, lifecycle actions, USD-equivalent and token amounts, evidence receipts, and terminal status; revisions are collapsible; exports are deterministic and human-readable. | Critical | Record workflow; owner direction | Automated record/recovery baseline passes; rendered closed-agreement and export reconciliation pending |
| UAT-012 | Private evidence and backups remain private and verifiable. | Unauthorized users cannot retrieve evidence; encrypted artifacts recover with authorized keys; hashes detect change without exposing content; public-proof language accurately distinguishes public metadata from private records. | Critical | Evidence architecture; privacy policy | Automated encryption, verification, and authorization baseline passes; manual adversarial evidence suite pending |
| UAT-013 | Output and data quality are internally consistent. | UI, D1, onchain receipts, emails, downloadable reports, and computed balances agree on IDs, roles, revision, dates, statuses, token units, USD-equivalent values, and totals; invariant checks show no unexplained value creation or loss. | Critical | Data model; contract invariants | Local contract/accounting regressions pass; cross-surface closed-agreement reconciliation pending |
| UAT-014 | Failures are safe and recoverable. | Network loss, RPC limits, rejected wallet actions, refreshes, duplicate clicks, delayed indexing, stale tabs, and provider failures produce accurate non-destructive guidance and a successful retry path. | Critical | Recovery requirements | Automated recovery baseline and one rendered non-JSON failure pass; remaining interruption/concurrency matrix pending |
| UAT-015 | Responsive and accessible operation is practical. | All critical workflows work at 390 px, 768 px, and 1440 px without clipping or horizontal page overflow; keyboard-only use, visible focus, names/labels, announcements, contrast, zoom, and reduced-motion behavior meet the automated and manual checklist. | High | WCAG-oriented project checks | Public routes, empty-save recovery, and invitation failure pass locally; authenticated dense/zoom/screen-reader scenarios pending |
| UAT-016 | The hosted release is reproducible and supportable. | Cloudflare and the retained Sites mirror report the exact clean commit; D1/R2 bindings and secrets are preserved; readiness is healthy or limitations are accurately disclosed; the standalone operator package matches documented constraints. | High | Deployment runbooks; self-host guide | Exact commit `356f76e` is deployed to Cloudflare and Sites with preserved bindings; HTTP/readiness and dual-host provenance checks pass. Strict compliance-source monitoring remains a separately disclosed non-green layer outside this functionality milestone. |

### Resolved claim-policy requirement

Owner direction approved on 2026-08-12 establishes two explicit modes. The default public MVP has no arbiter: tenant approval, partial approval, or dispute is preserved in the shared record, while a documented landlord claim is allocated after every tenant responds or a missed response is recorded. Silence is **No response**, never consent and never a dispute. An agreement that explicitly names an arbiter retains the bounded dispute workflow for unaccepted amounts. The local remediation candidate applies this policy consistently to the contracts, interface, indexed activity, email copy, receipt recovery, tests, and product documentation; a hosted end-to-end retest remains required before release.

## Controlled personas and data

No real tenancy, property, document, payment, or identity data may be used.

| Persona | Synthetic identity | Purpose |
|---|---|---|
| Landlord | `uat.landlord.<run>@example.invalid` plus a deterministic disposable test wallet | Proposal owner and claim actor |
| Tenant A | `uat.tenant.a.<run>@example.invalid` plus a deterministic disposable test wallet | First 60% participant |
| Tenant B | `uat.tenant.b.<run>@example.invalid` plus a deterministic disposable test wallet | Second 40% participant |
| Outsider | `uat.outsider.<run>@example.invalid` plus an unrelated disposable test wallet | Account-isolation and guessed-link testing |
| Alternate account | `uat.alternate.<run>@example.invalid` plus a separate disposable test wallet | Account-switch and stale-session testing |

Controlled agreement data:

- Run ID: UTC date plus a random suffix.
- Property: a public civic-building address used only to exercise geocoding; every free-text field states `SYNTHETIC UAT — NOT A TENANCY`.
- Deposit: 100.00 test USD-equivalent units, split 60/40 unless the scenario deliberately tests validation.
- Evidence: generated text/PDF/image fixtures containing only the run ID and `SYNTHETIC UAT ONLY`.
- Timing: accelerated testnet windows sufficient for deadline and recovery tests.
- Tokens: allowlisted test assets only; no mainnet assets or payment methods.

Hosted tests that require email/OAuth identities remain read-only until disposable accounts are available or the owner explicitly identifies existing accounts as disposable UAT accounts.

## Scenario suites

1. **Public and signed-out:** mission comprehension, safety boundary, legal/help/demo routes, direct deep links, malformed query/fragment values.
2. **Identity and isolation:** general sign-in, invitation role lock, account switching, wrong account, wrong wallet, stale token, revoked token, guessed IDs, archive visibility.
3. **Proposal authoring:** address search, partial/commaless input, jurisdiction result, state source refresh, tenant shares, date validation, token selection, save/reload, revision replacement.
4. **Approval and invitations:** distinct links, email status, resend, manual copy, stale revisions, partial approvals, duplicate approvals, wrong-recipient access.
5. **Finalization and funding:** wallet rejection, retry, duplicate click, indexing delay, multiple tenants, partial funding, exact amounts, reserve, balances, yield display.
6. **Claim/refund lifecycle:** no claim, full/partial claim, evidence, tenant response or silence per approved policy, deadline actions, allocations, withdrawals, completed status.
7. **Record and evidence:** revision history, collapsible sections, complete report, encrypted backup, proof save/verify, wrong key, changed artifact, unauthorized evidence.
8. **Notifications:** in-app/email recipient map, timing, canonical links, branding, privacy-minimal bodies, unsubscribe/suppression, retries, direct-onchain events.
9. **Resilience:** reload at every transaction phase, offline/API/RPC/provider failures, stale browser state, rate limiting, concurrent actions, corrupted local cache.
10. **Presentation:** phone/tablet/desktop, 80% and 200% zoom, keyboard-only, screen-reader semantics, focus order, contrast, reduced motion, empty/loading/error/dense states.

### Next bounded tranche

The highest-priority local tranche is complete. In addition to the tenant-only-yield and refundable-
reserve settlement design, the active candidate locks every normally closed withdrawal until the
claim-submission period ends and turns validated direct-chain events into value- and actor-aware
private Record entries. The full application gate, isolated 25-migration Wrangler D1 run, contract
assurance, and credential-free two-cohort deployment rehearsal pass. The next tranche is to freeze
the exact commit, obtain the owner's one supervised Base Sepolia signature for that cohort, apply
the additive hosted migration and verified address switch, then run the hosted landlord/two-tenant
lifecycle and cross-surface Record reconciliation.

## Execution protocol

Every scenario follows this loop:

1. Record the candidate commit, environment, run ID, personas, prerequisites, and expected result.
2. Execute with the minimum necessary synthetic data and capture stable evidence references.
3. Record actual behavior, affected requirement, severity, and reproducibility.
4. Diagnose the root cause across UI, API, D1/R2, notification provider, indexer, and contract boundaries.
5. Fix the issue in the isolated UAT branch without weakening authorization, invariants, or testnet boundaries.
6. Add focused automated regression coverage.
7. Retest the original scenario, then run adjacent workflow and account-isolation regressions.
8. Update the ledger with the exact fix, evidence, and status.

## Severity model

- **S0 — Stop:** loss/misdirection of value, unauthorized private-data access, irreversible corruption, secret exposure, or unsafe mainnet/real-data behavior.
- **S1 — Critical:** a core lifecycle cannot complete; role/account isolation fails; records, balances, or outcomes are materially wrong; a destructive action is misleading.
- **S2 — Major:** an important path is unreliable, inaccessible, or confusing enough to cause a likely user error, but a safe workaround exists.
- **S3 — Moderate:** localized usability, wording, responsive, accessibility, or recovery defect with limited impact.
- **S4 — Minor:** polish issue that does not impede comprehension or completion.

## Evidence rules

- Evidence references must identify the run ID, scenario, environment, commit, and timestamp.
- Never commit access tokens, invitation fragments, private evidence, exported keys, raw production rows, or personal account data.
- Screenshots must use synthetic content and redact wallet/session identifiers when they are not essential.
- Provider delivery status is not proof of inbox placement; inbox/spam placement requires a disposable recipient check.
- A passing UI assertion is not proof of cross-system accuracy; critical value/state scenarios must compare UI, API/D1 representation, and onchain receipt or deterministic local-chain state.
