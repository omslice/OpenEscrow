# OpenEscrow — Technical Overview

## 1. Contract Architecture

### ▸ `OpenEscrowCore.sol`
- Escrow creation (`createAgreement`)
- Controlled release (`releaseFunds`)
- Tenant-triggered refund (`refund`)
- Modular via `rulesModule` and `yieldModule`
- Events: `AgreementCreated`, `FundsDeposited`, `FundsReleased`, `FundsRefunded`

### ▸ `EscrowFactory.sol`
- Deploys new user vaults
- Functions: `createVault`, `getVault`
- Events: `VaultCreated` (planned)

### ▸ `EscrowViewer.sol`
- Off-chain read access: `getAgreement`, `getAllAgreements`

### ▸ `IRulesModule.sol` / `MockRulesModule.sol`
- Interface for rules/validation modules
- Function: `validateRelease`

### ▸ `IYieldModule.sol` / `MockYieldModule.sol`
- Interface for yield modules
- Functions: `claimYield`, `viewYield`

---

## 2. Data Model

### `EscrowAgreement` struct:
| Field          | Description                         |
|----------------|-------------------------------------|
| `tenant`       | Sender of the funds                 |
| `landlord`     | Receiver of the funds               |
| `amount`       | ETH sent in escrow                  |
| `releaseTime`  | Timestamp after which release allowed|
| `released`     | Has the release occurred            |
| `refunded`     | Was it refunded instead             |
| `rulesModule`  | External logic for validation       |
| `yieldModule`  | External yield contract (optional)  |

---

## 3. All Objects, Functions & Interactions

### Contracts & Functions
- **OpenEscrowCore**
  - `createAgreement(address landlord, uint256 releaseTime, address rulesModule, address yieldModule)`
  - `releaseFunds(uint256 agreementId)`
  - `refund(uint256 agreementId)`
- **EscrowFactory**
  - `createVault(address user)`
  - `getVault(address user)`
- **EscrowViewer**
  - `getAgreement(uint256 id)`
  - `getAllAgreements(address user)`
- **IRulesModule**
  - `validateRelease(uint256 agreementId)`
- **IYieldModule**
  - `claimYield(uint256 agreementId)`
  - `viewYield(uint256 agreementId)`

### Structs
- **EscrowAgreement**: tenant, landlord, amount, releaseTime, released, refunded, rulesModule, yieldModule

### Main User Flows & Interactions
- Tenant → createAgreement (OpenEscrowCore): creates new escrow, sends ETH
- Anyone → releaseFunds (OpenEscrowCore): releases funds to landlord (calls rulesModule/yieldModule if set)
- Tenant → refund (OpenEscrowCore): reclaims deposit if eligible (calls yieldModule if set)
- Factory → createVault: creates a dedicated vault/escrow for a user
- Viewer → getAgreement / getAllAgreements: dashboard/off-chain reading
- Modules (rules/yield): Called from OpenEscrowCore during release/refund

### Planned/Advanced
- `createAgreementWithSig` (EIP-712 signature-based, walletless UX)
- `partialRefund` logic
- Batch operations, UI integration

---

## 4. Testing Strategy

- Unit tests for modules: MockRulesModule.t.sol, MockYieldModule.t.sol
- Core logic tests: OpenEscrowCore.t.sol (happy/edge path)
- Integration: ReleaseWithYield.t.sol (realistic flows)
- Fuzzing planned, see TODO

---

## 5. TODO / Next Steps

- Integrate `claimYield()` in `refund()`
- Add fallback/auto-release module
- Add edge/fuzz/malicious test cases
- Gas profiling, full NatSpec

---

**This document lists every contract, object, function, struct, and user flow for funders, partners, and developers.**

