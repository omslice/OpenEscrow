# OpenEscrow – MVP Roadmap

This roadmap tracks the key milestones for MVP delivery across 2025–2026.

---

## Phase 1: Core Smart Contracts (Q3 2025)
- Finalize modular contract architecture (`OpenEscrowCore`, factory, viewer)
- Add support for:
  - IPFS invoice validation
  - Onchain dispute flagging
  - Optional `rulesModule` and `yieldModule`
- Deploy to Optimism testnet
- Write unit and integration tests (Foundry)
- Document technical overview and lifecycle logic (Mermaid)

---

## Phase 2: Web & Backend Integration (Q3–Q4 2025)
- Build minimal web frontend (React or SvelteKit)
- Connect to deployed smart contracts
- Implement deposit, refund, release, and yield actions
- Add onchain/offchain notifications (event logs + UI)
- Display agreement status via `EscrowViewer`

---

## Phase 3: Feature Expansion (Q4 2025 – Q1 2026)
- Yield strategy integration (e.g., USDC + yield-bearing token support)
- Add support for multiple ERC20 tokens (e.g. WYST, USDY)
- Enable partial refund logic (state tracked, validated per agreement)
- Optional modules:
  - Reputation system
  - Wallet abstraction
  - Fiat ramps (e.g., MoonPay)
- UX: Multilingual interface and mobile optimization

---

## Phase 4: Public Launch & Ecosystem Outreach (Q1 2026)
- Finalize audit & documentation (NatSpec, `CONTRIBUTING.md`)
- Deploy mainnet version (Optimism or Base)
- Open-source the full repo
- Outreach to housing partners, NGOs, and legal clinics
- Prepare for legal admissibility pilot (court-compatible proofs)

