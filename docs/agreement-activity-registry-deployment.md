# Agreement activity registry deployment (legacy fallback)

The current hardened-cohort runbook deploys the registry atomically with the new
escrow/reserve pair. Use this separate procedure only to recover a reviewed cohort whose
escrow and reserve were already deployed successfully without a registry; do not use it
for the normal next-cohort path.

## Why a registry must be versioned with the escrow

`AgreementActivityRegistry` stores an immutable `ESCROW` reference and authorizes
record anchors by reading the landlord, every nonzero-share tenant, and current
arbiter of that exact contract. Agreement IDs begin
again at zero after an escrow redeployment, so a registry from an earlier release
must never be reused for a newer escrow.

The retired `0xC004...1951` registry is bound to an earlier escrow and must not be reused. On
2026-08-09, the reviewed recovery procedure deployed registry
`0x5ba6533811ee528f6802bb969ab01ff95d7f092e` at Base Sepolia block `45,247,418` in transaction
`0xdc4b2b57623b8d5ad688dd97295e6f138ebbd9af41806672eb204d6daeca35db`. Its immutable `ESCROW()`
binding is the active `0xF18B...AE99` escrow. The exported manifest remains the source of truth for
client and server configuration.

The frontend now reads `ESCROW()` before loading, publishing, anchoring, verifying,
or notifying on registry events. A mismatch fails closed with a service-unavailable
message, preventing cross-release agreement-ID collisions from being displayed as
current activity.

## Validate before signing

Run the contract suite and a no-broadcast simulation:

```powershell
$env:BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org"
$pair = Get-Content .\deployments\base-sepolia-latest.json -Raw | ConvertFrom-Json
$env:ESCROW_ADDRESS = [string]$pair.openEscrow.address
$deployer = & "$env:USERPROFILE\.foundry\bin\cast.exe" wallet address `
  --account openescrow-base-sepolia

& "$env:USERPROFILE\.foundry\bin\forge.exe" test
& "$env:USERPROFILE\.foundry\bin\forge.exe" script `
  script/DeployAgreementActivityRegistry.s.sol:DeployAgreementActivityRegistry `
  --rpc-url $env:BASE_SEPOLIA_RPC_URL `
  --sender $deployer `
  -vvvv
```

The script rejects any chain other than Base Sepolia, an address without contract
code, and a deployed registry whose immutable escrow does not match.

## Broadcast with the encrypted keystore

From a private local PowerShell terminal:

```powershell
.\scripts\Broadcast-AgreementActivityRegistryBaseSepolia.ps1
```

The script loads the escrow address from the validated pair manifest, proves the candidate source
is clean and unchanged, runs exact-commit contract assurance, verifies pinned dependencies,
rehearses deployment, derives the public deployer address from the encrypted
`openescrow-base-sepolia` keystore, and prompts locally for its password. Before asking for a
signature it also reads both deployed contracts and fails unless their reciprocal reserve/escrow
and token bindings match the manifest. Run the same read-only
preflight without a broadcast or keystore prompt with:

```powershell
.\scripts\Broadcast-AgreementActivityRegistryBaseSepolia.ps1 -ValidateOnly
```

That fast check validates the currently deployed pair. Before the signing session, run the full
exact-commit assurance and no-broadcast deployment simulation without touching the keystore:

```powershell
.\scripts\Broadcast-AgreementActivityRegistryBaseSepolia.ps1 -PreflightOnly
```

Do not place the password or a private key in chat, an environment variable, a project file, or a
command-line argument. Use `-EscrowManifestPath` only when an explicitly reviewed manifest has a
different location.

After a successful receipt, the script rejects stale broadcast artifacts, rechecks the exact source
commit, waits for bounded Base Sepolia RPC propagation, reads the deployed bytecode and immutable
`ESCROW()` binding, and only then writes a validated public manifest to
`deployments/base-sepolia-activity-registry.json`.

## Release checklist

Before publishing the frontend:

1. Confirm the manifest address contains code on Base Sepolia.
2. Confirm `ESCROW()` equals the active OpenEscrow address.
3. Update `AGREEMENT_ACTIVITY_REGISTRY_ADDRESS` and
   `ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK` in
   `frontend/src/contracts/activityRegistryConfig.ts`.
4. Update `DEFAULT_ACTIVITY_REGISTRY_ADDRESS` in `frontend/server/index.js`.
5. Update the hosted `ACTIVITY_REGISTRY_ADDRESS` runtime value if one is set.
6. Regenerate `AgreementActivityRegistryABI.json`.
7. Run contract tests, server tests, lint, the production build, and a fork or
   live test that publishes then verifies one version-2 private activity proof.
8. For a multi-tenant pilot, prove a secondary tenant can independently anchor a
   snapshot and publish a privacy-safe activity hash.

Do not reuse the retired registry address as a fallback.
