// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {OpenEscrow} from "../contracts/OpenEscrow.sol";
import {TestUSDC} from "../contracts/TestUSDC.sol";
import {TestAaveUSDC} from "../contracts/TestAaveUSDC.sol";
import {OperationsReserve} from "../contracts/OperationsReserve.sol";

contract YieldSettlementTest is Test {
    uint256 internal constant PRINCIPAL = 1_000e6;
    uint64 internal constant PERIOD = 5 minutes;

    TestUSDC internal testUSDC;
    TestAaveUSDC internal taUSDC;
    OpenEscrow internal escrow;

    address internal landlord = makeAddr("landlord");
    address internal tenantOne = makeAddr("tenant-one");
    address internal tenantTwo = makeAddr("tenant-two");
    address internal arbiter = makeAddr("arbiter");

    function setUp() public {
        vm.warp(10_000);
        testUSDC = new TestUSDC();
        taUSDC = new TestAaveUSDC(address(testUSDC));
        escrow = new OpenEscrow(address(testUSDC), address(taUSDC), address(0));
    }

    function _createAndFund(address selectedArbiter, uint64 claimDelay) internal returns (uint256 id) {
        address[] memory tenants = new address[](2);
        tenants[0] = tenantOne;
        tenants[1] = tenantTwo;
        uint16[] memory shares = new uint16[](2);
        shares[0] = 5_000;
        shares[1] = 5_000;

        vm.prank(landlord);
        id = escrow.createMultiTenantAgreementWithToken(
            tenants,
            shares,
            selectedArbiter,
            address(taUSDC),
            PRINCIPAL,
            uint64(block.timestamp) + claimDelay,
            PERIOD,
            PERIOD,
            PERIOD
        );
        if (selectedArbiter != address(0)) {
            vm.prank(selectedArbiter);
            escrow.acceptArbiterRole(id);
        }

        taUSDC.mint(tenantOne, PRINCIPAL / 2);
        taUSDC.mint(tenantTwo, PRINCIPAL / 2);
        vm.startPrank(tenantOne);
        taUSDC.approve(address(escrow), type(uint256).max);
        escrow.fundTenantShare(id);
        vm.stopPrank();
        vm.startPrank(tenantTwo);
        taUSDC.approve(address(escrow), type(uint256).max);
        escrow.fundTenantShare(id);
        vm.stopPrank();
    }

    function _submitClaim(uint256 id, uint256 principalClaim) internal {
        vm.prank(landlord);
        escrow.submitClaim(id, principalClaim, keccak256("claim"), "openescrow://evidence/test", 11);
    }

    function test_noArbiterClaimPaysLandlordOnlyDocumentedTestUsdAndTenantsKeepYield() public {
        uint256 id = _createAndFund(address(0), 2 hours);
        uint256 fundedAt = escrow.getAgreement(id).fundedAt;
        vm.warp(fundedAt + 2 hours);
        _submitClaim(id, 400e6);

        vm.prank(tenantOne);
        escrow.respondToClaim(id, 0);
        vm.prank(tenantTwo);
        escrow.respondToClaim(id, 0);

        OpenEscrow.Agreement memory agreement = escrow.getAgreement(id);
        assertEq(uint256(agreement.phase), uint256(OpenEscrow.Phase.Closed));
        assertTrue(escrow.yieldSettled(id));
        assertEq(escrow.settledValue(id), 1_020e6);
        assertEq(agreement.landlordWithdrawable, 400e6);
        assertEq(agreement.tenantWithdrawable, 620e6);
        assertEq(escrow.tenantWithdrawableByAddress(id, tenantOne), 310e6);
        assertEq(escrow.tenantWithdrawableByAddress(id, tenantTwo), 310e6);
        assertEq(taUSDC.balanceOf(address(escrow)), 0);
        assertEq(testUSDC.balanceOf(address(escrow)), 1_020e6);
        assertEq(escrow.payoutToken(id), address(testUSDC));

        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.ClaimWindowStillOpen.selector);
        escrow.withdraw(id);

        vm.warp(agreement.claimSubmissionDeadline);
        vm.prank(landlord);
        escrow.withdraw(id);
        vm.prank(tenantOne);
        escrow.withdraw(id);
        vm.prank(tenantTwo);
        escrow.withdraw(id);
        assertEq(testUSDC.balanceOf(landlord), 400e6);
        assertEq(testUSDC.balanceOf(tenantOne), 310e6);
        assertEq(testUSDC.balanceOf(tenantTwo), 310e6);
        assertEq(testUSDC.balanceOf(address(escrow)), 0);
    }

    function test_noClaimReturnsAllPrincipalAndCappedYieldToTenants() public {
        uint256 id = _createAndFund(address(0), 5 hours);
        OpenEscrow.Agreement memory funded = escrow.getAgreement(id);
        vm.warp(funded.claimSubmissionDeadline);

        vm.prank(tenantOne);
        escrow.withdrawNoClaim(id);

        OpenEscrow.Agreement memory agreement = escrow.getAgreement(id);
        assertEq(escrow.settledValue(id), 1_050e6);
        assertEq(agreement.landlordWithdrawable, 0);
        assertEq(agreement.tenantWithdrawable, 1_050e6);
        assertEq(escrow.tenantWithdrawableByAddress(id, tenantOne), 525e6);
        assertEq(escrow.tenantWithdrawableByAddress(id, tenantTwo), 525e6);
    }

    function test_arbiterAwardIsPrincipalDenominatedAndCannotCaptureTenantYield() public {
        uint256 id = _createAndFund(arbiter, 3 hours);
        uint256 fundedAt = escrow.getAgreement(id).fundedAt;
        vm.warp(fundedAt + 3 hours);
        _submitClaim(id, 400e6);

        vm.prank(tenantOne);
        escrow.respondToClaim(id, 100e6);
        vm.prank(tenantTwo);
        escrow.respondToClaim(id, 100e6);
        vm.prank(arbiter);
        escrow.resolveDispute(id, 200e6);

        OpenEscrow.Agreement memory agreement = escrow.getAgreement(id);
        assertEq(escrow.settledValue(id), 1_030e6);
        assertEq(agreement.landlordWithdrawable, 300e6);
        assertEq(agreement.tenantWithdrawable, 730e6);
        assertEq(escrow.tenantWithdrawableByAddress(id, tenantOne), 365e6);
        assertEq(escrow.tenantWithdrawableByAddress(id, tenantTwo), 365e6);
    }

    function test_retractedClaimReturnsAllValueToTenants() public {
        uint256 id = _createAndFund(address(0), 1 hours);
        uint256 fundedAt = escrow.getAgreement(id).fundedAt;
        vm.warp(fundedAt + 1 hours);
        _submitClaim(id, 400e6);

        vm.prank(landlord);
        escrow.amendClaim(id, 0, keccak256("retracted"), "openescrow://evidence/test", 11);

        OpenEscrow.Agreement memory agreement = escrow.getAgreement(id);
        assertEq(uint256(agreement.closeReason), uint256(OpenEscrow.CloseReason.ClaimRetracted));
        assertEq(agreement.landlordWithdrawable, 0);
        assertEq(agreement.tenantWithdrawable, 1_010e6);
    }

    function test_yieldSettlementReturnsUnusedReserveInOriginalYieldToken() public {
        OperationsReserve reserve = new OperationsReserve(address(testUSDC), address(taUSDC));
        OpenEscrow reserveEscrow = new OpenEscrow(address(testUSDC), address(taUSDC), address(reserve));
        reserve.configureEscrow(address(reserveEscrow));

        address[] memory tenants = new address[](2);
        tenants[0] = tenantOne;
        tenants[1] = tenantTwo;
        uint16[] memory shares = new uint16[](2);
        shares[0] = 5_000;
        shares[1] = 5_000;
        vm.prank(landlord);
        uint256 id = reserveEscrow.createMultiTenantAgreementWithToken(
            tenants,
            shares,
            address(0),
            address(taUSDC),
            PRINCIPAL,
            uint64(block.timestamp) + 2 hours,
            PERIOD,
            PERIOD,
            PERIOD
        );

        taUSDC.mint(tenantOne, 502_500_000);
        taUSDC.mint(tenantTwo, 502_500_000);
        vm.startPrank(tenantOne);
        taUSDC.approve(address(reserveEscrow), type(uint256).max);
        reserveEscrow.fundTenantShareWithReserve(id);
        vm.stopPrank();
        vm.startPrank(tenantTwo);
        taUSDC.approve(address(reserveEscrow), type(uint256).max);
        reserveEscrow.fundTenantShareWithReserve(id);
        vm.stopPrank();

        vm.warp(reserveEscrow.getAgreement(id).claimWindowStart);
        vm.prank(landlord);
        reserveEscrow.submitClaim(id, 400e6, keccak256("claim"), "openescrow://evidence/test", 11);
        vm.prank(tenantOne);
        reserveEscrow.respondToClaim(id, 0);
        vm.prank(tenantTwo);
        reserveEscrow.respondToClaim(id, 0);

        OpenEscrow.Agreement memory resolved = reserveEscrow.getAgreement(id);
        vm.prank(tenantOne);
        vm.expectRevert(OpenEscrow.ClaimWindowStillOpen.selector);
        reserveEscrow.withdraw(id);

        vm.warp(resolved.claimSubmissionDeadline);
        vm.prank(landlord);
        reserveEscrow.withdraw(id);
        vm.prank(tenantOne);
        reserveEscrow.withdraw(id);
        vm.prank(tenantTwo);
        reserveEscrow.withdraw(id);

        assertEq(testUSDC.balanceOf(landlord), 400e6);
        assertEq(testUSDC.balanceOf(tenantOne), 310e6);
        assertEq(testUSDC.balanceOf(tenantTwo), 310e6);
        assertEq(taUSDC.balanceOf(tenantOne), 2_500_000);
        assertEq(taUSDC.balanceOf(tenantTwo), 2_500_000);
        assertEq(taUSDC.balanceOf(address(reserve)), 0);
        assertEq(reserve.refundableBalance(address(taUSDC)), 0);
    }
}
