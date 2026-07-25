# OperationsReserve-only Base Sepolia deployment

Use this path to replace `OperationsReserve` without redeploying `OpenEscrow`.
Existing agreement IDs and escrowed balances remain at the current `OpenEscrow`
address.

## Pinned release inputs

```text
OpenEscrow: 0x1886b3322ea37134209fa40dfd592f2aaf14c329
Plain token: 0xE129b23BD89904D363ba226eE52deC74185D7789
Yield token: 0x2746034FF16371A65c133016470f85535992dabC
Chain ID: 84532
```

The new reserve constructor verifies that both token addresses exactly match the
immutable allowlist on this `OpenEscrow`. The deployment reverts if the escrow or
either token is wrong.

## Simulate before signing

From the repository root in PowerShell:

```powershell
$foundryBin = Join-Path $env:USERPROFILE ".foundry\bin"
$env:BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org"
$env:ESCROW_ADDRESS = "0x1886b3322ea37134209fa40dfd592f2aaf14c329"
$env:TOKEN_ADDRESS = "0xE129b23BD89904D363ba226eE52deC74185D7789"
$env:YIELD_TOKEN_ADDRESS = "0x2746034FF16371A65c133016470f85535992dabC"
$env:DEPLOYER_ADDRESS = & "$foundryBin\cast.exe" wallet address `
  --account openescrow-base-sepolia

& "$foundryBin\cast.exe" chain-id --rpc-url $env:BASE_SEPOLIA_RPC_URL
& "$foundryBin\forge.exe" test --match-contract OperationsReserveTest
& "$foundryBin\forge.exe" script `
  script/DeployOperationsReserveBaseSepolia.s.sol:DeployOperationsReserveBaseSepolia `
  --rpc-url $env:BASE_SEPOLIA_RPC_URL `
  --sender $env:DEPLOYER_ADDRESS `
  -vvvv
```

The chain ID must be `84532`, all reserve tests must pass, and the simulation must
create exactly one contract: `OperationsReserve`.

## Exact broadcast command

```powershell
& "$foundryBin\forge.exe" script `
  script/DeployOperationsReserveBaseSepolia.s.sol:DeployOperationsReserveBaseSepolia `
  --rpc-url $env:BASE_SEPOLIA_RPC_URL `
  --account openescrow-base-sepolia `
  --sender $env:DEPLOYER_ADDRESS `
  --broadcast `
  --slow `
  -vvvv
```

Foundry prompts locally for the encrypted keystore password. Never put a raw private
key in this repository, an environment variable, a command argument, or chat.

The public deployment result is written to:

```text
broadcast/DeployOperationsReserveBaseSepolia.s.sol/84532/run-latest.json
```

Before changing the frontend, verify from the console output or a Base Sepolia
explorer that:

- `ESCROW()` is `0x1886b3322ea37134209fa40dfd592f2aaf14c329`;
- `TOKEN()` is `0xE129b23BD89904D363ba226eE52deC74185D7789`;
- `YIELD_TOKEN()` is `0x2746034FF16371A65c133016470f85535992dabC`;
- `TREASURY()` is the intended deployer address.

Only the frontend `OPERATIONS_RESERVE_ADDRESS` and regenerated
`OperationsReserveABI.json` should change. Do not replace `OPEN_ESCROW_ADDRESS` or
`DEPLOYMENT_BLOCK`.
