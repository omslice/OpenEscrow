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

The registry currently configured by the hosted testnet is bound to a retired escrow and fails
the readiness check. It must not be reused. The next registry target is read from the validated
`deployments/base-sepolia-latest.json` pair manifest so a stale address is not embedded in the
broadcast helper or exporter.

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
commit, reads the deployed bytecode and immutable `ESCROW()` binding from Base Sepolia, and only
then writes a validated public manifest to `deployments/base-sepolia-activity-registry.json`.

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
