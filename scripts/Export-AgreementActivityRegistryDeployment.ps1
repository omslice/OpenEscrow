[CmdletBinding()]
param(
    [string]$BroadcastPath = "broadcast/DeployAgreementActivityRegistry.s.sol/84532/run-latest.json",
    [string]$OutputPath = "deployments/base-sepolia-activity-registry.json",
    [string]$EscrowManifestPath = "deployments/base-sepolia-latest.json",
    [string]$ExpectedCommit,
    [datetime]$BroadcastNotBeforeUtc
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$foundryBin = Join-Path $env:USERPROFILE ".foundry\bin"
$rpcUrl = "https://sepolia.base.org"
$broadcastFile = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $BroadcastPath))
$outputFile = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $OutputPath))
$repoPrefix = $repoRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $outputFile.StartsWith($repoPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to write the registry manifest outside the repository."
}
$escrowManifestCandidate = if ([System.IO.Path]::IsPathRooted($EscrowManifestPath)) {
    $EscrowManifestPath
} else {
    Join-Path $repoRoot $EscrowManifestPath
}
$escrowManifestFile = [System.IO.Path]::GetFullPath($escrowManifestCandidate)

if (-not (Test-Path -LiteralPath $escrowManifestFile -PathType Leaf)) {
    throw "Escrow deployment manifest not found: $escrowManifestFile"
}
$escrowManifest = Get-Content -LiteralPath $escrowManifestFile -Raw | ConvertFrom-Json
if ([int64]$escrowManifest.chainId -ne 84532) {
    throw "Refusing to use escrow manifest for chain $($escrowManifest.chainId); expected Base Sepolia (84532)."
}
$expectedEscrow = [string]$escrowManifest.openEscrow.address
if ($expectedEscrow -notmatch '^0x[0-9a-fA-F]{40}$') {
    throw "The escrow deployment manifest does not contain a valid OpenEscrow address."
}

if (-not (Test-Path -LiteralPath $broadcastFile -PathType Leaf)) {
    throw "Broadcast file not found: $broadcastFile"
}
if ($BroadcastNotBeforeUtc -and (Get-Item -LiteralPath $broadcastFile).LastWriteTimeUtc -lt $BroadcastNotBeforeUtc.ToUniversalTime()) {
    throw "The activity-registry broadcast artifact predates the current deployment attempt."
}

$broadcast = Get-Content -LiteralPath $broadcastFile -Raw | ConvertFrom-Json
if ([int64]$broadcast.chain -ne 84532) {
    throw "Refusing to export deployment for chain $($broadcast.chain); expected Base Sepolia (84532)."
}

$registryTransactions = @($broadcast.transactions | Where-Object {
    $_.transactionType -eq "CREATE" -and
    $_.contractName -eq "AgreementActivityRegistry" -and
    $_.contractAddress
})
if ($registryTransactions.Count -ne 1) {
    throw "Expected exactly one AgreementActivityRegistry deployment."
}

$registryTransaction = $registryTransactions[0]
$receipts = @($broadcast.receipts | Where-Object {
    $_.transactionHash -eq $registryTransaction.hash
})
if ($receipts.Count -ne 1 -or $receipts[0].status -ne "0x1") {
    throw "The AgreementActivityRegistry receipt is missing or unsuccessful."
}
if (
    $registryTransaction.arguments.Count -ne 1 -or
    [string]$registryTransaction.arguments[0] -ine $expectedEscrow
) {
    throw "The registry was not constructed with the OpenEscrow address in the approved deployment manifest."
}

$registryAddress = [string]$registryTransaction.contractAddress
$registryCode = $null
$liveEscrow = $null
$propagationAttempts = 12
for ($attempt = 1; $attempt -le $propagationAttempts; $attempt++) {
    $registryCode = & "$foundryBin\cast.exe" code $registryAddress --rpc-url $rpcUrl
    $codeExitCode = $LASTEXITCODE
    $registryCode = ([string]$registryCode).Trim()
    if ($codeExitCode -eq 0 -and $registryCode -ne '0x') {
        $liveEscrow = & "$foundryBin\cast.exe" call $registryAddress 'ESCROW()(address)' --rpc-url $rpcUrl
        $callExitCode = $LASTEXITCODE
        $liveEscrow = ([string]$liveEscrow).Trim()
        if ($callExitCode -eq 0 -and $liveEscrow -match '^0x[0-9a-fA-F]{40}$') {
            break
        }
    }
    if ($attempt -lt $propagationAttempts) {
        Write-Host "Waiting for Base Sepolia RPC propagation (attempt $attempt of $propagationAttempts)..."
        Start-Sleep -Seconds 5
    }
}
if ([string]$registryCode -eq '0x') {
    throw "The exported AgreementActivityRegistry address has no readable Base Sepolia code."
}
if ([string]$liveEscrow -notmatch '^0x[0-9a-fA-F]{40}$') {
    throw "Could not read the deployed registry's immutable escrow binding."
}
if ($liveEscrow -ine $expectedEscrow) {
    throw "The deployed registry's live ESCROW binding does not match the approved escrow manifest."
}

$blockNumber = [Convert]::ToInt64(
    ([string]$receipts[0].blockNumber).Replace("0x", ""),
    16
)
$commit = (& git -C $repoRoot rev-parse HEAD 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or $commit -notmatch '^[0-9a-f]{40}$') {
    throw "Could not determine the source commit for the registry manifest."
}
if ($ExpectedCommit -and $commit -ne $ExpectedCommit) {
    throw "The source commit changed before registry manifest export."
}

$manifest = [ordered]@{
    network = "base-sepolia"
    chainId = 84532
    sourceCommit = $commit
    escrowSourceCommit = [string]$escrowManifest.sourceCommit
    exportedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    agreementActivityRegistry = [ordered]@{
        address = $registryAddress
        transactionHash = [string]$registryTransaction.hash
        deploymentBlock = $blockNumber
        escrowAddress = $liveEscrow
    }
}

$outputDirectory = Split-Path -Parent $outputFile
if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory | Out-Null
}

$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $outputFile -Encoding utf8

Write-Host "Validated activity-registry manifest written to $outputFile"
Write-Host "AGREEMENT_ACTIVITY_REGISTRY_ADDRESS=$($manifest.agreementActivityRegistry.address)"
Write-Host "ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK=$($manifest.agreementActivityRegistry.deploymentBlock)"
