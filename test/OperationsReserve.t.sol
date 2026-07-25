// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {OpenEscrow} from "../contracts/OpenEscrow.sol";
import {OperationsReserve} from "../contracts/OperationsReserve.sol";
import {MockYieldUSDC} from "../contracts/MockYieldUSDC.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract OperationsReserveTest is Test {
    MockUSDC internal usdc;
    MockYieldUSDC internal yieldToken;
    OpenEscrow internal escrow;
    OperationsReserve internal reserve;

    address internal tenant = makeAddr("tenant");
    address internal cotenant = makeAddr("cotenant");
    address internal recipient = makeAddr("recipient");

    function setUp() public {
        usdc = new MockUSDC();
        yieldToken = new MockYieldUSDC();
        escrow = new OpenEscrow(address(usdc), address(yieldToken));
        reserve = new OperationsReserve(address(escrow), address(usdc), address(yieldToken));

        usdc.mint(tenant, 20e6);
        usdc.mint(cotenant, 20e6);
        yieldToken.mint(tenant, 20e6);
        yieldToken.mint(cotenant, 20e6);

        vm.prank(tenant);
        usdc.approve(address(reserve), type(uint256).max);
        vm.prank(cotenant);
        usdc.approve(address(reserve), type(uint256).max);
        vm.prank(tenant);
        yieldToken.approve(address(reserve), type(uint256).max);
        vm.prank(cotenant);
        yieldToken.approve(address(reserve), type(uint256).max);
    }

    function _createSingleTenantAgreement(address selectedToken) internal returns (uint256 id) {
        id = escrow.createAgreementWithToken(
            tenant, address(0), selectedToken, 1_000e6, uint64(block.timestamp + 30 days), 7 days, 7 days, 7 days
        );
    }

    function _createTwoTenantAgreement(address selectedToken) internal returns (uint256 id) {
        address[] memory tenants = new address[](2);
        tenants[0] = tenant;
        tenants[1] = cotenant;
        uint16[] memory shares = new uint16[](2);
        shares[0] = 5_000;
        shares[1] = 5_000;
        id = escrow.createMultiTenantAgreementWithToken(
            tenants,
            shares,
            address(0),
            selectedToken,
            1_000e6,
            uint64(block.timestamp + 30 days),
            7 days,
            7 days,
            7 days
        );
    }

    function test_plainAgreementReserveUsesPlainToken() public {
        uint256 id = _createSingleTenantAgreement(address(usdc));

        vm.expectEmit(true, true, true, true);
        emit OperationsReserve.OperationsReservePaid(address(escrow), id, tenant, address(usdc), 5e6);
        vm.prank(tenant);
        reserve.payReserve(address(escrow), id);

        assertTrue(reserve.paid(address(escrow), id, tenant));
        assertEq(reserve.paymentToken(address(escrow), id), address(usdc));
        assertEq(usdc.balanceOf(address(reserve)), 5e6);
        assertEq(yieldToken.balanceOf(address(reserve)), 0);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_yieldAgreementReserveUsesYieldToken() public {
        uint256 id = _createSingleTenantAgreement(address(yieldToken));

        vm.expectEmit(true, true, true, true);
        emit OperationsReserve.OperationsReservePaid(address(escrow), id, tenant, address(yieldToken), 5e6);
        vm.prank(tenant);
        reserve.payReserve(address(escrow), id);

        assertEq(reserve.paymentToken(address(escrow), id), address(yieldToken));
        assertEq(yieldToken.balanceOf(address(reserve)), 5e6);
        assertEq(usdc.balanceOf(address(reserve)), 0);
    }

    function test_duplicatePaymentReverts() public {
        uint256 id = _createSingleTenantAgreement(address(usdc));
        vm.startPrank(tenant);
        reserve.payReserve(address(escrow), id);
        vm.expectRevert(OperationsReserve.AlreadyPaid.selector);
        reserve.payReserve(address(escrow), id);
        vm.stopPrank();
    }

    function test_tenantsCanSplitYieldAgreementReserve() public {
        uint256 id = _createTwoTenantAgreement(address(yieldToken));

        vm.prank(tenant);
        reserve.payReserveShare(address(escrow), id, 2_500_000);
        vm.prank(cotenant);
        reserve.payReserveShare(address(escrow), id, 2_500_000);

        assertEq(reserve.paidAmount(address(escrow), id, tenant), 2_500_000);
        assertEq(reserve.paidAmount(address(escrow), id, cotenant), 2_500_000);
        assertEq(reserve.totalPaid(address(escrow), id), 5_000_000);
        assertEq(reserve.paymentToken(address(escrow), id), address(yieldToken));
        assertEq(yieldToken.balanceOf(address(reserve)), 5_000_000);
        assertEq(usdc.balanceOf(address(reserve)), 0);
    }

    function test_splitPaymentMustMatchExactEqualShare() public {
        uint256 id = _createTwoTenantAgreement(address(usdc));

        vm.prank(tenant);
        vm.expectRevert(OperationsReserve.PaymentMismatch.selector);
        reserve.payReserveShare(address(escrow), id, 4_000_000);
    }

    function test_nonTenantCannotPrepayAndBlockAgreementReserve() public {
        uint256 id = _createSingleTenantAgreement(address(usdc));
        address stranger = makeAddr("stranger");
        usdc.mint(stranger, 20e6);
        vm.prank(stranger);
        usdc.approve(address(reserve), type(uint256).max);

        vm.prank(stranger);
        vm.expectRevert(OperationsReserve.PaymentMismatch.selector);
        reserve.payReserveShare(address(escrow), id, 5_000_000);
    }

    function test_reserveRejectsAnotherEscrow() public {
        OpenEscrow anotherEscrow = new OpenEscrow(address(usdc), address(yieldToken));

        vm.prank(tenant);
        vm.expectRevert(OperationsReserve.UnsupportedEscrow.selector);
        reserve.payReserve(address(anotherEscrow), 0);
    }

    function test_constructorRejectsTokenConfigurationMismatch() public {
        MockUSDC otherToken = new MockUSDC();

        vm.expectRevert(OperationsReserve.TokenConfigurationMismatch.selector);
        new OperationsReserve(address(escrow), address(otherToken), address(yieldToken));
    }

    function test_onlyTreasuryCanWithdrawPlainAndYieldReserves() public {
        uint256 plainId = _createSingleTenantAgreement(address(usdc));
        uint256 yieldId = _createSingleTenantAgreement(address(yieldToken));
        vm.prank(tenant);
        reserve.payReserve(address(escrow), plainId);
        vm.prank(tenant);
        reserve.payReserve(address(escrow), yieldId);

        vm.prank(tenant);
        vm.expectRevert(OperationsReserve.NotTreasury.selector);
        reserve.withdrawReserve(recipient, 5e6);

        reserve.withdrawReserve(recipient, 5e6);
        reserve.withdrawReserveToken(address(yieldToken), recipient, 5e6);
        assertEq(usdc.balanceOf(recipient), 5e6);
        assertEq(yieldToken.balanceOf(recipient), 5e6);
    }
}
