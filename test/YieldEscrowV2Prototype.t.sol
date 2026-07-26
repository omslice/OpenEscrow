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
    address internal resolver = makeAddr("claimResolver");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant PRINCIPAL = 1_000e6;
    uint64 internal constant SETTLEMENT_DELAY = 30 days;

    function setUp() public {
        usdc = new MockUSDC();
        adapter = new MockFixedShareAdapter(address(usdc));
        prototype = new YieldEscrowV2Prototype(address(adapter), resolver);

        usdc.mint(tenant, 1_000_000e6);
        vm.prank(tenant);
        usdc.approve(address(prototype), type(uint256).max);
    }

    function test_fundingCreatesFixedAgreementShares() public {
        uint256 id = _createAndFund(PRINCIPAL);
        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);

        assertEq(uint256(agreement.phase), uint256(YieldEscrowV2Prototype.Phase.Funded));
        assertEq(agreement.principal, PRINCIPAL);
        assertEq(agreement.receiptShares, PRINCIPAL);
        assertEq(adapter.RECEIPT_ASSET().balanceOf(address(prototype)), PRINCIPAL);
        assertEq(usdc.balanceOf(address(adapter)), PRINCIPAL);
        assertEq(usdc.balanceOf(address(prototype)), 0);
    }

    function test_positiveYieldIsRedeemedAndBelongsToTenant() public {
        uint256 id = _createAndFund(PRINCIPAL);
        _setStrategyValue(1.1e18, PRINCIPAL);
        _settle(id, 1_090e6);

        vm.prank(resolver);
        prototype.finalizeDistribution(id, 250e6);

        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        assertEq(agreement.redeemedAssets, 1_100e6);
        assertEq(agreement.landlordWithdrawable, 250e6);
        assertEq(agreement.tenantWithdrawable, 850e6);
        assertEq(agreement.landlordWithdrawable + agreement.tenantWithdrawable, agreement.redeemedAssets);

        vm.prank(landlord);
        prototype.withdraw(id);
        vm.prank(tenant);
        prototype.withdraw(id);

        assertEq(usdc.balanceOf(landlord), 250e6);
        assertEq(usdc.balanceOf(tenant), 1_000_000e6 - PRINCIPAL + 850e6);
        assertEq(usdc.balanceOf(address(prototype)), 0);
    }

    function test_lossIsAllocatedProRataAfterRedemption() public {
        uint256 id = _createAndFund(PRINCIPAL);
        _setStrategyValue(0.8e18, PRINCIPAL);
        _settle(id, 800e6);

        vm.prank(resolver);
        prototype.finalizeDistribution(id, 250e6);

        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        assertEq(agreement.redeemedAssets, 800e6);
        assertEq(agreement.landlordWithdrawable, 200e6);
        assertEq(agreement.tenantWithdrawable, 600e6);
        assertEq(agreement.landlordWithdrawable + agreement.tenantWithdrawable, agreement.redeemedAssets);
    }

    function test_minimumAssetsProtectsSettlementAndAllowsRetry() public {
        uint256 id = _createAndFund(PRINCIPAL);
        _setStrategyValue(0.9e18, PRINCIPAL);
        vm.warp(block.timestamp + SETTLEMENT_DELAY);

        vm.expectRevert(YieldEscrowV2Prototype.MinimumAssetsNotMet.selector);
        prototype.settleStrategy(id, 950e6);

        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        assertEq(uint256(agreement.phase), uint256(YieldEscrowV2Prototype.Phase.Funded));
        assertEq(agreement.receiptShares, PRINCIPAL);
        assertEq(adapter.RECEIPT_ASSET().balanceOf(address(prototype)), PRINCIPAL);

        prototype.settleStrategy(id, 900e6);
        agreement = prototype.getAgreement(id);
        assertEq(uint256(agreement.phase), uint256(YieldEscrowV2Prototype.Phase.Settled));
        assertEq(agreement.redeemedAssets, 900e6);
    }

    function test_settlementIsPermissionlessButOnlyAfterDeadlineAndOnlyOnce() public {
        uint256 id = _createAndFund(PRINCIPAL);

        vm.expectRevert(YieldEscrowV2Prototype.InvalidSettlementTime.selector);
        vm.prank(stranger);
        prototype.settleStrategy(id, PRINCIPAL);

        vm.warp(block.timestamp + SETTLEMENT_DELAY);
        vm.prank(stranger);
        prototype.settleStrategy(id, PRINCIPAL);

        vm.expectRevert(YieldEscrowV2Prototype.InvalidPhase.selector);
        prototype.settleStrategy(id, 0);
    }

    function test_adapterDepositReportMustMatchObservedShares() public {
        uint256 id = _create(PRINCIPAL);
        adapter.setMisreportDeposit(true);

        vm.expectRevert(YieldEscrowV2Prototype.DepositMismatch.selector);
        vm.prank(tenant);
        prototype.fund(id);

        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        assertEq(uint256(agreement.phase), uint256(YieldEscrowV2Prototype.Phase.Proposed));
        assertEq(adapter.RECEIPT_ASSET().balanceOf(address(prototype)), 0);
        assertEq(usdc.balanceOf(tenant), 1_000_000e6);
    }

    function test_adapterRedemptionReportMustMatchObservedAssets() public {
        uint256 id = _createAndFund(PRINCIPAL);
        adapter.setMisreportRedemption(true);
        vm.warp(block.timestamp + SETTLEMENT_DELAY);

        vm.expectRevert(YieldEscrowV2Prototype.RedemptionMismatch.selector);
        prototype.settleStrategy(id, 0);

        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        assertEq(uint256(agreement.phase), uint256(YieldEscrowV2Prototype.Phase.Funded));
        assertEq(agreement.receiptShares, PRINCIPAL);

        adapter.setMisreportRedemption(false);
        prototype.settleStrategy(id, PRINCIPAL);
        assertEq(prototype.getAgreement(id).redeemedAssets, PRINCIPAL);
    }

    function test_onlyClaimResolverCanFinalizeDistribution() public {
        uint256 id = _createAndFund(PRINCIPAL);
        _settle(id, PRINCIPAL);

        vm.expectRevert(YieldEscrowV2Prototype.NotAuthorized.selector);
        vm.prank(stranger);
        prototype.finalizeDistribution(id, 100e6);

        vm.prank(resolver);
        prototype.finalizeDistribution(id, 100e6);

        vm.expectRevert(YieldEscrowV2Prototype.InvalidPhase.selector);
        vm.prank(resolver);
        prototype.finalizeDistribution(id, 100e6);
    }

    function test_agreementSharesRemainIsolatedInSharedCustody() public {
        uint256 firstId = _createAndFund(PRINCIPAL);
        uint256 secondId = _createAndFund(PRINCIPAL);
        _setStrategyValue(1.1e18, PRINCIPAL * 2);
        vm.warp(block.timestamp + SETTLEMENT_DELAY);

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

    function testFuzz_settlementAndDistributionConserveActualAssets(
        uint96 principalSeed,
        uint96 landlordSeed,
        uint64 indexSeed
    ) public {
        uint256 principal = bound(uint256(principalSeed), 1e6, 1_000_000e6);
        uint256 landlordPrincipal = bound(uint256(landlordSeed), 0, principal);
        uint256 index = bound(uint256(indexSeed), 0.5e18, 2e18);

        uint256 id = _createAndFund(principal);
        _setStrategyValue(index, principal);
        _settle(id, 0);

        vm.prank(resolver);
        prototype.finalizeDistribution(id, landlordPrincipal);

        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        assertEq(agreement.landlordWithdrawable + agreement.tenantWithdrawable, agreement.redeemedAssets);
        assertLe(agreement.landlordWithdrawable, landlordPrincipal);
        if (agreement.redeemedAssets >= principal) {
            assertEq(agreement.landlordWithdrawable, landlordPrincipal);
            assertGe(agreement.tenantWithdrawable, principal - landlordPrincipal);
        }
    }

    function _create(uint256 principal) internal returns (uint256 id) {
        vm.prank(landlord);
        id = prototype.createAgreement(tenant, principal, uint64(block.timestamp + SETTLEMENT_DELAY));
    }

    function _createAndFund(uint256 principal) internal returns (uint256 id) {
        id = _create(principal);
        vm.prank(tenant);
        prototype.fund(id);
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
        vm.warp(block.timestamp + SETTLEMENT_DELAY);
        prototype.settleStrategy(id, minAssetsOut);
    }
}
