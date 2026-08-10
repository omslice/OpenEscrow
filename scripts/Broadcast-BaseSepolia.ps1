[CmdletBinding()]
param(
    [string]$DeployerAddress = "0x0B3AA7539bB7EDCd44131F1A71eDCff1c1FDf20E",
    [string]$RpcUrl = "",
    [switch]$PreflightOnly
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$foundryBin = Join-Path $env:USERPROFILE ".foundry\bin"

if ($DeployerAddress -notmatch '^0x[0-9a-fA-F]{40}$') {
  throw "The configured deployer address is not a valid Ethereum address."
}
$env:DEPLOYER_ADDRESS = $DeployerAddress

Set-Location -LiteralPath $repoRoot

function Resolve-BaseSepoliaRpcUrl {
  param([string]$RequestedRpcUrl)

  $configuredRpcUrl = if ($RequestedRpcUrl) {
    $RequestedRpcUrl
  }
  elseif ($env:BASE_SEPOLIA_RPC_URL) {
    $env:BASE_SEPOLIA_RPC_URL
  }
  else {
    ""
  }

  $candidates = if ($configuredRpcUrl) {
    @($configuredRpcUrl)
  }
  else {
    @(
      "https://sepolia.base.org",
      "https://base-sepolia-rpc.publicnode.com"
    )
  }

  foreach ($candidate in $candidates) {
    $chainIdOutput = & "$foundryBin\cast.exe" chain-id --rpc-url $candidate 2>$null
    $chainIdExitCode = $LASTEXITCODE
    $chainId = ($chainIdOutput | Out-String).Trim()
    if ($chainIdExitCode -eq 0 -and $chainId -eq "84532") {
      return $candidate
    }

    if ($configuredRpcUrl) {
      throw "The configured RPC endpoint did not return Base Sepolia chain ID 84532. No transaction was signed."
    }

    Write-Warning "A public Base Sepolia RPC endpoint was unavailable; trying the documented fallback."
  }

  throw "No healthy Base Sepolia RPC endpoint returned chain ID 84532. No transaction was signed."
}

$verifiedRpcUrl = Resolve-BaseSepoliaRpcUrl -RequestedRpcUrl $RpcUrl
$selectedRpcLabel = if (
  $verifiedRpcUrl -in @(
    "https://sepolia.base.org",
    "https://base-sepolia-rpc.publicnode.com"
  )
) {
  $verifiedRpcUrl
}
else {
  "the configured custom endpoint"
}
Write-Host "Verified Base Sepolia RPC: $selectedRpcLabel" -ForegroundColor Green

function Assert-CandidateSourceClean {
  $sourceChanges = @(& git status --porcelain=v1 --untracked-files=all -- `
    .openai contracts lib script scripts test foundry.toml remappings.txt .gitmodules frontend)
  if ($LASTEXITCODE -ne 0 -or $sourceChanges.Count -ne 0) {
    throw "Refusing to broadcast because candidate source differs from HEAD: $($sourceChanges -join ', ')"
  }
}

$candidateCommit = (& git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $candidateCommit -notmatch '^[0-9a-f]{40}$') {
  throw "Could not determine the exact candidate commit."
}
Assert-CandidateSourceClean

Push-Location -LiteralPath (Join-Path $repoRoot "frontend")
$previousRpcUrl = $env:BASE_SEPOLIA_RPC_URL
try {
  Remove-Item Env:BASE_SEPOLIA_RPC_URL -ErrorAction SilentlyContinue
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
  if ($null -eq $previousRpcUrl) {
    Remove-Item Env:BASE_SEPOLIA_RPC_URL -ErrorAction SilentlyContinue
  }
  else {
    $env:BASE_SEPOLIA_RPC_URL = $previousRpcUrl
  }
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

if ($PreflightOnly) {
  Write-Host ""
  Write-Host "Base Sepolia deployment preflight passed." -ForegroundColor Green
  Write-Host "No wallet was opened, no password was requested, and no transaction was signed or broadcast."
  return
}

Write-Host ""
Write-Host "OpenEscrow Base Sepolia deployment" -ForegroundColor Cyan
Write-Host "Enter the password for the encrypted openescrow-base-sepolia keystore when prompted."
Write-Host ""

& "$foundryBin\forge.exe" script `
  script/DeployBaseSepolia.s.sol:DeployBaseSepolia `
  --rpc-url $verifiedRpcUrl `
  --account openescrow-base-sepolia `
  --sender $env:DEPLOYER_ADDRESS `
  --force `
  --broadcast `
  --slow `
  -vvvv

if ($LASTEXITCODE -ne 0) {
  throw "Base Sepolia deployment failed with exit code $LASTEXITCODE."
}

Assert-CandidateSourceClean
$broadcastCommit = (& git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $broadcastCommit -ne $candidateCommit) {
  throw "The candidate source changed during broadcast. The transactions completed, but no manifest was exported."
}

& (Join-Path $PSScriptRoot "Export-BaseSepoliaDeployment.ps1") -ExpectedCommit $candidateCommit
if ($LASTEXITCODE -ne 0) {
  throw "The deployment succeeded, but its candidate manifest could not be exported."
}

Write-Host ""
Write-Host "Deployment broadcast and candidate manifest export completed." -ForegroundColor Green
Write-Host "The existing site and active cohort were not changed. Share only the public manifest and transaction hashes for verification."
