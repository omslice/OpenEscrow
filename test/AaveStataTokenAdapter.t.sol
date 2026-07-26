// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {AaveStataTokenAdapter} from "../contracts/adapters/AaveStataTokenAdapter.sol";
import {YieldEscrowV2Prototype} from "../contracts/experimental/YieldEscrowV2Prototype.sol";
import {MockAavePool, MockATokenIdentity, MockAaveStataToken} from "./mocks/MockAaveStataToken.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract AaveStataTokenAdapterTest is Test {
    MockUSDC internal usdc;
    MockAavePool internal pool;
    MockATokenIdentity internal aToken;
    MockAaveStataToken internal vault;
    AaveStataTokenAdapter internal adapter;

    address internal landlord = makeAddr("landlord");
    address internal tenant = makeAddr("tenant");
    address internal receiver = makeAddr("receiver");

    uint256 internal constant PRINCIPAL = 1_000e6;

    function setUp() public {
        usdc = new MockUSDC();
        pool = new MockAavePool();
        aToken = new MockATokenIdentity(address(usdc), address(pool));
        vault = new MockAaveStataToken(address(usdc), address(aToken), address(pool));
        adapter = _deployAdapter(vault, usdc, aToken, pool);
    }

    function test_constructorPinsChainAndEveryAaveIdentity() public view {
        assertEq(adapter.EXPECTED_CHAIN_ID(), block.chainid);
        assertEq(adapter.settlementAsset(), address(usdc));
        assertEq(adapter.receiptAsset(), address(vault));
        assertEq(adapter.A_TOKEN(), address(aToken));
        assertEq(adapter.AAVE_POOL(), address(pool));
    }

    function test_constructorRejectsWrongChain() public {
        vm.expectRevert(
            abi.encodeWithSelector(AaveStataTokenAdapter.WrongChain.selector, block.chainid, block.chainid + 1)
        );
        new AaveStataTokenAdapter(address(vault), address(usdc), address(aToken), address(pool), block.chainid + 1);
    }

    function test_constructorRejectsSettlementAssetMismatch() public {
        MockUSDC otherAsset = new MockUSDC();
        vm.expectRevert(AaveStataTokenAdapter.IdentityMismatch.selector);
        new AaveStataTokenAdapter(address(vault), address(otherAsset), address(aToken), address(pool), block.chainid);
    }

    function test_constructorRejectsATokenMismatch() public {
        MockATokenIdentity otherAToken = new MockATokenIdentity(address(usdc), address(pool));
        vm.expectRevert(AaveStataTokenAdapter.IdentityMismatch.selector);
        new AaveStataTokenAdapter(address(vault), address(usdc), address(otherAToken), address(pool), block.chainid);
    }

    function test_constructorRejectsPoolMismatch() public {
        MockAavePool otherPool = new MockAavePool();
        vm.expectRevert(AaveStataTokenAdapter.IdentityMismatch.selector);
        new AaveStataTokenAdapter(address(vault), address(usdc), address(aToken), address(otherPool), block.chainid);
    }

    function test_depositReturnsObservedFixedSharesAndLeavesNoDustOrAllowance() public {
        usdc.mint(tenant, PRINCIPAL);
        vm.startPrank(tenant);
        usdc.approve(address(adapter), PRINCIPAL);
        uint256 shares = adapter.deposit(PRINCIPAL, receiver);
        vm.stopPrank();

        assertEq(shares, PRINCIPAL);
        assertEq(vault.balanceOf(receiver), shares);
        assertEq(usdc.balanceOf(address(adapter)), 0);
        assertEq(vault.balanceOf(address(adapter)), 0);
        assertEq(usdc.allowance(address(adapter), address(vault)), 0);
    }

    function test_redeemReturnsObservedYieldAndLeavesNoDust() public {
        uint256 shares = _depositForTenant(PRINCIPAL);
        usdc.mint(address(vault), 100e6);
        uint256 expectedAssets = vault.previewRedeem(shares);

        vm.startPrank(tenant);
        vault.approve(address(adapter), shares);
        uint256 assets = adapter.redeem(shares, receiver);
        vm.stopPrank();

        assertEq(assets, expectedAssets);
        assertGt(assets, PRINCIPAL);
        assertEq(usdc.balanceOf(receiver), assets);
        assertEq(usdc.balanceOf(address(adapter)), 0);
        assertEq(vault.balanceOf(address(adapter)), 0);
    }

    function test_depositReportsPauseOrCapacityBeforePullingFunds() public {
        vault.setDepositLimit(PRINCIPAL - 1);
        usdc.mint(tenant, PRINCIPAL);

        vm.startPrank(tenant);
        usdc.approve(address(adapter), PRINCIPAL);
        vm.expectRevert(
            abi.encodeWithSelector(AaveStataTokenAdapter.DepositUnavailable.selector, PRINCIPAL - 1, PRINCIPAL)
        );
        adapter.deposit(PRINCIPAL, receiver);
        vm.stopPrank();

        assertEq(usdc.balanceOf(tenant), PRINCIPAL);
        assertEq(usdc.balanceOf(address(adapter)), 0);
    }

    function test_redeemReportsLiquidityShortageWithoutRetainingShares() public {
        uint256 shares = _depositForTenant(PRINCIPAL);
        vault.setRedemptionLimit(shares - 1);

        vm.startPrank(tenant);
        vault.approve(address(adapter), shares);
        vm.expectRevert(
            abi.encodeWithSelector(AaveStataTokenAdapter.RedemptionUnavailable.selector, shares - 1, shares)
        );
        adapter.redeem(shares, receiver);
        vm.stopPrank();

        assertEq(vault.balanceOf(tenant), shares);
        assertEq(vault.balanceOf(address(adapter)), 0);
    }

    function test_v2RejectsUnavailableDepositBeforeAdapterCall() public {
        YieldEscrowV2Prototype prototype = new YieldEscrowV2Prototype(address(adapter));
        uint256 id = _createAgreement(prototype);
        vault.setDepositLimit(PRINCIPAL - 1);
        usdc.mint(tenant, PRINCIPAL);

        vm.startPrank(tenant);
        usdc.approve(address(prototype), PRINCIPAL);
        vm.expectRevert(
            abi.encodeWithSelector(YieldEscrowV2Prototype.StrategyDepositUnavailable.selector, PRINCIPAL - 1, PRINCIPAL)
        );
        prototype.fundTenantShare(id);
        vm.stopPrank();

        assertEq(usdc.balanceOf(tenant), PRINCIPAL);
        assertEq(usdc.balanceOf(address(prototype)), 0);
    }

    function test_v2PreservesFundedPositionWhenRedemptionIsUnavailable() public {
        YieldEscrowV2Prototype prototype = new YieldEscrowV2Prototype(address(adapter));
        uint256 id = _createAgreement(prototype);
        usdc.mint(tenant, PRINCIPAL);
        vm.startPrank(tenant);
        usdc.approve(address(prototype), PRINCIPAL);
        prototype.fundTenantShare(id);
        vm.stopPrank();

        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        vault.setRedemptionLimit(agreement.receiptShares - 1);
        vm.warp(agreement.settlementTime);
        vm.expectRevert(
            abi.encodeWithSelector(
                YieldEscrowV2Prototype.StrategyRedemptionUnavailable.selector,
                agreement.receiptShares - 1,
                agreement.receiptShares
            )
        );
        prototype.settleStrategy(id, 0);

        agreement = prototype.getAgreement(id);
        assertFalse(agreement.strategySettled);
        assertEq(agreement.receiptShares, PRINCIPAL);
        assertEq(vault.balanceOf(address(prototype)), PRINCIPAL);
    }

    function test_v2EndToEndRedeemsAaveStyleSharesAndAllocatesYieldToTenant() public {
        YieldEscrowV2Prototype prototype = new YieldEscrowV2Prototype(address(adapter));
        uint256 id = _createAgreement(prototype);
        usdc.mint(tenant, PRINCIPAL);
        vm.startPrank(tenant);
        usdc.approve(address(prototype), PRINCIPAL);
        prototype.fundTenantShare(id);
        vm.stopPrank();

        usdc.mint(address(vault), 100e6);
        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        vm.warp(agreement.settlementTime);
        prototype.settleStrategy(id, PRINCIPAL);
        vm.warp(agreement.claimSubmissionDeadline);
        prototype.finalizeNoClaim(id);

        agreement = prototype.getAgreement(id);
        assertGt(agreement.redeemedAssets, PRINCIPAL);
        assertEq(agreement.landlordWithdrawable, 0);
        assertEq(agreement.tenantWithdrawable, agreement.redeemedAssets);
    }

    function _depositForTenant(uint256 assets) internal returns (uint256 shares) {
        usdc.mint(tenant, assets);
        vm.startPrank(tenant);
        usdc.approve(address(adapter), assets);
        shares = adapter.deposit(assets, tenant);
        vm.stopPrank();
    }

    function _createAgreement(YieldEscrowV2Prototype prototype) internal returns (uint256 id) {
        vm.prank(landlord);
        id = prototype.createAgreement(
            tenant,
            address(0),
            PRINCIPAL,
            uint64(block.timestamp + 7 days),
            uint64(block.timestamp + 30 days),
            7 days,
            2 days,
            3 days
        );
    }

    function _deployAdapter(
        MockAaveStataToken vault_,
        MockUSDC settlementAsset,
        MockATokenIdentity aToken_,
        MockAavePool pool_
    ) internal returns (AaveStataTokenAdapter) {
        return new AaveStataTokenAdapter(
            address(vault_), address(settlementAsset), address(aToken_), address(pool_), block.chainid
        );
    }
}
