# OpenEscrow — Technical Overview

## 1. Contract Architecture

### ▸ `OpenEscrowCore.sol`
Core escrow logic:
- Escrow creation (`createAgreement`)
- Controlled release (`releaseFunds`)
- Tenant-triggered refund (`refund`)
- Modular via `rulesModule` and `yieldModule`
- Handles deduction claims, tenant disputes, and release logic

### ▸ `IRulesModule.sol`
Interface for external rule validators.  
Example: validate release conditions (e.g. delivery confirmed, invoice present).

### ▸ `IYieldModule.sol`
Interface for external yield logic.  
Allows funds to generate yield while escrowed.

### ▸ `MockRulesModule.sol`
Used in tests. Can be toggled to allow/block releases.

### ▸ `MockYieldModule.sol`
Simulates passive yield. Can return fixed or dynamic values.

---

## 2. Data Model

### `EscrowAgreement` struct:
| Field          | Description |
|----------------|-------------|
| `tenant`       | Sender of the funds |
| `landlord`     | Receiver of the funds |
| `amount`       | ETH or token amount deposited |
| `releaseTime`  | Timestamp after which release is allowed |
| `released`     | Whether funds have been released |
| `refunded`     | Whether it was refunded instead |
| `rulesModule`  | External logic for validation (optional) |
| `yieldModule`  | External yield contract (optional) |
| `invoiceHash`  | IPFS hash of landlord's deduction claim (optional) |
| `claimedAmount`| Proposed deduction amount (optional) |
| `disputed`     | True if tenant formally disputed the claim |
| `disputedAt`   | Timestamp of the dispute (for audit/legal trace)

---

## 3. Execution Flow

### `createAgreement(...)`
- `msg.sender` initiates the escrow with parameters
- Agreement stored in mapping with incremental ID
- Emits an `AgreementCreated` event

### `releaseFunds(...)`
- Callable by anyone after `releaseTime`
- Pre-conditions:
  - Agreement not refunded or already released
  - Optional validation by `rulesModule` (e.g. IPFS invoice presence)
- Handles claim logic:
  - If no claim: full release to tenant or landlord as configured
  - If claim exists: checks validation rules (if enabled)
  - Dispute does **not block release**, but is recorded onchain
- Splits amount and distributes yield:
  - `claimedAmount → landlord`
  - Remainder → tenant
  - Yield distributed as per module config

### `refund(...)`
- Callable only by the tenant
- Only after `releaseTime`
- Transfers full amount back to tenant
- TODO: also claim and transfer tenant’s share of yield

---

## 4. Testing Strategy

- **Unit tests**:
  - `MockRulesModule.t.sol`
  - `MockYieldModule.t.sol`

- **Core logic tests**:
  - `OpenEscrowCore.t.sol` (full path coverage)

- **Integration tests**:
  - `ReleaseWithYield.t.sol` (realistic end-to-end flows)

---

## 5. TODO / Next Steps

- [x] Integrate `claimYield()` in `refund()`
- [ ] Add deduction flow:
  - Store `invoiceHash` and `claimedAmount`
  - Support `submitClaim()`, `editClaim()`, and `cancelClaim()` before release
- [ ] Add tenant dispute tracking:
  - Store `disputed` flag and `disputedAt` timestamp
  - Record disputes without blocking funds
- [ ] Add fallback release after timeout (optional automation via Gelato or offchain cron)
- [ ] Expand rulesModule examples (e.g. max claim %, required invoice, deadlines)
- [ ] Add gas profiling (`forge test --gas-report`)
- [ ] Ensure full interface coverage and complete NatSpec annotations
- [ ] Extend support for token-based escrows (e.g. WYST or USDC via ERC20 interface)

---

## Notes

- Tenant and landlord interaction is offchain/UI driven, but all critical actions and disputes are recorded onchain.
- IPFS is used to store and reference deduction documents (invoices).
- Disputes are **non-blocking**: they provide legal traceability, but do not prevent fund release.
- Modules (`rulesModule`, `yieldModule`) are pluggable and optional.

> For full contract interfaces, structs, function references, and developer-facing details, see [dev-reference.md](./dev-reference.md).
