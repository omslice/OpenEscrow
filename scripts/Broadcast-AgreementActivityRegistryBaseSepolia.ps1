$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$foundryBin = Join-Path $env:USERPROFILE ".foundry\bin"

$env:BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org"
$env:ESCROW_ADDRESS = "0xF18BfDbFd3FF84c603CbDf895D2a96aC7260AE99"
$env:DEPLOYER_ADDRESS = "0x0B3AA7539bB7EDCd44131F1A71eDCff1c1FDf20E"

Set-Location -LiteralPath $repoRoot

Write-Host ""
Write-Host "OpenEscrow activity-registry deployment" -ForegroundColor Cyan
Write-Host "Target escrow: $env:ESCROW_ADDRESS"
Write-Host "Enter the password for the encrypted openescrow-base-sepolia keystore when prompted."
Write-Host ""

& "$foundryBin\forge.exe" script `
  script/DeployAgreementActivityRegistry.s.sol:DeployAgreementActivityRegistry `
  --rpc-url $env:BASE_SEPOLIA_RPC_URL `
  --account openescrow-base-sepolia `
  --sender $env:DEPLOYER_ADDRESS `
  --broadcast `
  --slow `
  -vvvv

if ($LASTEXITCODE -ne 0) {
  throw "AgreementActivityRegistry deployment failed with exit code $LASTEXITCODE."
}

& (Join-Path $PSScriptRoot "Export-AgreementActivityRegistryDeployment.ps1")
if ($LASTEXITCODE -ne 0) {
  throw "The deployment succeeded, but its manifest could not be exported."
}

Write-Host ""
Write-Host "Activity-registry deployment and manifest export completed." -ForegroundColor Green
