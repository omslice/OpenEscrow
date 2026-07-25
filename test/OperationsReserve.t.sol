// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {OperationsReserve} from "../contracts/OperationsReserve.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract MockTenantRegistry {
    mapping(uint256 => address[]) internal participants;

    function setTenants(uint256 agreementId, address[] memory tenants) external {
        participants[agreementId] = tenants;
    }

    function getTenantParticipants(uint256 agreementId)
        external
        view
        returns (
            address[] memory tenants,
            uint16[] memory sharesBps,
            uint256[] memory contributions,
            uint256[] memory withdrawable
        )
    {
        tenants = participants[agreementId];
        sharesBps = new uint16[](tenants.length);
        contributions = new uint256[](tenants.length);
        withdrawable = new uint256[](tenants.length);
    }
}

contract OperationsReserveTest is Test {
    MockUSDC internal usdc;
    OperationsReserve internal reserve;
    MockTenantRegistry internal registry;

    address internal tenant = makeAddr("tenant");
    address internal escrow;
    address internal recipient = makeAddr("recipient");

    function setUp() public {
        usdc = new MockUSDC();
        reserve = new OperationsReserve(address(usdc));
        registry = new MockTenantRegistry();
        escrow = address(registry);
        address[] memory singleTenant = new address[](1);
        singleTenant[0] = tenant;
        registry.setTenants(7, singleTenant);
        usdc.mint(tenant, 20e6);
        vm.prank(tenant);
        usdc.approve(address(reserve), type(uint256).max);
    }

    function test_reserveIsSeparateAndRecordedPerAgreement() public {
        vm.expectEmit(true, true, true, true);
        emit OperationsReserve.OperationsReservePaid(escrow, 7, tenant, 5e6);

        vm.prank(tenant);
        reserve.payReserve(escrow, 7);

        assertTrue(reserve.paid(escrow, 7, tenant));
        assertEq(usdc.balanceOf(address(reserve)), 5e6);
        assertEq(usdc.balanceOf(escrow), 0);
    }

    function test_duplicatePaymentReverts() public {
        vm.startPrank(tenant);
        reserve.payReserve(escrow, 7);
        vm.expectRevert(OperationsReserve.AlreadyPaid.selector);
        reserve.payReserve(escrow, 7);
        vm.stopPrank();
    }

    function test_tenantsCanSplitOneAgreementReserve() public {
        address cotenant = makeAddr("cotenant");
        usdc.mint(cotenant, 20e6);
        vm.prank(cotenant);
        usdc.approve(address(reserve), type(uint256).max);
        address[] memory tenants = new address[](2);
        tenants[0] = tenant;
        tenants[1] = cotenant;
        registry.setTenants(8, tenants);

        vm.prank(tenant);
        reserve.payReserveShare(escrow, 8, 2_500_000);
        vm.prank(cotenant);
        reserve.payReserveShare(escrow, 8, 2_500_000);

        assertEq(reserve.paidAmount(escrow, 8, tenant), 2_500_000);
        assertEq(reserve.paidAmount(escrow, 8, cotenant), 2_500_000);
        assertEq(reserve.totalPaid(escrow, 8), 5_000_000);
        assertEq(usdc.balanceOf(address(reserve)), 5_000_000);
    }

    function test_splitPaymentMustMatchExactEqualShare() public {
        address cotenant = makeAddr("cotenant");
        usdc.mint(cotenant, 20e6);
        vm.prank(cotenant);
        usdc.approve(address(reserve), type(uint256).max);
        address[] memory tenants = new address[](2);
        tenants[0] = tenant;
        tenants[1] = cotenant;
        registry.setTenants(9, tenants);

        vm.prank(tenant);
        vm.expectRevert(OperationsReserve.PaymentMismatch.selector);
        reserve.payReserveShare(escrow, 9, 4_000_000);
    }

    function test_nonTenantCannotPrepayAndBlockAgreementReserve() public {
        address stranger = makeAddr("stranger");
        usdc.mint(stranger, 20e6);
        vm.prank(stranger);
        usdc.approve(address(reserve), type(uint256).max);

        vm.prank(stranger);
        vm.expectRevert(OperationsReserve.PaymentMismatch.selector);
        reserve.payReserveShare(escrow, 7, 5_000_000);
    }

    function test_onlyTreasuryCanWithdraw() public {
        vm.prank(tenant);
        reserve.payReserve(escrow, 7);

        vm.prank(tenant);
        vm.expectRevert(OperationsReserve.NotTreasury.selector);
        reserve.withdrawReserve(recipient, 5e6);

        reserve.withdrawReserve(recipient, 5e6);
        assertEq(usdc.balanceOf(recipient), 5e6);
    }
}
