$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$foundryBin = Join-Path $env:USERPROFILE ".foundry\bin"

$env:BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org"
$env:TOKEN_ADDRESS = "0xE129b23BD89904D363ba226eE52deC74185D7789"
$env:YIELD_TOKEN_ADDRESS = "0x2746034FF16371A65c133016470f85535992dabC"
$env:DEPLOYER_ADDRESS = "0x0B3AA7539bB7EDCd44131F1A71eDCff1c1FDf20E"

Set-Location -LiteralPath $repoRoot

Write-Host ""
Write-Host "OpenEscrow Base Sepolia deployment" -ForegroundColor Cyan
Write-Host "Enter the password for the encrypted openescrow-base-sepolia keystore when prompted."
Write-Host ""

& "$foundryBin\forge.exe" script `
  script/DeployBaseSepolia.s.sol:DeployBaseSepolia `
  --rpc-url $env:BASE_SEPOLIA_RPC_URL `
  --account openescrow-base-sepolia `
  --sender $env:DEPLOYER_ADDRESS `
  --broadcast `
  --slow `
  -vvvv

if ($LASTEXITCODE -ne 0) {
  throw "Base Sepolia deployment failed with exit code $LASTEXITCODE."
}

Write-Host ""
Write-Host "Deployment broadcast completed successfully. You can close this window." -ForegroundColor Green
