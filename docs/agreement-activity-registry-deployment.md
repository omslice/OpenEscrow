# Agreement activity registry deployment

## Why a registry must be versioned with the escrow

`AgreementActivityRegistry` stores an immutable `ESCROW` reference and authorizes
record anchors by reading the landlord, every nonzero-share tenant, and current
arbiter of that exact contract. Agreement IDs begin
again at zero after an escrow redeployment, so a registry from an earlier release
must never be reused for a newer escrow.

The retired registry at `0xC004dF4C43146FE55e5761EA1BB3C14f01161951`
is bound to retired escrow `0x83faBc39c4FcccB6a4e42c568E9750D1a24FF11f`.
It is not valid for the active escrow at
`0xF18BfDbFd3FF84c603CbDf895D2a96aC7260AE99`.

The frontend now reads `ESCROW()` before loading, publishing, anchoring, verifying,
or notifying on registry events. A mismatch fails closed with a service-unavailable
message, preventing cross-release agreement-ID collisions from being displayed as
current activity.

## Validate before signing

Run the contract suite and a no-broadcast simulation:

```powershell
$env:BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org"
$env:ESCROW_ADDRESS = "0xF18BfDbFd3FF84c603CbDf895D2a96aC7260AE99"
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

The script prompts locally for the encrypted `openescrow-base-sepolia` keystore
password. Do not place that password or a private key in chat, an environment
variable, a project file, or a command-line argument.

After a successful receipt, the script writes a validated public manifest to
`deployments/base-sepolia-activity-registry.json`.

## Release checklist

Before publishing the frontend:

1. Confirm the manifest address contains code on Base Sepolia.
2. Confirm `ESCROW()` equals the active OpenEscrow address.
3. Update `AGREEMENT_ACTIVITY_REGISTRY_ADDRESS` and
   `ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK` in `frontend/src/contracts/config.ts`.
4. Update `DEFAULT_ACTIVITY_REGISTRY_ADDRESS` in `frontend/server/index.js`.
5. Update the hosted `ACTIVITY_REGISTRY_ADDRESS` runtime value if one is set.
6. Regenerate `AgreementActivityRegistryABI.json`.
7. Run contract tests, server tests, lint, the production build, and a fork or
   live test that publishes then verifies one version-2 private activity proof.
8. For a multi-tenant pilot, prove a secondary tenant can independently anchor a
   snapshot and publish a privacy-safe activity hash.

Do not reuse the retired registry address as a fallback.
