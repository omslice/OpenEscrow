// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {YieldEscrowV2Prototype} from "../contracts/experimental/YieldEscrowV2Prototype.sol";
import {MockFixedShareAdapter} from "./mocks/MockFixedShareAdapter.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract YieldEscrowV2PrototypeTest is Test {
    MockUSDC internal usdc;
    MockFixedShareAdapter internal adapter;
    YieldEscrowV2Prototype internal prototype;

    address internal landlord = makeAddr("landlord");
    address internal tenant = makeAddr("tenant");
    address internal tenantTwo = makeAddr("tenantTwo");
    address internal arbiter = makeAddr("arbiter");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant PRINCIPAL = 1_000e6;
    uint64 internal constant FUNDING_DELAY = 7 days;
    uint64 internal constant SETTLEMENT_DELAY = 30 days;
    uint64 internal constant CLAIM_PERIOD = 7 days;
    uint64 internal constant RESPONSE_PERIOD = 2 days;
    uint64 internal constant ARBITER_PERIOD = 3 days;

    function setUp() public {
        usdc = new MockUSDC();
        adapter = new MockFixedShareAdapter(address(usdc));
        prototype = new YieldEscrowV2Prototype(address(adapter));

        _fundWallet(tenant, 1_000_000e6);
        _fundWallet(tenantTwo, 1_000_000e6);
    }

    function test_singleTenantFundingCreatesFixedAgreementShares() public {
        uint256 id = _createAndFundSingle(PRINCIPAL, arbiter);
        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);

        assertEq(uint256(agreement.phase), uint256(YieldEscrowV2Prototype.Phase.Funded));
        assertEq(agreement.fundedPrincipal, PRINCIPAL);
        assertEq(agreement.receiptShares, PRINCIPAL);
        assertEq(adapter.RECEIPT_ASSET().balanceOf(address(prototype)), PRINCIPAL);
        assertEq(usdc.balanceOf(address(adapter)), PRINCIPAL);
        assertEq(usdc.balanceOf(address(prototype)), 0);
    }

    function test_multiTenantPrincipalStaysUninvestedUntilEveryoneFunds() public {
        uint256 id = _createMulti(PRINCIPAL, arbiter);

        vm.prank(tenant);
        prototype.fundTenantShare(id);
        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);

        assertEq(agreement.fundedPrincipal, 600e6);
        assertEq(agreement.receiptShares, 0);
        assertEq(usdc.balanceOf(address(prototype)), 600e6);
        assertEq(usdc.balanceOf(address(adapter)), 0);

        vm.prank(tenantTwo);
        prototype.fundTenantShare(id);
        agreement = prototype.getAgreement(id);

        assertEq(uint256(agreement.phase), uint256(YieldEscrowV2Prototype.Phase.Funded));
        assertEq(agreement.fundedPrincipal, PRINCIPAL);
        assertEq(agreement.receiptShares, PRINCIPAL);
        assertEq(usdc.balanceOf(address(prototype)), 0);
        assertEq(usdc.balanceOf(address(adapter)), PRINCIPAL);
    }

    function test_partialFundingCancellationRefundsExactContribution() public {
        uint256 id = _createMulti(PRINCIPAL, arbiter);
        vm.prank(tenant);
        prototype.fundTenantShare(id);

        vm.prank(landlord);
        prototype.cancelProposal(id);

        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        assertEq(uint256(agreement.phase), uint256(YieldEscrowV2Prototype.Phase.Cancelled));
        assertEq(agreement.tenantWithdrawable, 600e6);
        assertEq(prototype.tenantWithdrawableByAddress(id, tenant), 600e6);
        assertEq(prototype.tenantWithdrawableByAddress(id, tenantTwo), 0);

        uint256 balanceBefore = usdc.balanceOf(tenant);
        vm.prank(tenant);
        prototype.withdraw(id);
        assertEq(usdc.balanceOf(tenant) - balanceBefore, 600e6);
        assertEq(usdc.balanceOf(address(prototype)), 0);
    }

    function test_permissionlessCancellationOnlyAfterFundingDeadline() public {
        uint256 id = _createMulti(PRINCIPAL, arbiter);
        vm.prank(tenant);
        prototype.fundTenantShare(id);

        vm.expectRevert(YieldEscrowV2Prototype.FundingWindowStillOpen.selector);
        vm.prank(stranger);
        prototype.cancelProposal(id);

        vm.warp(prototype.getAgreement(id).fundingDeadline);
        vm.prank(stranger);
        prototype.cancelProposal(id);
        assertEq(uint256(prototype.getAgreement(id).phase), uint256(YieldEscrowV2Prototype.Phase.Cancelled));
    }

    function test_positiveYieldAndNoClaimAreDistributedByTenantOwnership() public {
        uint256 id = _createAndFundMulti(PRINCIPAL, arbiter);
        _setStrategyValue(1.1e18, PRINCIPAL);
        _settle(id, 1_090e6);

        vm.warp(prototype.getAgreement(id).claimSubmissionDeadline);
        prototype.finalizeNoClaim(id);

        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        assertEq(agreement.redeemedAssets, 1_100e6);
        assertEq(agreement.landlordWithdrawable, 0);
        assertEq(agreement.tenantWithdrawable, 1_100e6);
        assertEq(prototype.tenantWithdrawableByAddress(id, tenant), 660e6);
        assertEq(prototype.tenantWithdrawableByAddress(id, tenantTwo), 440e6);
        _assertDistributedConservation(id);
    }

    function test_fullClaimAcceptanceFinalizesWithoutArbiter() public {
        uint256 id = _createAndFundMulti(PRINCIPAL, arbiter);
        _settle(id, PRINCIPAL);

        vm.prank(landlord);
        prototype.submitClaim(id, 300e6);
        vm.prank(tenant);
        prototype.respondToClaim(id, 300e6);
        vm.prank(tenantTwo);
        prototype.respondToClaim(id, 300e6);

        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        assertEq(uint256(agreement.phase), uint256(YieldEscrowV2Prototype.Phase.Distributed));
        assertEq(uint256(agreement.closeReason), uint256(YieldEscrowV2Prototype.CloseReason.Settled));
        assertEq(agreement.landlordPrincipal, 300e6);
        assertEq(agreement.landlordWithdrawable, 300e6);
        assertEq(agreement.tenantWithdrawable, 700e6);
        _assertDistributedConservation(id);
    }

    function test_claimOutcomeCanBePreservedBeforeStrategyRedemption() public {
        uint256 id = _createAndFundSingle(PRINCIPAL, arbiter);
        vm.warp(prototype.getAgreement(id).settlementTime);

        vm.prank(landlord);
        prototype.submitClaim(id, 300e6);
        vm.prank(tenant);
        prototype.respondToClaim(id, 300e6);

        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        assertEq(uint256(agreement.phase), uint256(YieldEscrowV2Prototype.Phase.ResolvedPendingStrategy));
        assertEq(agreement.landlordPrincipal, 300e6);
        assertEq(agreement.receiptShares, PRINCIPAL);
        assertFalse(agreement.strategySettled);

        _setStrategyValue(1.1e18, PRINCIPAL);
        prototype.settleStrategy(id, 1_100e6);

        agreement = prototype.getAgreement(id);
        assertEq(uint256(agreement.phase), uint256(YieldEscrowV2Prototype.Phase.Distributed));
        assertTrue(agreement.strategySettled);
        assertEq(agreement.landlordWithdrawable, 300e6);
        assertEq(agreement.tenantWithdrawable, 800e6);
        _assertDistributedConservation(id);
    }

    function test_claimCannotOpenBeforeSettlementTimeEvenIfStrategyIsFunded() public {
        uint256 id = _createAndFundSingle(PRINCIPAL, arbiter);
        vm.expectRevert(YieldEscrowV2Prototype.ClaimWindowNotOpen.selector);
        vm.prank(landlord);
        prototype.submitClaim(id, 100e6);
    }

    function test_strategyCanSettleWhileClaimIsDisputedWithoutChangingClaimOutcome() public {
        uint256 id = _createAndFundSingle(PRINCIPAL, arbiter);
        vm.warp(prototype.getAgreement(id).settlementTime);
        vm.prank(landlord);
        prototype.submitClaim(id, 400e6);
        vm.prank(tenant);
        prototype.respondToClaim(id, 100e6);

        assertEq(uint256(prototype.getAgreement(id).phase), uint256(YieldEscrowV2Prototype.Phase.Disputed));
        _setStrategyValue(1.1e18, PRINCIPAL);
        prototype.settleStrategy(id, 1_100e6);

        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        assertEq(uint256(agreement.phase), uint256(YieldEscrowV2Prototype.Phase.Disputed));
        assertEq(agreement.acceptedPrincipal, 100e6);
        assertTrue(agreement.strategySettled);
        assertEq(agreement.redeemedAssets, 1_100e6);

        vm.expectRevert(YieldEscrowV2Prototype.InvalidPhase.selector);
        prototype.settleStrategy(id, 0);
        assertEq(prototype.getAgreement(id).redeemedAssets, 1_100e6);

        vm.prank(arbiter);
        prototype.resolveDispute(id, 50e6);
        agreement = prototype.getAgreement(id);
        assertEq(agreement.landlordPrincipal, 150e6);
        assertEq(agreement.landlordWithdrawable, 150e6);
        assertEq(agreement.tenantWithdrawable, 950e6);
    }

    function test_partialAcceptanceAndArbiterAwardUsePrincipalUnits() public {
        uint256 id = _createAndFundMulti(PRINCIPAL, arbiter);
        _setStrategyValue(1.1e18, PRINCIPAL);
        _settle(id, 1_100e6);

        vm.prank(landlord);
        prototype.submitClaim(id, 300e6);
        vm.prank(tenant);
        prototype.respondToClaim(id, 300e6);
        vm.prank(tenantTwo);
        prototype.respondToClaim(id, 250e6);

        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        assertEq(uint256(agreement.phase), uint256(YieldEscrowV2Prototype.Phase.Disputed));
        assertEq(agreement.acceptedPrincipal, 250e6);

        vm.prank(arbiter);
        prototype.resolveDispute(id, 25e6);

        agreement = prototype.getAgreement(id);
        assertEq(agreement.landlordPrincipal, 275e6);
        assertEq(agreement.landlordWithdrawable, 275e6);
        assertEq(agreement.tenantWithdrawable, 825e6);
        assertEq(prototype.tenantWithdrawableByAddress(id, tenant), 495e6);
        assertEq(prototype.tenantWithdrawableByAddress(id, tenantTwo), 330e6);
        _assertDistributedConservation(id);
    }

    function test_strategyLossIsSharedProRataAfterClaimResolution() public {
        uint256 id = _createAndFundSingle(PRINCIPAL, arbiter);
        _setStrategyValue(0.8e18, PRINCIPAL);
        _settle(id, 800e6);

        vm.prank(landlord);
        prototype.submitClaim(id, 250e6);
        vm.prank(tenant);
        prototype.respondToClaim(id, 250e6);

        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        assertEq(agreement.landlordPrincipal, 250e6);
        assertEq(agreement.landlordWithdrawable, 200e6);
        assertEq(agreement.tenantWithdrawable, 600e6);
        _assertDistributedConservation(id);
    }

    function test_missingTenantResponseCreatesFullDisputeAndTimeoutFavorsTenants() public {
        uint256 id = _createAndFundMulti(PRINCIPAL, arbiter);
        _settle(id, PRINCIPAL);

        vm.prank(landlord);
        prototype.submitClaim(id, 300e6);
        vm.prank(tenant);
        prototype.respondToClaim(id, 200e6);

        vm.warp(prototype.getAgreement(id).responseDeadline);
        prototype.finalizeNoResponse(id);
        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        assertEq(uint256(agreement.phase), uint256(YieldEscrowV2Prototype.Phase.Disputed));
        assertEq(agreement.acceptedPrincipal, 0);

        vm.warp(agreement.arbiterRulingDeadline);
        prototype.claimArbiterTimeout(id);
        agreement = prototype.getAgreement(id);
        assertEq(agreement.landlordPrincipal, 0);
        assertEq(agreement.tenantWithdrawable, PRINCIPAL);
    }

    function test_noArbiterTenantDisputeIsRecordedWhileClaimPrincipalGoesToLandlord() public {
        uint256 id = _createAndFundSingle(PRINCIPAL, address(0));
        _settle(id, PRINCIPAL);
        vm.prank(landlord);
        prototype.submitClaim(id, 400e6);
        vm.prank(tenant);
        prototype.respondToClaim(id, 0);

        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        assertEq(uint256(agreement.phase), uint256(YieldEscrowV2Prototype.Phase.Distributed));
        assertEq(agreement.acceptedPrincipal, 0);
        assertEq(agreement.landlordPrincipal, 400e6);
        assertEq(agreement.landlordWithdrawable, 400e6);
        assertEq(agreement.tenantWithdrawable, 600e6);
        assertEq(prototype.tenantAcceptedClaimPrincipal(id, tenant), 0);
        _assertDistributedConservation(id);
    }

    function test_noArbiterClaimCannotCapturePositiveTenantYield() public {
        uint256 id = _createAndFundMulti(PRINCIPAL, address(0));
        _setStrategyValue(1.1e18, PRINCIPAL);
        _settle(id, 1_100e6);

        vm.prank(landlord);
        prototype.submitClaim(id, 400e6);
        vm.prank(tenant);
        prototype.respondToClaim(id, 0);
        vm.prank(tenantTwo);
        prototype.respondToClaim(id, 400e6);

        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        assertEq(uint256(agreement.phase), uint256(YieldEscrowV2Prototype.Phase.Distributed));
        assertEq(agreement.acceptedPrincipal, 0);
        assertEq(agreement.landlordPrincipal, 400e6);
        assertEq(agreement.landlordWithdrawable, 400e6);
        assertEq(agreement.tenantWithdrawable, 700e6);
        assertEq(prototype.tenantWithdrawableByAddress(id, tenant), 420e6);
        assertEq(prototype.tenantWithdrawableByAddress(id, tenantTwo), 280e6);
        _assertDistributedConservation(id);
    }

    function test_noArbiterMissingResponseIsRecordedAndSettlesDocumentedClaim() public {
        uint256 id = _createAndFundSingle(PRINCIPAL, address(0));
        _settle(id, PRINCIPAL);
        vm.prank(landlord);
        prototype.submitClaim(id, 400e6);

        vm.warp(prototype.getAgreement(id).responseDeadline);
        vm.expectEmit(true, false, false, true, address(prototype));
        emit YieldEscrowV2Prototype.NoResponseRecorded(id, 400e6);
        prototype.finalizeNoResponse(id);

        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        assertFalse(prototype.tenantClaimResponded(id, tenant));
        assertEq(uint256(agreement.phase), uint256(YieldEscrowV2Prototype.Phase.Distributed));
        assertEq(agreement.acceptedPrincipal, 0);
        assertEq(agreement.landlordPrincipal, 400e6);
        assertEq(agreement.landlordWithdrawable, 400e6);
        assertEq(agreement.tenantWithdrawable, 600e6);
        _assertDistributedConservation(id);
    }

    function test_downwardClaimAmendmentDoesNotExtendResponseDeadline() public {
        uint256 id = _createAndFundSingle(PRINCIPAL, arbiter);
        _settle(id, PRINCIPAL);
        vm.prank(landlord);
        prototype.submitClaim(id, 400e6);
        uint64 originalDeadline = prototype.getAgreement(id).responseDeadline;

        vm.warp(block.timestamp + 1 days);
        vm.prank(landlord);
        prototype.amendClaim(id, 250e6);

        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        assertEq(agreement.claimedPrincipal, 250e6);
        assertEq(agreement.responseDeadline, originalDeadline);

        vm.expectRevert(YieldEscrowV2Prototype.ClaimAlreadyAmended.selector);
        vm.prank(landlord);
        prototype.amendClaim(id, 200e6);
    }

    function test_claimRetractionReturnsAllRedeemedAssetsToTenants() public {
        uint256 id = _createAndFundSingle(PRINCIPAL, arbiter);
        _setStrategyValue(1.1e18, PRINCIPAL);
        _settle(id, 1_100e6);
        vm.prank(landlord);
        prototype.submitClaim(id, 400e6);
        vm.prank(landlord);
        prototype.amendClaim(id, 0);

        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        assertEq(uint256(agreement.closeReason), uint256(YieldEscrowV2Prototype.CloseReason.ClaimRetracted));
        assertEq(agreement.landlordWithdrawable, 0);
        assertEq(agreement.tenantWithdrawable, 1_100e6);
    }

    function test_minimumAssetsProtectsSettlementAndAllowsRetry() public {
        uint256 id = _createAndFundSingle(PRINCIPAL, arbiter);
        _setStrategyValue(0.9e18, PRINCIPAL);
        vm.warp(prototype.getAgreement(id).settlementTime);

        vm.expectRevert(YieldEscrowV2Prototype.MinimumAssetsNotMet.selector);
        prototype.settleStrategy(id, 950e6);

        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        assertEq(uint256(agreement.phase), uint256(YieldEscrowV2Prototype.Phase.Funded));
        assertEq(agreement.receiptShares, PRINCIPAL);

        prototype.settleStrategy(id, 900e6);
        agreement = prototype.getAgreement(id);
        assertEq(uint256(agreement.phase), uint256(YieldEscrowV2Prototype.Phase.ClaimWindow));
        assertEq(agreement.redeemedAssets, 900e6);
    }

    function test_adapterReportsMustMatchObservedTokenDeltas() public {
        uint256 depositId = _createSingle(PRINCIPAL, arbiter);
        adapter.setMisreportDeposit(true);
        vm.expectRevert(YieldEscrowV2Prototype.DepositMismatch.selector);
        vm.prank(tenant);
        prototype.fundTenantShare(depositId);
        assertEq(prototype.getAgreement(depositId).fundedPrincipal, 0);
        adapter.setMisreportDeposit(false);

        uint256 redemptionId = _createAndFundSingle(PRINCIPAL, arbiter);
        adapter.setMisreportRedemption(true);
        vm.warp(prototype.getAgreement(redemptionId).settlementTime);
        vm.expectRevert(YieldEscrowV2Prototype.RedemptionMismatch.selector);
        prototype.settleStrategy(redemptionId, 0);
        assertEq(uint256(prototype.getAgreement(redemptionId).phase), uint256(YieldEscrowV2Prototype.Phase.Funded));
    }

    function test_agreementSharesRemainIsolatedInSharedCustody() public {
        uint256 firstId = _createAndFundSingle(PRINCIPAL, arbiter);
        uint256 secondId = _createAndFundSingle(PRINCIPAL, arbiter);
        _setStrategyValue(1.1e18, PRINCIPAL * 2);
        vm.warp(prototype.getAgreement(firstId).settlementTime);

        prototype.settleStrategy(firstId, 1_100e6);

        YieldEscrowV2Prototype.Agreement memory first = prototype.getAgreement(firstId);
        YieldEscrowV2Prototype.Agreement memory second = prototype.getAgreement(secondId);
        assertEq(first.redeemedAssets, 1_100e6);
        assertEq(first.receiptShares, 0);
        assertEq(second.receiptShares, PRINCIPAL);
        assertEq(adapter.RECEIPT_ASSET().balanceOf(address(prototype)), PRINCIPAL);

        prototype.settleStrategy(secondId, 1_100e6);
        assertEq(prototype.getAgreement(secondId).redeemedAssets, 1_100e6);
        assertEq(adapter.RECEIPT_ASSET().balanceOf(address(prototype)), 0);
    }

    function test_claimAndWithdrawalAuthorization() public {
        uint256 id = _createAndFundSingle(PRINCIPAL, arbiter);
        _settle(id, PRINCIPAL);

        vm.expectRevert(YieldEscrowV2Prototype.NotAuthorized.selector);
        vm.prank(stranger);
        prototype.submitClaim(id, 100e6);

        vm.prank(landlord);
        prototype.submitClaim(id, 100e6);
        vm.expectRevert(YieldEscrowV2Prototype.NotAuthorized.selector);
        vm.prank(stranger);
        prototype.respondToClaim(id, 0);

        vm.prank(tenant);
        prototype.respondToClaim(id, 100e6);
        vm.expectRevert(YieldEscrowV2Prototype.NotAuthorized.selector);
        vm.prank(stranger);
        prototype.withdraw(id);
    }

    function test_withdrawalsCannotBeRepeated() public {
        uint256 id = _createAndFundSingle(PRINCIPAL, arbiter);
        _settle(id, PRINCIPAL);
        vm.warp(prototype.getAgreement(id).claimSubmissionDeadline);
        prototype.finalizeNoClaim(id);

        vm.prank(tenant);
        prototype.withdraw(id);
        vm.expectRevert(YieldEscrowV2Prototype.NothingToWithdraw.selector);
        vm.prank(tenant);
        prototype.withdraw(id);
        assertEq(prototype.getAgreement(id).withdrawnAssets, PRINCIPAL);
    }

    function test_rejectsInvalidMultiTenantSharesAndRoleConflicts() public {
        address[] memory tenants = new address[](2);
        tenants[0] = tenant;
        tenants[1] = tenantTwo;
        uint16[] memory shares = new uint16[](2);
        shares[0] = 5_000;
        shares[1] = 4_999;

        vm.expectRevert(YieldEscrowV2Prototype.InvalidTenantShares.selector);
        vm.prank(landlord);
        prototype.createMultiTenantAgreement(
            tenants,
            shares,
            arbiter,
            PRINCIPAL,
            uint64(block.timestamp + FUNDING_DELAY),
            uint64(block.timestamp + SETTLEMENT_DELAY),
            CLAIM_PERIOD,
            RESPONSE_PERIOD,
            ARBITER_PERIOD
        );

        shares[1] = 5_000;
        vm.expectRevert(YieldEscrowV2Prototype.NotAuthorized.selector);
        vm.prank(landlord);
        prototype.createMultiTenantAgreement(
            tenants,
            shares,
            tenantTwo,
            PRINCIPAL,
            uint64(block.timestamp + FUNDING_DELAY),
            uint64(block.timestamp + SETTLEMENT_DELAY),
            CLAIM_PERIOD,
            RESPONSE_PERIOD,
            ARBITER_PERIOD
        );

        vm.expectRevert(YieldEscrowV2Prototype.InvalidTenantShares.selector);
        vm.prank(landlord);
        prototype.createMultiTenantAgreement(
            tenants,
            shares,
            arbiter,
            1,
            uint64(block.timestamp + FUNDING_DELAY),
            uint64(block.timestamp + SETTLEMENT_DELAY),
            CLAIM_PERIOD,
            RESPONSE_PERIOD,
            ARBITER_PERIOD
        );
    }

    function testFuzz_settlementAndClaimDistributionConserveActualAssets(
        uint96 principalSeed,
        uint96 claimSeed,
        uint64 indexSeed
    ) public {
        uint256 principal = bound(uint256(principalSeed), 1e6, 1_000_000e6);
        uint256 claim = bound(uint256(claimSeed), 1, principal);
        uint256 index = bound(uint256(indexSeed), 0.5e18, 2e18);

        uint256 id = _createAndFundSingle(principal, arbiter);
        _setStrategyValue(index, principal);
        _settle(id, 0);
        vm.prank(landlord);
        prototype.submitClaim(id, claim);
        vm.prank(tenant);
        prototype.respondToClaim(id, claim);

        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        assertEq(agreement.landlordWithdrawable + agreement.tenantWithdrawable, agreement.redeemedAssets);
        assertLe(agreement.landlordWithdrawable, claim);
        if (agreement.redeemedAssets >= principal) {
            assertEq(agreement.landlordWithdrawable, claim);
            assertGe(agreement.tenantWithdrawable, principal - claim);
        }
    }

    function _createSingle(uint256 principal, address selectedArbiter) internal returns (uint256 id) {
        vm.prank(landlord);
        id = prototype.createAgreement(
            tenant,
            selectedArbiter,
            principal,
            uint64(block.timestamp + FUNDING_DELAY),
            uint64(block.timestamp + SETTLEMENT_DELAY),
            CLAIM_PERIOD,
            RESPONSE_PERIOD,
            ARBITER_PERIOD
        );
    }

    function _createMulti(uint256 principal, address selectedArbiter) internal returns (uint256 id) {
        address[] memory tenants = new address[](2);
        tenants[0] = tenant;
        tenants[1] = tenantTwo;
        uint16[] memory shares = new uint16[](2);
        shares[0] = 6_000;
        shares[1] = 4_000;

        vm.prank(landlord);
        id = prototype.createMultiTenantAgreement(
            tenants,
            shares,
            selectedArbiter,
            principal,
            uint64(block.timestamp + FUNDING_DELAY),
            uint64(block.timestamp + SETTLEMENT_DELAY),
            CLAIM_PERIOD,
            RESPONSE_PERIOD,
            ARBITER_PERIOD
        );
    }

    function _createAndFundSingle(uint256 principal, address selectedArbiter) internal returns (uint256 id) {
        id = _createSingle(principal, selectedArbiter);
        vm.prank(tenant);
        prototype.fundTenantShare(id);
    }

    function _createAndFundMulti(uint256 principal, address selectedArbiter) internal returns (uint256 id) {
        id = _createMulti(principal, selectedArbiter);
        vm.prank(tenant);
        prototype.fundTenantShare(id);
        vm.prank(tenantTwo);
        prototype.fundTenantShare(id);
    }

    function _setStrategyValue(uint256 index, uint256 totalPrincipal) internal {
        adapter.setAssetsPerShare(index);
        uint256 totalRedemption = (totalPrincipal * index) / 1e18;
        uint256 adapterBalance = usdc.balanceOf(address(adapter));
        if (totalRedemption > adapterBalance) {
            usdc.mint(address(adapter), totalRedemption - adapterBalance);
        }
    }

    function _settle(uint256 id, uint256 minAssetsOut) internal {
        vm.warp(prototype.getAgreement(id).settlementTime);
        prototype.settleStrategy(id, minAssetsOut);
    }

    function _fundWallet(address wallet, uint256 amount) internal {
        usdc.mint(wallet, amount);
        vm.prank(wallet);
        usdc.approve(address(prototype), type(uint256).max);
    }

    function _assertDistributedConservation(uint256 id) internal view {
        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        assertEq(
            agreement.redeemedAssets,
            agreement.landlordWithdrawable + agreement.tenantWithdrawable + agreement.withdrawnAssets
        );
    }
}
