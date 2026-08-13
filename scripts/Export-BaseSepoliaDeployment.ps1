[CmdletBinding()]
param(
    [string]$BroadcastPath = "broadcast/DeployBaseSepolia.s.sol/84532/run-latest.json",
    [string]$OutputPath = "deployments/base-sepolia-candidate.json",
    [string]$ExpectedCommit = "",
    [string]$RpcUrl = "https://sepolia.base.org"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$foundryBin = Join-Path $env:USERPROFILE ".foundry\bin"
$broadcastFile = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $BroadcastPath))
$outputFile = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $OutputPath))

function Invoke-CastAddressCall {
    param(
        [string]$ContractAddress,
        [string]$Signature
    )

    $result = & "$foundryBin\cast.exe" call $ContractAddress $Signature --rpc-url $RpcUrl 2>$null
    $exitCode = $LASTEXITCODE
    $result = ([string]$result).Trim()
    if ($exitCode -ne 0 -or $result -notmatch '^0x[0-9a-fA-F]{40}$') {
        throw "Could not read $Signature from deployed contract $ContractAddress."
    }
    return $result
}

function Assert-LiveAddressBinding {
    param(
        [string]$Label,
        [string]$Actual,
        [string]$Expected
    )

    if ($Actual -ine $Expected) {
        throw "$Label does not match the exact deployment cohort."
    }
}

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
    throw "OpenEscrow and OperationsReserve were deployed with different token bindings."
}

$chainIdOutput = & "$foundryBin\cast.exe" chain-id --rpc-url $RpcUrl 2>$null
$chainIdExitCode = $LASTEXITCODE
if ($chainIdExitCode -ne 0 -or ([string]$chainIdOutput).Trim() -ne '84532') {
    throw "The deployment verification RPC did not return Base Sepolia chain ID 84532."
}

$liveContracts = [ordered]@{
    TestUSDC = [string]$plainTokenTransaction.contractAddress
    TestAaveUSDC = [string]$yieldTokenTransaction.contractAddress
    OpenEscrow = [string]$escrowTransaction.contractAddress
    OperationsReserve = [string]$reserveTransaction.contractAddress
    AgreementActivityRegistry = [string]$registryTransaction.contractAddress
}
$propagationAttempts = 12
for ($attempt = 1; $attempt -le $propagationAttempts; $attempt++) {
    $allCodeReadable = $true
    foreach ($entry in $liveContracts.GetEnumerator()) {
        $code = & "$foundryBin\cast.exe" code $entry.Value --rpc-url $RpcUrl 2>$null
        $codeExitCode = $LASTEXITCODE
        $code = ([string]$code).Trim()
        if ($codeExitCode -ne 0 -or $code -notmatch '^0x[0-9a-fA-F]+$' -or $code -eq '0x') {
            $allCodeReadable = $false
            break
        }
    }
    if ($allCodeReadable) {
        break
    }
    if ($attempt -lt $propagationAttempts) {
        Write-Host "Waiting for Base Sepolia RPC propagation (attempt $attempt of $propagationAttempts)..."
        Start-Sleep -Seconds 5
    }
}
if (-not $allCodeReadable) {
    throw "At least one deployed cohort address has no readable Base Sepolia code."
}

$deployerAddress = [string]$reserveTransaction.transaction.from
if ($deployerAddress -notmatch '^0x[0-9a-fA-F]{40}$') {
    throw "The reserve deployment does not identify a valid treasury/deployer address."
}

Assert-LiveAddressBinding 'TestAaveUSDC.SETTLEMENT_ASSET()' `
    (Invoke-CastAddressCall $yieldToken 'SETTLEMENT_ASSET()(address)') $plainToken
Assert-LiveAddressBinding 'OpenEscrow.TOKEN()' `
    (Invoke-CastAddressCall $escrowTransaction.contractAddress 'TOKEN()(address)') $plainToken
Assert-LiveAddressBinding 'OpenEscrow.YIELD_TOKEN()' `
    (Invoke-CastAddressCall $escrowTransaction.contractAddress 'YIELD_TOKEN()(address)') $yieldToken
Assert-LiveAddressBinding 'OpenEscrow.OPERATIONS_RESERVE()' `
    (Invoke-CastAddressCall $escrowTransaction.contractAddress 'OPERATIONS_RESERVE()(address)') $reserveTransaction.contractAddress
Assert-LiveAddressBinding 'OperationsReserve.ESCROW()' `
    (Invoke-CastAddressCall $reserveTransaction.contractAddress 'ESCROW()(address)') $escrowTransaction.contractAddress
Assert-LiveAddressBinding 'OperationsReserve.TOKEN()' `
    (Invoke-CastAddressCall $reserveTransaction.contractAddress 'TOKEN()(address)') $plainToken
Assert-LiveAddressBinding 'OperationsReserve.YIELD_TOKEN()' `
    (Invoke-CastAddressCall $reserveTransaction.contractAddress 'YIELD_TOKEN()(address)') $yieldToken
Assert-LiveAddressBinding 'OperationsReserve.TREASURY()' `
    (Invoke-CastAddressCall $reserveTransaction.contractAddress 'TREASURY()(address)') $deployerAddress
Assert-LiveAddressBinding 'AgreementActivityRegistry.ESCROW()' `
    (Invoke-CastAddressCall $registryTransaction.contractAddress 'ESCROW()(address)') $escrowTransaction.contractAddress

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
        treasuryAddress = $deployerAddress
        liveBindingsVerified = $true
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
