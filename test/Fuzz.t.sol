// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "./Base.t.sol";
import {OpenEscrow} from "../contracts/OpenEscrow.sol";

/// @notice Requirement #17: fuzz tests for all monetary splits, plus the explicit
///         "landlord never receives more than the final claim" and "arbiter never
///         awards more than the disputed amount" invariants under randomized inputs.
contract FuzzTest is Base {
    function testFuzz_submitClaim_accounting(uint256 claimAmt) public {
        claimAmt = bound(claimAmt, 1, DEPOSIT);
        uint256 id = _readyAgreement();
        _submitClaim(id, claimAmt);

        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(a.tenantWithdrawable, DEPOSIT - claimAmt);
        assertEq(a.locked, claimAmt);
        assertEq(a.landlordWithdrawable, 0);
        _assertConserved(id);
    }

    function testFuzz_amendClaim_neverIncreasesAndConserves(uint256 claimAmt, uint256 newAmt) public {
        claimAmt = bound(claimAmt, 1, DEPOSIT);
        uint256 id = _readyAgreement();
        _submitClaim(id, claimAmt);

        if (newAmt > claimAmt) {
            vm.prank(landlord);
            vm.expectRevert(OpenEscrow.AmendmentMustNotIncrease.selector);
            escrow.amendClaim(id, newAmt, HASH2, URI, 1);
            return;
        }

        vm.prank(landlord);
        escrow.amendClaim(id, newAmt, HASH2, URI, 1);

        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(a.claimedAmount, newAmt);
        assertEq(a.tenantWithdrawable, DEPOSIT - newAmt);
        assertEq(a.locked, newAmt);
        assertLe(a.claimedAmount, claimAmt, "amendment must never increase the claim");
        _assertConserved(id);
    }

    function testFuzz_respondToClaim_splitAndBounds(uint256 claimAmt, uint256 acceptedAmt) public {
        claimAmt = bound(claimAmt, 1, DEPOSIT);
        uint256 id = _readyAgreement();
        _submitClaim(id, claimAmt);

        if (acceptedAmt > claimAmt) {
            vm.prank(tenant);
            vm.expectRevert(OpenEscrow.InvalidResponseAmount.selector);
            escrow.respondToClaim(id, acceptedAmt);
            return;
        }

        vm.prank(tenant);
        escrow.respondToClaim(id, acceptedAmt);

        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(a.landlordWithdrawable, acceptedAmt);
        assertLe(a.landlordWithdrawable, claimAmt, "landlord must never receive more than the submitted claim");
        _assertConserved(id);

        if (acceptedAmt == claimAmt) {
            assertEq(uint8(a.phase), uint8(OpenEscrow.Phase.Closed));
            assertEq(a.locked, 0);
        } else {
            assertEq(uint8(a.phase), uint8(OpenEscrow.Phase.Disputed));
            assertEq(a.locked, claimAmt - acceptedAmt);
        }
    }

    function testFuzz_resolveDispute_awardBoundedByDisputedAmount(uint256 claimAmt, uint256 acceptedAmt, uint256 award)
        public
    {
        claimAmt = bound(claimAmt, 1, DEPOSIT);
        acceptedAmt = bound(acceptedAmt, 0, claimAmt - 1); // force a genuine dispute (disputed > 0)
        uint256 disputedAmt = claimAmt - acceptedAmt;

        uint256 id = _readyAgreement();
        _submitClaim(id, claimAmt);
        vm.prank(tenant);
        escrow.respondToClaim(id, acceptedAmt);

        if (award > disputedAmt) {
            vm.prank(arbiter);
            vm.expectRevert(OpenEscrow.InvalidAward.selector);
            escrow.resolveDispute(id, award);
            return;
        }

        vm.prank(arbiter);
        escrow.resolveDispute(id, award);

        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        uint256 landlordTotal = acceptedAmt + award;
        assertEq(a.landlordWithdrawable, landlordTotal);
        assertLe(landlordTotal, claimAmt, "landlord total must never exceed the final submitted claim");
        assertLe(award, disputedAmt, "arbiter must never award more than the disputed amount");
        assertEq(a.locked, 0);
        _assertConserved(id);

        // Aggregate token liabilities must still cover exactly this agreement's state.
        assertEq(usdc.balanceOf(address(escrow)), a.tenantWithdrawable + a.landlordWithdrawable + a.locked);
    }

    function testFuzz_endToEnd_neverCreatesOrDestroysValue(
        uint256 claimAmt,
        uint256 acceptedAmt,
        uint256 award,
        bool timeoutInsteadOfRuling
    ) public {
        claimAmt = bound(claimAmt, 1, DEPOSIT);
        acceptedAmt = bound(acceptedAmt, 0, claimAmt);
        uint256 id = _readyAgreement();
        _submitClaim(id, claimAmt);

        vm.prank(tenant);
        escrow.respondToClaim(id, acceptedAmt);

        if (uint8(_phase(id)) == uint8(OpenEscrow.Phase.Disputed)) {
            uint256 disputedAmt = claimAmt - acceptedAmt;
            if (timeoutInsteadOfRuling) {
                vm.warp(_arbiterRulingDeadline(id));
                escrow.claimArbiterTimeout(id);
            } else {
                award = bound(award, 0, disputedAmt);
                vm.prank(arbiter);
                escrow.resolveDispute(id, award);
            }
        }

        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(uint8(a.phase), uint8(OpenEscrow.Phase.Closed));
        assertEq(a.locked, 0);
        assertEq(a.tenantWithdrawable + a.landlordWithdrawable, DEPOSIT, "no value created or destroyed end-to-end");
        assertLe(a.landlordWithdrawable, claimAmt);
        _assertConserved(id);
    }
}
