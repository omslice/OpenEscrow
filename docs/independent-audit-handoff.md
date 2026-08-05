# Independent smart-contract audit handoff

Last prepared: 2026-08-05

This packet is the entry point for an independent reviewer. The audit target must be
an exact commit and its generated pilot-candidate evidence, not a moving branch.

## Review target

- `contracts/OpenEscrow.sol` — refundable deposit lifecycle and accounting
- `contracts/OperationsReserve.sol` — separately disclosed testnet operations reserve
- `contracts/AgreementActivityRegistry.sol` — party-authorized public hash registry
- `script/DeployBaseSepolia.s.sol` and deployment/export/rehearsal scripts
- `test/`, including stateful invariant handlers and immutable-cohort isolation
- `foundry.toml` and `contracts/dependency-lock.json`
- `docs/contract-threat-model.md`, `docs/mvp-spec.md`, and
  `docs/base-sepolia-deployment.md`

Experimental yield prototypes and adapters are not implicitly approved with the core
escrow. If any becomes a deployment candidate, scope and audit it explicitly with
the exact configured asset contracts.

## Reproduce the release evidence

From the repository root, with Foundry and Node dependencies already installed:

```powershell
Set-Location frontend
npm run contract:assure
npm run release:check
```

`contract:assure` performs a forced clean offline compile using Solidity 0.8.26,
optimizer 200, and the IR pipeline. It then runs the full fuzz/invariant suite and
checks each production contract's frontend ABI, runtime size margin, runtime and
creation bytecode hashes, function selectors/collisions, and storage-layout hash. It
also checks the actual Foundry/OpenZeppelin source trees against their reviewed
gitlink and SHA-256 manifests. Evidence is written to the ignored local file
`frontend/.contract-assurance/latest.json` and later bound into pilot-candidate
schema v5 alongside the separate deployment-rehearsal evidence. Schema v5 also
hashes the npm manifest and v3 lockfile and includes a commit-bound production
software inventory: the Node runtime, every direct runtime resolution, and every
non-development package path with its exact version, integrity value, and license.

Any dependency-lock change, ABI change, bytecode change, selector change, storage
layout change, compiler-profile change, test failure, or runtime margin below 2,048
bytes must stop release review until explained and re-approved.

For the complete undeployed application envelope, run `npm run
deploy:pilot-candidate` after committing the reviewed source. The resulting ignored
local JSON binds the contract assurance, two-cohort deployment/rollback rehearsal,
pilot and incident JUnit evidence, software inventory, preserved Sites bindings,
release provenance, and every packaged Sites byte to that exact commit.

## Highest-priority audit questions

1. Can any role or token callback violate per-agreement or aggregate principal
   conservation, double-finalize an allocation, or withdraw another party's share?
2. Can deadline transitions, claim amendment, multi-tenant minimum acceptance,
   arbiter replacement/resignation, or timeout ordering strand or misallocate funds?
3. Is every effects-before-interactions boundary safe against cross-function and
   cross-agreement reentrancy, including malicious allowlisted tokens?
4. Can the reserve record a payment it did not receive, accept the wrong cohort,
   token, phase, agreement, or payer, exceed its fixed total, or expose escrow
   principal to its treasury?
5. Can a former, pending, declined, or resigned arbiter publish registry activity or
   anchor records? Can agreement-ID overlap across cohorts grant authority?
6. Do constructor checks and the deployment sequence guarantee reciprocal
   escrow/reserve binding and exact registry binding? Does the manifest prove the
   same addresses and runtime code later configured in the app?
7. Are unsupported token behaviors, timestamp assumptions, gas/loop bounds, and
   denial-of-service cases documented and acceptably bounded?

## Expected reviewer deliverables

- findings with severity, exploit preconditions, affected assets, and reproducible tests;
- a statement of the exact commit, compiler/profile, dependencies, chain, and
  configured token assumptions reviewed;
- confirmation or correction of every invariant in the threat model;
- separate treatment of design/centralization/legal risks that are not Solidity bugs;
- verification of fixes against a new immutable commit and regenerated assurance
  artifact; and
- an explicit list of residual risks and excluded components.

## Known handoff notes

- This is an AI-assisted internal engineering review, not a professional audit.
- Contracts are immutable and have no pause/admin rescue path. A fix creates a new
  cohort; it does not migrate active balances.
- One opt-in live Base Sepolia Aave fork test is expected to skip without an RPC URL.
- The dependency directories may be present without initialized nested Git metadata;
  the release gate therefore checks both the repository gitlink and the canonical
  source-tree manifest.
- No broadcast, signer, RPC credential, hosted secret, real asset, or production-yield
  action is part of credential-free candidate assurance.
- The unified deployment script creates the reserve, escrow, reciprocal binding, and registry in
  one cohort. Its credential-free Anvil rehearsal and candidate-manifest exporter are in scope;
  no public broadcast is implied by passing them.
