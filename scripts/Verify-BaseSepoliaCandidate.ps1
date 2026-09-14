[CmdletBinding()]
param(
    [string]$ManifestPath = "deployments/base-sepolia-candidate.json",
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-f]{40}$')]
    [string]$ExpectedSourceCommit,
    [string[]]$RpcUrls = @(
        "https://sepolia.base.org",
        "https://base-sepolia-rpc.publicnode.com"
    )
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$foundryBin = Join-Path $env:USERPROFILE ".foundry\bin"
$manifestFile = if ([System.IO.Path]::IsPathRooted($ManifestPath)) {
  [System.IO.Path]::GetFullPath($ManifestPath)
}
else {
  [System.IO.Path]::GetFullPath((Join-Path $repoRoot $ManifestPath))
}
$addressPattern = '^0x[0-9a-fA-F]{40}$'
$hashPattern = '^0x[0-9a-fA-F]{64}$'

if (-not (Test-Path -LiteralPath $manifestFile -PathType Leaf)) {
  throw "Candidate manifest not found: $manifestFile"
}
$manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
$manifestSha256 = (Get-FileHash -LiteralPath $manifestFile -Algorithm SHA256).Hash.ToLowerInvariant()
if (
  $manifest.schema -ne "openescrow.deployment-manifest/v2" -or
  [int64]$manifest.chainId -ne 84532 -or
  $manifest.network -ne "base-sepolia" -or
  $manifest.cohortStatus -ne "candidate-unconfigured" -or
  $manifest.reciprocalConfiguration.liveBindingsVerified -ne $true
) {
  throw "Candidate manifest is not an independently verified Base Sepolia candidate."
}
if ([string]$manifest.sourceCommit -cne $ExpectedSourceCommit) {
  throw "Candidate manifest source commit does not match the reviewed release candidate."
}

$contracts = [ordered]@{
  TestUSDC = [string]$manifest.tokens.plain
  TestAaveUSDC = [string]$manifest.tokens.yield
  OpenEscrow = [string]$manifest.openEscrow.address
  OperationsReserve = [string]$manifest.operationsReserve.address
  AgreementActivityRegistry = [string]$manifest.agreementActivityRegistry.address
}
foreach ($entry in $contracts.GetEnumerator()) {
  if ($entry.Value -notmatch $addressPattern) {
    throw "$($entry.Key) candidate address is invalid."
  }
}

$transactionHashes = @(
  [string]$manifest.tokens.plainDeployment.transactionHash,
  [string]$manifest.tokens.yieldDeployment.transactionHash,
  [string]$manifest.openEscrow.transactionHash,
  [string]$manifest.operationsReserve.transactionHash,
  [string]$manifest.reciprocalConfiguration.transactionHash,
  [string]$manifest.agreementActivityRegistry.transactionHash
)
if ($transactionHashes.Count -ne 6 -or @($transactionHashes | Where-Object { $_ -notmatch $hashPattern }).Count -ne 0) {
  throw "Candidate manifest transaction evidence is incomplete."
}

function Invoke-AddressCall {
  param([string]$RpcUrl, [string]$Address, [string]$Signature)
  $value = & "$foundryBin\cast.exe" call $Address $Signature --rpc-url $RpcUrl 2>$null
  $exitCode = $LASTEXITCODE
  $value = ([string]$value).Trim()
  if ($exitCode -ne 0 -or $value -notmatch $addressPattern) {
    throw "Could not read $Signature from $Address."
  }
  return $value.ToLowerInvariant()
}

function Assert-EqualAddress {
  param([string]$Label, [string]$Actual, [string]$Expected)
  if ($Actual -ne $Expected.ToLowerInvariant()) {
    throw "$Label does not match the candidate cohort."
  }
}

