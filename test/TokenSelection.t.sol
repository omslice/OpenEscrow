// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "./Base.t.sol";
import {OpenEscrow} from "../contracts/OpenEscrow.sol";
import {MockYieldUSDC} from "../contracts/MockYieldUSDC.sol";

contract TokenSelectionTest is Base {
    function test_agreementCanSelectYieldTokenAndPreservesShares() public {
        MockYieldUSDC yieldToken = new MockYieldUSDC();
        OpenEscrow selectedEscrow = new OpenEscrow(address(usdc), address(yieldToken), address(0));
        uint256 selectedId = selectedEscrow.createAgreementWithToken(
            tenant,
            address(0),
            address(yieldToken),
            DEPOSIT,
            uint64(block.timestamp),
            CLAIM_PERIOD,
            RESPONSE_PERIOD,
            ARBITER_PERIOD
        );

        yieldToken.mint(tenant, DEPOSIT);
        vm.startPrank(tenant);
        yieldToken.approve(address(selectedEscrow), DEPOSIT);
        selectedEscrow.tenantAcceptAndFund(selectedId);
        vm.stopPrank();

        OpenEscrow.Agreement memory a = selectedEscrow.getAgreement(selectedId);
        assertEq(a.token, address(yieldToken));
        assertEq(a.depositAmount, DEPOSIT);
        assertEq(yieldToken.balanceOf(address(selectedEscrow)), DEPOSIT);

        vm.warp(block.timestamp + 1 days);
        assertEq(yieldToken.convertToAssets(a.depositAmount), DEPOSIT * 120 / 100);
        assertEq(yieldToken.balanceOf(address(selectedEscrow)), DEPOSIT, "escrow share balance must stay fixed");
    }

    function test_customTokenPathRejectsZeroToken() public {
        vm.expectRevert(OpenEscrow.ZeroAddress.selector);
        escrow.createAgreementWithToken(
            tenant,
            address(0),
            address(0),
            DEPOSIT,
            uint64(block.timestamp),
            CLAIM_PERIOD,
            RESPONSE_PERIOD,
            ARBITER_PERIOD
        );
    }

    function test_customTokenPathRejectsUnapprovedToken() public {
        MockYieldUSDC otherToken = new MockYieldUSDC();
        vm.expectRevert(OpenEscrow.UnsupportedToken.selector);
        escrow.createAgreementWithToken(
            tenant,
            address(0),
            address(otherToken),
            DEPOSIT,
            uint64(block.timestamp),
            CLAIM_PERIOD,
            RESPONSE_PERIOD,
            ARBITER_PERIOD
        );
    }
}
