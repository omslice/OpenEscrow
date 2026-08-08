[CmdletBinding()]
param(
    [string]$EscrowManifestPath = "deployments/base-sepolia-latest.json",
    [switch]$ValidateOnly,
    [switch]$PreflightOnly
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

Set-Location -LiteralPath $repoRoot

function Assert-CandidateSourceClean {
  $sourceChanges = @(& git status --porcelain=v1 --untracked-files=all -- `
    .openai contracts deployments lib script test foundry.toml remappings.txt .gitmodules frontend scripts)
  if ($LASTEXITCODE -ne 0 -or $sourceChanges.Count -ne 0) {
    throw "Refusing to broadcast because candidate source differs from HEAD: $($sourceChanges -join ', ')"
  }
}

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

$candidateCommit = (& git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $candidateCommit -notmatch '^[0-9a-f]{40}$') {
  throw "Could not determine the exact candidate commit."
}
Assert-CandidateSourceClean

Push-Location -LiteralPath (Join-Path $repoRoot "frontend")
try {
  & npm.cmd run contract:assure
  if ($LASTEXITCODE -ne 0) {
    throw "Exact-commit contract assurance failed."
  }
  & npm.cmd run deploy:rehearse
  if ($LASTEXITCODE -ne 0) {
    throw "Credential-free deployment rehearsal failed."
  }
  & npm.cmd run contract:dependencies:verify
  if ($LASTEXITCODE -ne 0) {
    throw "Pinned contract dependency source changed after assurance."
  }
}
finally {
  Pop-Location
}

Assert-CandidateSourceClean
$verifiedCommit = (& git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $verifiedCommit -ne $candidateCommit) {
  throw "The candidate commit changed during preflight."
}
$contractEvidence = Get-Content -LiteralPath (Join-Path $repoRoot "frontend\.contract-assurance\latest.json") -Raw | ConvertFrom-Json
$deploymentEvidence = Get-Content -LiteralPath (Join-Path $repoRoot "frontend\.deployment-rehearsal\latest.json") -Raw | ConvertFrom-Json
if (
  $contractEvidence.status -ne "passed" -or
  $contractEvidence.sourceCommit -ne $candidateCommit -or
  $deploymentEvidence.status -ne "passed" -or
  $deploymentEvidence.sourceCommit -ne $candidateCommit
) {
  throw "Preflight evidence does not belong to the exact candidate commit."
}

& "$foundryBin\forge.exe" script `
  script/DeployAgreementActivityRegistry.s.sol:DeployAgreementActivityRegistry `
  --rpc-url $env:BASE_SEPOLIA_RPC_URL `
  --sender 0x000000000000000000000000000000000000dEaD `
  -vvvv
if ($LASTEXITCODE -ne 0) {
  throw "Credential-free activity-registry deployment simulation failed."
}

Assert-CandidateSourceClean
$simulatedCommit = (& git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $simulatedCommit -ne $candidateCommit) {
  throw "The candidate commit changed during activity-registry simulation."
}

if ($PreflightOnly) {
  Write-Host "Exact-commit registry preflight and no-broadcast simulation passed for $candidateCommit." -ForegroundColor Green
  return
}

$env:DEPLOYER_ADDRESS = & "$foundryBin\cast.exe" wallet address --account openescrow-base-sepolia
if ($LASTEXITCODE -ne 0 -or $env:DEPLOYER_ADDRESS -notmatch '^0x[0-9a-fA-F]{40}$') {
  throw "Could not derive the public deployer address from the encrypted openescrow-base-sepolia keystore."
}

Write-Host ""
Write-Host "OpenEscrow activity-registry deployment" -ForegroundColor Cyan
Write-Host "Candidate commit: $candidateCommit"
Write-Host "Target escrow: $env:ESCROW_ADDRESS"
Write-Host "Enter the password for the encrypted openescrow-base-sepolia keystore when prompted."
Write-Host ""

$broadcastStartedAtUtc = (Get-Date).ToUniversalTime()
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

Assert-CandidateSourceClean
$broadcastCommit = (& git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $broadcastCommit -ne $candidateCommit) {
  throw "The candidate source changed during broadcast. The transaction completed, but no manifest was exported."
}

& (Join-Path $PSScriptRoot "Export-AgreementActivityRegistryDeployment.ps1") `
  -EscrowManifestPath $EscrowManifestPath `
  -ExpectedCommit $candidateCommit `
  -BroadcastNotBeforeUtc $broadcastStartedAtUtc
if ($LASTEXITCODE -ne 0) {
  throw "The deployment succeeded, but its manifest could not be exported."
}

Write-Host ""
Write-Host "Activity-registry deployment and manifest export completed." -ForegroundColor Green
