// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "./Base.t.sol";
import {OpenEscrow} from "../contracts/OpenEscrow.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ReentrantToken} from "./mocks/ReentrantToken.sol";

/// @notice Withdrawal correctness (pull-based, credited-balance bounded, no repeats)
///         and requirement #15 (reentrancy attempts during funding and withdrawal).
contract WithdrawTest is Base {
    function test_withdraw_tenant_pullsCreditedBalance() public {
        uint256 id = _readyAgreement();
        vm.warp(_claimSubmissionDeadline(id));
        vm.prank(tenant);
        escrow.withdrawNoClaim(id);

        uint256 balBefore = usdc.balanceOf(tenant);
        vm.prank(tenant);
        escrow.withdraw(id);

        assertEq(usdc.balanceOf(tenant), balBefore + DEPOSIT);
        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(a.tenantWithdrawable, 0);
        assertEq(a.withdrawn, DEPOSIT);
        _assertConserved(id);
    }

    function test_withdraw_landlord_pullsCreditedBalance() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        vm.prank(tenant);
        escrow.respondToClaim(id, DEPOSIT / 2); // full acceptance

        uint256 balBefore = usdc.balanceOf(landlord);
        vm.prank(landlord);
        escrow.withdraw(id);

        assertEq(usdc.balanceOf(landlord), balBefore + DEPOSIT / 2);
        assertEq(escrow.getAgreement(id).landlordWithdrawable, 0);
        _assertConserved(id);
    }

    function test_withdraw_partial_doesNotDisturbOtherPartysBalance() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2); // tenant already has DEPOSIT/2 withdrawable

        vm.prank(tenant);
        escrow.withdraw(id); // withdraw the unclaimed remainder mid-dispute-window

        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(a.tenantWithdrawable, 0);
        assertEq(a.withdrawn, DEPOSIT / 2);
        assertEq(a.locked, DEPOSIT / 2, "claimed portion must be untouched by tenant's partial withdrawal");
        _assertConserved(id);
    }

    function test_withdraw_revertsWithNothingCredited() public {
        uint256 id = _readyAgreement();
        vm.prank(tenant);
        vm.expectRevert(OpenEscrow.NothingToWithdraw.selector);
        escrow.withdraw(id);
    }

    function test_withdraw_revertsOnDoubleWithdrawal() public {
        uint256 id = _readyAgreement();
        vm.warp(_claimSubmissionDeadline(id));
        vm.prank(tenant);
        escrow.withdrawNoClaim(id);
        vm.prank(tenant);
        escrow.withdraw(id);
        vm.prank(tenant);
        vm.expectRevert(OpenEscrow.NothingToWithdraw.selector);
        escrow.withdraw(id);
    }

    function test_withdraw_revertsForStranger() public {
        uint256 id = _readyAgreement();
        vm.warp(_claimSubmissionDeadline(id));
        vm.prank(tenant);
        escrow.withdrawNoClaim(id);
        vm.prank(stranger);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.withdraw(id);
    }

    function test_withdraw_cannotExceedCreditedBalance_arbiterAwardBounded() public {
        // landlord's credited balance can never exceed what was actually awarded/accepted,
        // regardless of how many times they try to withdraw.
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        vm.prank(tenant);
        escrow.respondToClaim(id, DEPOSIT / 4); // accept 250, dispute 250
        vm.prank(arbiter);
        escrow.resolveDispute(id, DEPOSIT / 8); // award 125 more

        uint256 expectedLandlord = DEPOSIT / 4 + DEPOSIT / 8;
        vm.prank(landlord);
        escrow.withdraw(id);
        assertEq(usdc.balanceOf(landlord), expectedLandlord);

        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.NothingToWithdraw.selector);
        escrow.withdraw(id);
    }

    // ---- reentrancy ---------------------------------------------------

    function test_reentrancy_duringFunding_isBlocked() public {
        ReentrantToken rtoken = new ReentrantToken();
        OpenEscrow rescrow = new OpenEscrow(address(rtoken), address(rtoken), address(0));

        rtoken.mint(address(rtoken), DEPOSIT * 2);
        rtoken.selfApprove(address(rescrow), type(uint256).max);

        vm.prank(landlord);
        uint256 id = rescrow.createAgreement(
            address(rtoken), arbiter, DEPOSIT, uint64(block.timestamp), CLAIM_PERIOD, RESPONSE_PERIOD, ARBITER_PERIOD
        );
        vm.prank(arbiter);
        rescrow.acceptArbiterRole(id);

        rtoken.arm(address(rescrow), abi.encodeWithSelector(OpenEscrow.tenantAcceptAndFund.selector, id));

        vm.prank(address(rtoken));
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        rescrow.tenantAcceptAndFund(id);

        // whole outer transaction reverted: agreement never actually got funded
        assertEq(uint8(rescrow.getAgreement(id).phase), uint8(OpenEscrow.Phase.ReadyToFund));
        assertEq(rtoken.balanceOf(address(rescrow)), 0);
    }

    function test_reentrancy_duringWithdraw_isBlocked() public {
        ReentrantToken rtoken = new ReentrantToken();
        OpenEscrow rescrow = new OpenEscrow(address(rtoken), address(rtoken), address(0));

        rtoken.mint(address(rtoken), DEPOSIT * 2);
        rtoken.selfApprove(address(rescrow), type(uint256).max);

        vm.prank(landlord);
        uint256 id = rescrow.createAgreement(
            address(rtoken), arbiter, DEPOSIT, uint64(block.timestamp), CLAIM_PERIOD, RESPONSE_PERIOD, ARBITER_PERIOD
        );
        vm.prank(arbiter);
        rescrow.acceptArbiterRole(id);
        vm.prank(address(rtoken));
        rescrow.tenantAcceptAndFund(id); // unarmed, legitimate funding

        vm.warp(uint64(block.timestamp) + CLAIM_PERIOD);
        vm.prank(address(rtoken));
        rescrow.withdrawNoClaim(id);

        rtoken.arm(address(rescrow), abi.encodeWithSelector(OpenEscrow.withdraw.selector, id));

        vm.prank(address(rtoken));
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        rescrow.withdraw(id);

        // whole outer transaction reverted: credited balance is untouched, nothing paid out
        assertEq(rescrow.getAgreement(id).tenantWithdrawable, DEPOSIT);
        assertEq(rescrow.getAgreement(id).withdrawn, 0);
        assertEq(rtoken.balanceOf(address(rescrow)), DEPOSIT);
    }
}
