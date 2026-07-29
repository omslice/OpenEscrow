# OpenEscrow roadmap

This roadmap is organized by dependency and release evidence. Checked items are implemented in
the repository; they are not claims of legal approval or production readiness.

## 1. Testnet protocol and optional-yield foundation

**Status: implemented and internally validated; external evaluation still required**

- [x] Pinned-token non-custodial escrow, claims, disputes, deadlines, and pull withdrawals
- [x] Multi-tenant funding shares and operations-reserve receipts
- [x] Authorization, boundary, fuzz, and stateful invariant coverage
- [x] Base Sepolia deployment and public testnet demonstration
- [x] Isolated yield-enabled V2 escrow and official Base Sepolia Aave adapter prototype
- [x] Principal/yield/loss allocation and direct USDC redemption tests
- [ ] Five moderated usability sessions across no-claim, accepted-claim, and disputed-claim paths
- [ ] Independent smart-contract audit of the exact release candidate

## 2. Agreement discovery, records, and private evidence

**Status: implemented for testnet; hosted operations remain**

- [x] Account-based proposal and finalized-agreement discovery
- [x] Role-safe multi-tenant records and lifecycle receipt verification
- [x] Collapsed agreement list with local archive/restore controls
- [x] Timestamped report plus encrypted canonical JSON archive and verification key
- [x] Version-bound onchain record receipts and private proof verification
- [x] Private R2 evidence with file-signature validation and optional encryption/decentralized mode
- [x] Landlord-controlled tenant invitation reset with old-link and active-session invalidation
- [x] Short-lived, capped account-discovery sessions per user, role, and agreement
- [ ] Configure and test the hosted evidence master key, backup, versioned rotation, retention,
  and deletion (rotation/keyring support is implemented; hosted operations remain)
- [ ] Design landlord/arbiter recovery and exercise privacy requests and incident response

## 3. Validated-address nationwide compliance

**Status: statewide engineering complete for 50 states plus D.C.; local/legal review remains**

- [x] Server-attested U.S. address validation and deterministic state routing
- [x] Versioned immutable compliance snapshots attached to accepted agreements
- [x] Statewide profiles for all 50 states plus D.C.
- [x] Versioned claim packets, source monitoring, freshness checks, and fail-closed release gates
- [x] Deadline events that require party confirmation when based on off-chain facts
- [x] Regression coverage for registry completeness, holiday-aware business days, conditional
  deadline branches, and address-applied local-overlay source gates
- [ ] Select initial cities/counties and implement approved local overlays
- [ ] Complete official-source baselines and resolve every change/unreachable-source alert
- [ ] Obtain qualified counsel review for each launched jurisdiction and tenancy segment

## 4. Funding and asset routing

**Status: provider-neutral sandbox architecture implemented; production disabled**

- [x] USDC remains the default principal and settlement asset
- [x] Privy-brokered Base USDC onramp intent with provider-managed regional selection
- [x] Exact wallet, asset, chain, amount, sandbox, and production release gates
- [x] Fail-closed checkout result handling for submitted, confirmed, cancelled, failed, and
  malformed provider outcomes
- [x] Direct Aave supply/withdrawal route modeled without a DEX swap
- [x] FRNT and USDY routes fail closed pending official availability and eligibility
- [x] Enable and validate provider sandbox checkout in the Privy dashboard
- [ ] Decide whether the pilot needs separate ACH/bank-deposit support
- [ ] Complete provider approval, KYC/AML, fees, refunds, webhooks, reconciliation, and support
- [ ] Audit and deploy mainnet contracts before any real-money route can be enabled

## 5. Security, privacy, reliability, and release readiness

**Status: local testnet gate implemented; external and hosted gates remain**

- [x] CI contract tests and `frontend` release check
- [x] High/critical production-dependency advisory gate with moderate-advisory reporting
- [x] Fail-closed Sites project/binding, asset, eligibility, and fiat-production configuration checks
- [x] Hosted readiness endpoint for email, scheduler, evidence, receipts, registry, address, and sources
- [x] Credential-free pilot rehearsals for no-claim, accepted-claim, disputed-claim, withdrawals,
  account archive/restore, and record-proof paths
- [x] Auth/evidence threat model plus expired/forged identity, cross-account evidence, ciphertext,
  key-material, and digest-tamper regression coverage
- [x] Internal keyboard/mobile accessibility smoke coverage plus workspace tab, address combobox,
  proposal focus-recovery, async announcement, reduced-motion, and mobile-overflow fixes
- [ ] Configure hosted email, Cron, encryption, registry, address, and compliance-source services
- [ ] Run separate-account testnet pilot and accessibility/usability reviews
- [ ] Commission independent contract/application security and privacy/threat-model reviews
- [ ] Approve operating policies, support, incident response, stop conditions, and release envelope

## Production boundary

OpenEscrow remains a Base Sepolia demonstration until legal, provider, security, privacy,
operational, and supervised-pilot evidence is complete. No roadmap checkbox, automated test, or
AI-assisted review is authorization to hold real rental deposits.
