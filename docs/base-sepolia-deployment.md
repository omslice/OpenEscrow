# Base Sepolia deployment

This runbook deploys a matching `OpenEscrow`, `OperationsReserve`, and
`AgreementActivityRegistry` release with a
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
Set-Location frontend
npm.cmd run contract:assure
npm.cmd run deploy:rehearse
Set-Location ..
& "$foundryBin\forge.exe" script `
  script/DeployBaseSepolia.s.sol:DeployBaseSepolia `
  --rpc-url $env:BASE_SEPOLIA_RPC_URL `
  --sender $env:DEPLOYER_ADDRESS `
  -vvvv
```

The simulation should show exactly three release-contract creations:
`OperationsReserve`, `OpenEscrow`, and `AgreementActivityRegistry`, with the reserve's
one-time `configureEscrow` call between the escrow and registry deployments. The
credential-free rehearsal separately deploys two complete cohorts on ephemeral local
Anvil, funds overlapping agreement ID `0`, proves registry isolation, closes only the
retired cohort, and restores the current configuration byte-for-byte after an in-memory
candidate switch.

## Broadcast with the encrypted keystore

The recommended entry point binds the exact clean commit to fresh contract-assurance and local
deployment-rehearsal evidence, derives the public signer from the encrypted keystore, performs the
unified forced-recompile broadcast, and exports a candidate manifest without changing the active
application. It also rechecks the pinned dependency-tree hashes immediately before signing:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\Broadcast-BaseSepolia.ps1
```

The direct Foundry command below is an operator-recovery reference, not the preferred path:

```powershell
& "$foundryBin\forge.exe" script `
  script/DeployBaseSepolia.s.sol:DeployBaseSepolia `
  --rpc-url $env:BASE_SEPOLIA_RPC_URL `
  --account openescrow-base-sepolia `
  --sender $env:DEPLOYER_ADDRESS `
  --force `
  --broadcast `
  --slow `
  -vvvv
```

Foundry prompts locally for the keystore password. If broadcasting is interrupted,
inspect the broadcast file before using Foundry's `--resume` option; never start an
unreviewed second deployment.

## Validate and export the public addresses

Only after every deployment and configuration receipt succeeds (the recommended wrapper does this
automatically):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\Export-BaseSepoliaDeployment.ps1 `
  -ExpectedCommit (git rev-parse HEAD)
Get-Content .\deployments\base-sepolia-candidate.json
```

The exporter verifies chain ID `84532`, one successful receipt for each of the three
contracts, reciprocal escrow/reserve construction and configuration, exact registry binding,
matching token constructor arguments, deployment blocks, transaction hashes, and the exact source
commit before writing a candidate manifest. It deliberately leaves
`base-sepolia-latest.json` unchanged so the active cohort remains the rollback target.

Before releasing the site, confirm on a Base Sepolia explorer that:

- both deployment transactions succeeded;
- `OpenEscrow.TOKEN()` and `OperationsReserve.TOKEN()` equal `TOKEN_ADDRESS`;
- `OpenEscrow.YIELD_TOKEN()` equals `YIELD_TOKEN_ADDRESS`;
- `OpenEscrow.OPERATIONS_RESERVE()` equals the deployed reserve;
- `OperationsReserve.ESCROW()` equals the deployed escrow;
- `OperationsReserve.TREASURY()` equals the intended deployer address;
- `AgreementActivityRegistry.ESCROW()` equals the newly deployed escrow.

Do not edit the frontend addresses yet. Share only the public transaction hashes and
candidate manifest for verification. After the exact onchain code and bindings pass,
Codex can apply one reviewed configuration switch, retain the current cohort as the
explicit rollback target, regenerate/check the frontend ABIs, and produce an undeployed
Sites candidate for separate approval.
