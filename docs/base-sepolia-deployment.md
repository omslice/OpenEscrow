# Base Sepolia deployment

This runbook deploys a matching `OpenEscrow` and `OperationsReserve` release with a
locally encrypted Foundry keystore. It does not put a private key in this repository,
the shell history, or an environment variable.

The deployment is a fresh testnet release. It does not migrate agreements or balances
from an older `OpenEscrow` contract.

## One-time local signer setup

Run these commands in a private local PowerShell terminal. Do not paste a private key
into chat, a project file, or a command-line argument.

```powershell
$foundryBin = Join-Path $env:USERPROFILE ".foundry\bin"
& "$foundryBin\cast.exe" wallet import openescrow-base-sepolia --interactive
& "$foundryBin\cast.exe" wallet address --account openescrow-base-sepolia
```

The first command prompts locally for the key and a keystore password. Foundry stores
the encrypted keystore outside this repository. Record the displayed public deployer
address and fund it with only enough Base Sepolia ETH for this deployment.

## Configure public deployment inputs

The upgraded contracts use the existing Base Sepolia demo tokens unless a deliberate
token replacement is being tested:

```powershell
$foundryBin = Join-Path $env:USERPROFILE ".foundry\bin"
$env:BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org"
$env:TOKEN_ADDRESS = "0xE129b23BD89904D363ba226eE52deC74185D7789"
$env:YIELD_TOKEN_ADDRESS = "0x2746034FF16371A65c133016470f85535992dabC"
$env:DEPLOYER_ADDRESS = & "$foundryBin\cast.exe" wallet address --account openescrow-base-sepolia
```

Confirm the endpoint and public account before signing:

```powershell
& "$foundryBin\cast.exe" chain-id --rpc-url $env:BASE_SEPOLIA_RPC_URL
& "$foundryBin\cast.exe" balance $env:DEPLOYER_ADDRESS --ether --rpc-url $env:BASE_SEPOLIA_RPC_URL
```

The chain ID must be `84532`. The Solidity deployment script also rejects every other
chain.

## Build, test, and simulate

Do not broadcast if any check fails:

```powershell
& "$foundryBin\forge.exe" fmt --check
& "$foundryBin\forge.exe" build
& "$foundryBin\forge.exe" test
& "$foundryBin\forge.exe" script `
  script/DeployBaseSepolia.s.sol:DeployBaseSepolia `
  --rpc-url $env:BASE_SEPOLIA_RPC_URL `
  --sender $env:DEPLOYER_ADDRESS `
  -vvvv
```

The simulation should show exactly two contract creations: one `OpenEscrow` and one
`OperationsReserve`.

## Broadcast with the encrypted keystore

```powershell
& "$foundryBin\forge.exe" script `
  script/DeployBaseSepolia.s.sol:DeployBaseSepolia `
  --rpc-url $env:BASE_SEPOLIA_RPC_URL `
  --account openescrow-base-sepolia `
  --sender $env:DEPLOYER_ADDRESS `
  --broadcast `
  --slow `
  -vvvv
```

Foundry prompts locally for the keystore password. If broadcasting is interrupted,
inspect the broadcast file before using Foundry's `--resume` option; never start an
unreviewed second deployment.

## Validate and export the public addresses

Only after both receipts succeed:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\Export-BaseSepoliaDeployment.ps1
Get-Content .\deployments\base-sepolia-latest.json
```

The exporter verifies chain ID `84532`, one successful receipt for each contract, and
matching plain-token constructor arguments before writing the manifest. It also prints
the four public address values needed by the frontend configuration.

Before releasing the site, confirm on a Base Sepolia explorer that:

- both deployment transactions succeeded;
- `OpenEscrow.TOKEN()` and `OperationsReserve.TOKEN()` equal `TOKEN_ADDRESS`;
- `OpenEscrow.YIELD_TOKEN()` equals `YIELD_TOKEN_ADDRESS`;
- `OperationsReserve.TREASURY()` equals the intended deployer address.

Then apply the exported contract addresses, regenerate the two frontend ABIs from the
new build artifacts, run the full frontend checks, and deploy the site.

## Current blocker

No `openescrow-base-sepolia` Foundry account is configured in this workspace session.
Broadcasting therefore requires the owner to perform the one-time interactive keystore
import and fund the resulting public Base Sepolia address. No raw private key is
required or accepted by this runbook.