$referenceCodeHashes = @{}
$rpcEvidence = @()
foreach ($rpcUrl in $RpcUrls) {
  $chainId = & "$foundryBin\cast.exe" chain-id --rpc-url $rpcUrl 2>$null
  if ($LASTEXITCODE -ne 0 -or ([string]$chainId).Trim() -ne "84532") {
    throw "An independent RPC endpoint did not return Base Sepolia chain ID 84532."
  }

  $codeHashes = [ordered]@{}
  foreach ($entry in $contracts.GetEnumerator()) {
    $code = & "$foundryBin\cast.exe" code $entry.Value --rpc-url $rpcUrl 2>$null
    $code = ([string]$code).Trim().ToLowerInvariant()
    if ($LASTEXITCODE -ne 0 -or $code -notmatch '^0x[0-9a-f]+$' -or $code -eq '0x') {
      throw "$($entry.Key) has no readable code through an independent RPC endpoint."
    }
    $hash = ([string]($code | & "$foundryBin\cast.exe" keccak)).Trim().ToLowerInvariant()
    if ($hash -notmatch $hashPattern) {
      throw "Could not hash live $($entry.Key) runtime code."
    }
    if ($referenceCodeHashes.ContainsKey($entry.Key) -and $referenceCodeHashes[$entry.Key] -ne $hash) {
      throw "Independent RPC endpoints disagree on $($entry.Key) runtime code."
    }
    $referenceCodeHashes[$entry.Key] = $hash
    $codeHashes[$entry.Key] = $hash
  }

  Assert-EqualAddress "TestAaveUSDC.SETTLEMENT_ASSET()" `
    (Invoke-AddressCall $rpcUrl $contracts.TestAaveUSDC 'SETTLEMENT_ASSET()(address)') $contracts.TestUSDC
  Assert-EqualAddress "OpenEscrow.TOKEN()" `
    (Invoke-AddressCall $rpcUrl $contracts.OpenEscrow 'TOKEN()(address)') $contracts.TestUSDC
  Assert-EqualAddress "OpenEscrow.YIELD_TOKEN()" `
    (Invoke-AddressCall $rpcUrl $contracts.OpenEscrow 'YIELD_TOKEN()(address)') $contracts.TestAaveUSDC
  Assert-EqualAddress "OpenEscrow.OPERATIONS_RESERVE()" `
    (Invoke-AddressCall $rpcUrl $contracts.OpenEscrow 'OPERATIONS_RESERVE()(address)') $contracts.OperationsReserve
  Assert-EqualAddress "OperationsReserve.ESCROW()" `
    (Invoke-AddressCall $rpcUrl $contracts.OperationsReserve 'ESCROW()(address)') $contracts.OpenEscrow
  Assert-EqualAddress "OperationsReserve.TOKEN()" `
    (Invoke-AddressCall $rpcUrl $contracts.OperationsReserve 'TOKEN()(address)') $contracts.TestUSDC
  Assert-EqualAddress "OperationsReserve.YIELD_TOKEN()" `
    (Invoke-AddressCall $rpcUrl $contracts.OperationsReserve 'YIELD_TOKEN()(address)') $contracts.TestAaveUSDC
  Assert-EqualAddress "OperationsReserve.TREASURY()" `
    (Invoke-AddressCall $rpcUrl $contracts.OperationsReserve 'TREASURY()(address)') `
    ([string]$manifest.reciprocalConfiguration.treasuryAddress)
  Assert-EqualAddress "AgreementActivityRegistry.ESCROW()" `
    (Invoke-AddressCall $rpcUrl $contracts.AgreementActivityRegistry 'ESCROW()(address)') $contracts.OpenEscrow

  foreach ($transactionHash in $transactionHashes) {
    $receipt = & "$foundryBin\cast.exe" receipt $transactionHash status --rpc-url $rpcUrl 2>$null
    $status = ([string]$receipt).Trim().ToLowerInvariant()
    if ($LASTEXITCODE -ne 0 -or $status -notin @('true', '1', '0x1', '0x01')) {
      throw "A candidate transaction receipt is missing or unsuccessful: $transactionHash"
    }
  }

  $rpcEvidence += [ordered]@{
    rpcUrl = $rpcUrl
    chainId = 84532
    codeHashes = $codeHashes
    receiptsVerified = $transactionHashes.Count
    reciprocalBindingsVerified = $true
  }
}

$evidence = [ordered]@{
  schema = "openescrow.base-sepolia-independent-verification/v1"
  verifiedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
  sourceCommit = [string]$manifest.sourceCommit
  candidateManifest = "deployments/base-sepolia-candidate.json"
  candidateManifestSha256 = $manifestSha256
  rpcAgreement = $rpcEvidence
  contractAddresses = $contracts
  transactionCount = $transactionHashes.Count
  status = "passed"
}
$outputFile = Join-Path $repoRoot "deployments/base-sepolia-candidate-verification.json"
$evidence | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $outputFile -Encoding utf8
Write-Host "Independent Base Sepolia candidate verification passed." -ForegroundColor Green
Write-Host "Evidence written to $outputFile"
