# OpenEscrow — Technical Overview

## 1. Contract Architecture

### ▸ `EscrowFactory.sol`
Deploys a dedicated smart contract (vault) for each escrow agreement.  
Each contract is fully self-contained and owns its own funds and logic.

### ▸ `OpenEscrowCore.sol`
Core logic for each individual agreement:
- Initialization (`initialize`)
- Controlled fund release (`releaseFunds`)
- Tenant-triggered refund (`refund`)
- Optional plug-in modules: `rulesModule` and `yieldModule`

### ▸ `EscrowViewer.sol`
Read-only helper contract for UI and analytics.  
Fetches all agreement data off-chain.

### ▸ `IRulesModule.sol`
Interface for external validation logic.  
Example: enforce that an IPFS invoice is present before release.

### ▸ `IYieldModule.sol`
Interface for external yield logic.  
Allows funds to generate and split yield while escrowed.

### ▸ `MockRulesModule.sol` / `MockYieldModule.sol`
Testing mocks for validation and yield simulation.

---

## 2. Data Model

### Struct: `EscrowAgreement`
| Field           | Description |
|-----------------|-------------|
| `tenant`        | Sender of the funds |
| `landlord`      | Receiver of the funds |
| `amount`        | ETH or token deposited |
| `releaseTime`   | Unlock timestamp (e.g. lease expiry + 60 days) |
| `released`      | Whether the funds have been released |
| `refunded`      | Whether a refund was triggered instead |
| `rulesModule`   | External validation logic (optional) |
| `yieldModule`   | Yield module address (optional) |
| `invoiceHash`   | IPFS hash of landlord’s deduction claim (optional) |
| `claimedAmount` | Amount the landlord is claiming (optional) |
| `disputed`      | Whether the tenant formally disputed the claim |
| `disputedAt`    | When the dispute was registered (for traceability)

---

## 3. Execution Flow

### `createAgreement(...)` (via `EscrowFactory`)
- Deploys a new smart contract (vault)
- Initializes agreement with tenant/landlord details, modules, etc.
- Emits `AgreementCreated`

### `releaseFunds(...)`
- Callable by anyone after `releaseTime`
- Checks:
  - Not refunded or already released
  - If `rulesModule` is present → must validate (e.g. invoice present)
- Handles claim logic:
  - If no claim → full refund to tenant
  - If claim → split funds (`claimedAmount → landlord`, rest → tenant)
- If yield module active → `claimYield()` and distribute according to configured shares

### `refund(...)`
- Callable only by tenant
- Only if `releaseTime` has passed and funds not yet released
- Refunds full amount to tenant
- TODO: auto-claim tenant’s yield as well

---

## 4. Testing Strategy

- ✅ Unit tests for mock modules
  - `MockRulesModule.t.sol`
  - `MockYieldModule.t.sol`
- ✅ Full logic coverage
  - `OpenEscrowCore.t.sol` for all paths
- ✅ Integration / Scenario testing
  - `ReleaseWithYield.t.sol` (end-to-end)
  - `EscrowFactory.t.sol`, `EscrowViewer.t.sol`

---

## 5. Design Principles

- Vault-per-agreement: one smart contract per escrow instance (via factory)
- Pluggable logic: rules and yield modules can be swapped
- Onchain traceability: all claims and disputes are recorded
- Disputes don’t block release — they provide audit trail
- UI & offchain orchestration: all interactions are front-end initiated

---

## 6. TODO / Next Steps

- [x] Move to vault-based deployment (`EscrowFactory`)
- [x] Refactor for `initialize()` proxy pattern
- [x] Modularize `rulesModule` and `yieldModule`
- [x] Add IPFS invoice & claim flow
- [x] Track disputes without blocking execution
- [ ] Add `submitClaim`, `editClaim`, `cancelClaim`
- [ ] Implement `claimYield()` in `refund()`
- [ ] Add automation support (e.g. Gelato fallback)
- [ ] Batch reading & pagination in `EscrowViewer`
- [ ] Extend support for ERC20 (WYST, USDC)
- [ ] Add full gas profiling & NatSpec

---

> See [protocol-flow.md](./protocol-flow.md) for the full user-facing lifecycle.  
> See [README.md](./README.md) for project vision, team, funding, and roadmap.
