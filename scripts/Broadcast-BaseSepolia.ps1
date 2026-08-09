$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$foundryBin = Join-Path $env:USERPROFILE ".foundry\bin"

$env:BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org"
$env:DEPLOYER_ADDRESS = (& "$foundryBin\cast.exe" wallet address --account openescrow-base-sepolia).Trim()
if ($LASTEXITCODE -ne 0 -or $env:DEPLOYER_ADDRESS -notmatch '^0x[0-9a-fA-F]{40}$') {
  throw "Could not derive the public deployer address from the encrypted openescrow-base-sepolia keystore."
}

Set-Location -LiteralPath $repoRoot

function Assert-CandidateSourceClean {
  $sourceChanges = @(& git status --porcelain=v1 --untracked-files=all -- `
    .openai contracts lib script test foundry.toml remappings.txt .gitmodules frontend)
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

Write-Host ""
Write-Host "OpenEscrow Base Sepolia deployment" -ForegroundColor Cyan
Write-Host "Enter the password for the encrypted openescrow-base-sepolia keystore when prompted."
Write-Host ""

& "$foundryBin\forge.exe" script `
  script/DeployBaseSepolia.s.sol:DeployBaseSepolia `
  --rpc-url $env:BASE_SEPOLIA_RPC_URL `
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
