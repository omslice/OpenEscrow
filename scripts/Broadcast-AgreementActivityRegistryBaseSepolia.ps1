[CmdletBinding()]
param(
    [string]$EscrowManifestPath = "deployments/base-sepolia-latest.json",
    [switch]$ValidateOnly
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$foundryBin = Join-Path $env:USERPROFILE ".foundry\bin"
$manifestCandidate = if ([System.IO.Path]::IsPathRooted($EscrowManifestPath)) {
  $EscrowManifestPath
} else {
  Join-Path $repoRoot $EscrowManifestPath
}
$manifestFile = [System.IO.Path]::GetFullPath($manifestCandidate)

if (-not (Test-Path -LiteralPath $manifestFile -PathType Leaf)) {
  throw "Escrow deployment manifest not found: $manifestFile"
}

$escrowManifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
if ([int64]$escrowManifest.chainId -ne 84532) {
  throw "Refusing to use escrow manifest for chain $($escrowManifest.chainId); expected Base Sepolia (84532)."
}
$escrowAddress = [string]$escrowManifest.openEscrow.address
if ($escrowAddress -notmatch '^0x[0-9a-fA-F]{40}$') {
  throw "The escrow deployment manifest does not contain a valid OpenEscrow address."
}
$reserveAddress = [string]$escrowManifest.operationsReserve.address
$plainTokenAddress = [string]$escrowManifest.tokens.plain
$yieldTokenAddress = [string]$escrowManifest.tokens.yield
foreach ($address in @($reserveAddress, $plainTokenAddress, $yieldTokenAddress)) {
  if ($address -notmatch '^0x[0-9a-fA-F]{40}$') {
    throw "The escrow deployment manifest contains an invalid reserve or token address."
  }
}

$env:BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org"
$env:ESCROW_ADDRESS = $escrowAddress

function Invoke-CastAddressCall {
  param(
    [string]$Target,
    [string]$Signature
  )
  $value = & "$foundryBin\cast.exe" call $Target $Signature --rpc-url $env:BASE_SEPOLIA_RPC_URL
  if ($LASTEXITCODE -ne 0 -or [string]$value -notmatch '^0x[0-9a-fA-F]{40}$') {
    throw "Could not verify $Signature on $Target."
  }
  return ([string]$value).Trim()
}

$escrowCode = & "$foundryBin\cast.exe" code $escrowAddress --rpc-url $env:BASE_SEPOLIA_RPC_URL
if ($LASTEXITCODE -ne 0 -or [string]$escrowCode -eq '0x') {
  throw "The manifest OpenEscrow address has no readable Base Sepolia code."
}
$reserveCode = & "$foundryBin\cast.exe" code $reserveAddress --rpc-url $env:BASE_SEPOLIA_RPC_URL
if ($LASTEXITCODE -ne 0 -or [string]$reserveCode -eq '0x') {
  throw "The manifest OperationsReserve address has no readable Base Sepolia code."
}

$boundReserve = Invoke-CastAddressCall $escrowAddress 'OPERATIONS_RESERVE()(address)'
$boundEscrow = Invoke-CastAddressCall $reserveAddress 'ESCROW()(address)'
$escrowToken = Invoke-CastAddressCall $escrowAddress 'TOKEN()(address)'
$reserveToken = Invoke-CastAddressCall $reserveAddress 'TOKEN()(address)'
$escrowYieldToken = Invoke-CastAddressCall $escrowAddress 'YIELD_TOKEN()(address)'
$reserveYieldToken = Invoke-CastAddressCall $reserveAddress 'YIELD_TOKEN()(address)'
if ($boundReserve -ine $reserveAddress -or $boundEscrow -ine $escrowAddress) {
  throw "The manifest escrow and reserve are not reciprocally bound on Base Sepolia."
}
if (
  $escrowToken -ine $plainTokenAddress -or
  $reserveToken -ine $plainTokenAddress -or
  $escrowYieldToken -ine $yieldTokenAddress -or
  $reserveYieldToken -ine $yieldTokenAddress
) {
  throw "The manifest escrow/reserve token bindings do not match the Base Sepolia contracts."
}

if ($ValidateOnly) {
  Write-Host "Validated the manifest's deployed escrow/reserve code and reciprocal bindings." -ForegroundColor Green
  return
}

$env:DEPLOYER_ADDRESS = & "$foundryBin\cast.exe" wallet address --account openescrow-base-sepolia
if ($LASTEXITCODE -ne 0 -or $env:DEPLOYER_ADDRESS -notmatch '^0x[0-9a-fA-F]{40}$') {
  throw "Could not derive the public deployer address from the encrypted openescrow-base-sepolia keystore."
}

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

& (Join-Path $PSScriptRoot "Export-AgreementActivityRegistryDeployment.ps1") `
  -EscrowManifestPath $EscrowManifestPath
if ($LASTEXITCODE -ne 0) {
  throw "The deployment succeeded, but its manifest could not be exported."
}

Write-Host ""
Write-Host "Activity-registry deployment and manifest export completed." -ForegroundColor Green
