[CmdletBinding()]
param(
    [string]$BroadcastPath = "broadcast/DeployBaseSepolia.s.sol/84532/run-latest.json",
    [string]$OutputPath = "deployments/base-sepolia-latest.json"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$broadcastFile = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $BroadcastPath))
$outputFile = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $OutputPath))

if (-not (Test-Path -LiteralPath $broadcastFile -PathType Leaf)) {
    throw "Broadcast file not found: $broadcastFile"
}

$broadcast = Get-Content -LiteralPath $broadcastFile -Raw | ConvertFrom-Json
if ([int64]$broadcast.chain -ne 84532) {
    throw "Refusing to export deployment for chain $($broadcast.chain); expected Base Sepolia (84532)."
}

$escrowTransactions = @($broadcast.transactions | Where-Object {
    $_.transactionType -eq "CREATE" -and
    $_.contractName -eq "OpenEscrow" -and
    $_.contractAddress
})
$reserveTransactions = @($broadcast.transactions | Where-Object {
    $_.transactionType -eq "CREATE" -and
    $_.contractName -eq "OperationsReserve" -and
    $_.contractAddress
})

if ($escrowTransactions.Count -ne 1 -or $reserveTransactions.Count -ne 1) {
    throw "Expected exactly one OpenEscrow and one OperationsReserve deployment."
}

$escrowTransaction = $escrowTransactions[0]
$reserveTransaction = $reserveTransactions[0]
$configureTransactions = @($broadcast.transactions | Where-Object {
    $_.transactionType -eq "CALL" -and
    $_.contractName -eq "OperationsReserve" -and
    $_.function -eq "configureEscrow(address)" -and
    $_.contractAddress -and
    $_.arguments.Count -eq 1
})
if ($configureTransactions.Count -ne 1) {
    throw "Expected exactly one OperationsReserve.configureEscrow call."
}
$configureTransaction = $configureTransactions[0]

foreach ($transaction in @($escrowTransaction, $reserveTransaction, $configureTransaction)) {
    $receipt = @($broadcast.receipts | Where-Object {
        $_.transactionHash -eq $transaction.hash
    })
    if ($receipt.Count -ne 1 -or $receipt[0].status -ne "0x1") {
        throw "Deployment receipt is missing or unsuccessful for $($transaction.contractName)."
    }
}

$plainToken = [string]$escrowTransaction.arguments[0]
$yieldToken = [string]$escrowTransaction.arguments[1]
$configuredReserve = [string]$escrowTransaction.arguments[2]
if ($configuredReserve -ine [string]$reserveTransaction.contractAddress) {
    throw "OpenEscrow was not deployed with the matching OperationsReserve address."
}
if (
    [string]$configureTransaction.contractAddress -ine [string]$reserveTransaction.contractAddress -or
    [string]$configureTransaction.arguments[0] -ine [string]$escrowTransaction.contractAddress
) {
    throw "OperationsReserve.configureEscrow did not link the matching deployed pair."
}
if (
    [string]$reserveTransaction.arguments[0] -ine $plainToken -or
    [string]$reserveTransaction.arguments[1] -ine $yieldToken
) {
    throw "OpenEscrow and OperationsReserve were deployed with different plain tokens."
}

$commit = (& git -C $repoRoot rev-parse HEAD 2>$null)
if ($LASTEXITCODE -ne 0) {
    $commit = $null
}

$manifest = [ordered]@{
    network = "base-sepolia"
    chainId = 84532
    sourceCommit = $commit
    exportedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    openEscrow = [ordered]@{
        address = [string]$escrowTransaction.contractAddress
        transactionHash = [string]$escrowTransaction.hash
    }
    operationsReserve = [ordered]@{
        address = [string]$reserveTransaction.contractAddress
        transactionHash = [string]$reserveTransaction.hash
    }
    tokens = [ordered]@{
        plain = $plainToken
        yield = $yieldToken
    }
}

$outputDirectory = Split-Path -Parent $outputFile
if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory | Out-Null
}

$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $outputFile -Encoding utf8

Write-Host "Validated deployment manifest written to $outputFile"
Write-Host ""
Write-Host "Frontend address values:"
Write-Host "OPEN_ESCROW_ADDRESS=$($manifest.openEscrow.address)"
Write-Host "OPERATIONS_RESERVE_ADDRESS=$($manifest.operationsReserve.address)"
Write-Host "USDC_ADDRESS=$($manifest.tokens.plain)"
Write-Host "YIELD_USDC_ADDRESS=$($manifest.tokens.yield)"
