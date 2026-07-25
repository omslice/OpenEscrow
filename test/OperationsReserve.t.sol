// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {OperationsReserve} from "../contracts/OperationsReserve.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract OperationsReserveTest is Test {
    MockUSDC internal usdc;
    OperationsReserve internal reserve;

    address internal tenant = makeAddr("tenant");
    address internal escrow = makeAddr("escrow");
    address internal recipient = makeAddr("recipient");

    function setUp() public {
        usdc = new MockUSDC();
        reserve = new OperationsReserve(address(usdc));
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
