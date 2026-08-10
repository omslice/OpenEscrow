# Staged OperationsReserve deployment

`OperationsReserve` can be deployed first and paired once with a subsequent
`OpenEscrow` deployment. This staged path is useful for inspecting the reserve
address before deploying the escrow.

It cannot add atomic deposit-plus-reserve funding to an already deployed escrow.
Use the matching-pair runbook in `base-sepolia-deployment.md` for the normal release
path.

## Deploy the unconfigured reserve

From the repository root in PowerShell:

```powershell
$foundryBin = Join-Path $env:USERPROFILE ".foundry\bin"
$env:BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org"
$env:TOKEN_ADDRESS = "0xE129b23BD89904D363ba226eE52deC74185D7789"
$env:YIELD_TOKEN_ADDRESS = "0x2746034FF16371A65c133016470f85535992dabC"
$env:DEPLOYER_ADDRESS = & "$foundryBin\cast.exe" wallet address `
  --account openescrow-base-sepolia

& "$foundryBin\forge.exe" script `
  script/DeployOperationsReserveBaseSepolia.s.sol:DeployOperationsReserveBaseSepolia `
  --rpc-url $env:BASE_SEPOLIA_RPC_URL `
  --account openescrow-base-sepolia `
  --sender $env:DEPLOYER_ADDRESS `
  --broadcast `
  --slow `
  -vvvv
```

The new reserve starts with `ESCROW()` equal to the zero address. Set its address as
`OPERATIONS_RESERVE_ADDRESS`, then run `DeployOpenEscrow.s.sol` with the same
encrypted-keystore account. That script deploys the matching escrow and permanently
links the reserve in the same broadcast.

Never reuse an already configured reserve, and never put a raw private key in this
repository, an environment variable, a command argument, or chat.
