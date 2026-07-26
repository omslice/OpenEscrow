[CmdletBinding()]
param(
    [string]$BroadcastPath = "broadcast/DeployAgreementActivityRegistry.s.sol/84532/run-latest.json",
    [string]$OutputPath = "deployments/base-sepolia-activity-registry.json"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$broadcastFile = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $BroadcastPath))
$outputFile = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $OutputPath))
$expectedEscrow = "0xF18BfDbFd3FF84c603CbDf895D2a96aC7260AE99"

if (-not (Test-Path -LiteralPath $broadcastFile -PathType Leaf)) {
    throw "Broadcast file not found: $broadcastFile"
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
    throw "The registry was not constructed with the active OpenEscrow address."
}

$blockNumber = [Convert]::ToInt64(
    ([string]$receipts[0].blockNumber).Replace("0x", ""),
    16
)
$commit = (& git -C $repoRoot rev-parse HEAD 2>$null)
if ($LASTEXITCODE -ne 0) {
    $commit = $null
}

$manifest = [ordered]@{
    network = "base-sepolia"
    chainId = 84532
    sourceCommit = $commit
    exportedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    agreementActivityRegistry = [ordered]@{
        address = [string]$registryTransaction.contractAddress
        transactionHash = [string]$registryTransaction.hash
        deploymentBlock = $blockNumber
        escrowAddress = [string]$registryTransaction.arguments[0]
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
