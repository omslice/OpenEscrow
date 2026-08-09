[CmdletBinding()]
param(
    [string]$BroadcastPath = "broadcast/DeployBaseSepolia.s.sol/84532/run-latest.json",
    [string]$OutputPath = "deployments/base-sepolia-candidate.json",
    [string]$ExpectedCommit = ""
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
$registryTransactions = @($broadcast.transactions | Where-Object {
    $_.transactionType -eq "CREATE" -and
    $_.contractName -eq "AgreementActivityRegistry" -and
    $_.contractAddress
})
$plainTokenTransactions = @($broadcast.transactions | Where-Object {
    $_.transactionType -eq "CREATE" -and
    $_.contractName -eq "TestUSDC" -and
    $_.contractAddress
})
$yieldTokenTransactions = @($broadcast.transactions | Where-Object {
    $_.transactionType -eq "CREATE" -and
    $_.contractName -eq "TestAaveUSDC" -and
    $_.contractAddress
})

if (
    $escrowTransactions.Count -ne 1 -or
    $reserveTransactions.Count -ne 1 -or
    $registryTransactions.Count -ne 1 -or
    $plainTokenTransactions.Count -ne 1 -or
    $yieldTokenTransactions.Count -ne 1
) {
    throw "Expected exactly one TestUSDC, TestAaveUSDC, OpenEscrow, OperationsReserve, and AgreementActivityRegistry deployment."
}

$escrowTransaction = $escrowTransactions[0]
$reserveTransaction = $reserveTransactions[0]
$registryTransaction = $registryTransactions[0]
$plainTokenTransaction = $plainTokenTransactions[0]
$yieldTokenTransaction = $yieldTokenTransactions[0]
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

foreach ($transaction in @(
    $plainTokenTransaction,
    $yieldTokenTransaction,
    $escrowTransaction,
    $reserveTransaction,
    $configureTransaction,
    $registryTransaction
)) {
    $receipt = @($broadcast.receipts | Where-Object {
        $_.transactionHash -eq $transaction.hash
    })
    if ($receipt.Count -ne 1 -or $receipt[0].status -ne "0x1") {
        throw "Deployment receipt is missing or unsuccessful for $($transaction.contractName)."
    }
}

if (
    $registryTransaction.arguments.Count -ne 1 -or
    [string]$registryTransaction.arguments[0] -ine [string]$escrowTransaction.contractAddress
) {
    throw "AgreementActivityRegistry was not deployed against the matching OpenEscrow address."
}

$plainToken = [string]$escrowTransaction.arguments[0]
$yieldToken = [string]$escrowTransaction.arguments[1]
$plainTokenReceipt = @($broadcast.receipts | Where-Object {
    $_.transactionHash -eq $plainTokenTransaction.hash
})[0]
$yieldTokenReceipt = @($broadcast.receipts | Where-Object {
    $_.transactionHash -eq $yieldTokenTransaction.hash
})[0]
if (
    $plainToken -ine [string]$plainTokenTransaction.contractAddress -or
    $yieldToken -ine [string]$yieldTokenTransaction.contractAddress
) {
    throw "OpenEscrow token bindings do not match the newly deployed test-token pair."
}
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

$commit = [string](& git -C $repoRoot rev-parse HEAD 2>$null)
if ($LASTEXITCODE -ne 0) {
    throw "Could not determine the deployment source commit."
}
$commit = $commit.Trim()
if ($commit -notmatch '^[0-9a-f]{40}$') {
    throw "Deployment source commit is invalid."
}
if ($ExpectedCommit) {
    if ($ExpectedCommit -notmatch '^[0-9a-f]{40}$' -or $commit -ne $ExpectedCommit) {
        throw "Current source commit does not match the exact preflighted deployment commit."
    }
}

$manifest = [ordered]@{
    schema = "openescrow.deployment-manifest/v2"
    network = "base-sepolia"
    chainId = 84532
    sourceCommit = $commit
    cohortStatus = "candidate-unconfigured"
    exportedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    openEscrow = [ordered]@{
        address = [string]$escrowTransaction.contractAddress
        transactionHash = [string]$escrowTransaction.hash
        deploymentBlock = [Convert]::ToInt64(
            ([string](@($broadcast.receipts | Where-Object {
                $_.transactionHash -eq $escrowTransaction.hash
            })[0].blockNumber)).Replace("0x", ""),
            16
        )
    }
    operationsReserve = [ordered]@{
        address = [string]$reserveTransaction.contractAddress
        transactionHash = [string]$reserveTransaction.hash
        deploymentBlock = [Convert]::ToInt64(
            ([string](@($broadcast.receipts | Where-Object {
                $_.transactionHash -eq $reserveTransaction.hash
            })[0].blockNumber)).Replace("0x", ""),
            16
        )
    }
    agreementActivityRegistry = [ordered]@{
        address = [string]$registryTransaction.contractAddress
        transactionHash = [string]$registryTransaction.hash
        deploymentBlock = [Convert]::ToInt64(
            ([string](@($broadcast.receipts | Where-Object {
                $_.transactionHash -eq $registryTransaction.hash
            })[0].blockNumber)).Replace("0x", ""),
            16
        )
        escrowAddress = [string]$escrowTransaction.contractAddress
    }
    reciprocalConfiguration = [ordered]@{
        transactionHash = [string]$configureTransaction.hash
        reserveAddress = [string]$reserveTransaction.contractAddress
        escrowAddress = [string]$escrowTransaction.contractAddress
    }
    tokens = [ordered]@{
        plain = $plainToken
        yield = $yieldToken
        plainDeployment = [ordered]@{
            contractName = "TestUSDC"
            transactionHash = [string]$plainTokenTransaction.hash
            deploymentBlock = [Convert]::ToInt64(
                ([string]$plainTokenReceipt.blockNumber).Replace("0x", ""),
                16
            )
        }
        yieldDeployment = [ordered]@{
            contractName = "TestAaveUSDC"
            transactionHash = [string]$yieldTokenTransaction.hash
            deploymentBlock = [Convert]::ToInt64(
                ([string]$yieldTokenReceipt.blockNumber).Replace("0x", ""),
                16
            )
        }
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
Write-Host "AGREEMENT_ACTIVITY_REGISTRY_ADDRESS=$($manifest.agreementActivityRegistry.address)"
Write-Host "ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK=$($manifest.agreementActivityRegistry.deploymentBlock)"
Write-Host "USDC_ADDRESS=$($manifest.tokens.plain)"
Write-Host "YIELD_USDC_ADDRESS=$($manifest.tokens.yield)"
