// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "./Base.t.sol";
import {OpenEscrow} from "../contracts/OpenEscrow.sol";

/// @notice Requirement #3: full tenant refund when no claim is submitted.
/// @notice Requirement #4: partial claim, immediate release of unclaimed balance.
/// @notice Requirement #8/#9: one valid downward amendment; rejection of upward, late,
///         second, and deadline-extending amendments.
contract ClaimsTest is Base {
    // ---- no claim -> full refund ----------------------------------------

    function test_withdrawNoClaim_revertsBeforeDeadline() public {
        uint256 id = _readyAgreement();
        vm.prank(tenant);
        vm.expectRevert(OpenEscrow.ClaimWindowStillOpen.selector);
        escrow.withdrawNoClaim(id);
    }

    function test_withdrawNoClaim_succeedsAtExactDeadline() public {
        uint256 id = _readyAgreement();
        vm.warp(_claimSubmissionDeadline(id)); // == boundary, should succeed (half-open [start,deadline))
        vm.prank(tenant);
        escrow.withdrawNoClaim(id);

        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(uint8(a.phase), uint8(OpenEscrow.Phase.Closed));
        assertEq(uint8(a.closeReason), uint8(OpenEscrow.CloseReason.NoClaim));
        assertEq(a.tenantWithdrawable, DEPOSIT);
        assertEq(a.locked, 0);
        _assertConserved(id);
    }

    function test_withdrawNoClaim_revertsIfNotTenant() public {
        uint256 id = _readyAgreement();
        vm.warp(_claimSubmissionDeadline(id));
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.withdrawNoClaim(id);
    }

    function test_withdrawNoClaim_revertsIfClaimExists() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        vm.warp(_claimSubmissionDeadline(id) + 1);
        vm.prank(tenant);
        vm.expectRevert(OpenEscrow.InvalidPhase.selector);
        escrow.withdrawNoClaim(id);
    }

    function test_withdrawNoClaim_revertsOnDoubleCall() public {
        uint256 id = _readyAgreement();
        vm.warp(_claimSubmissionDeadline(id));
        vm.prank(tenant);
        escrow.withdrawNoClaim(id);
        vm.prank(tenant);
        vm.expectRevert(OpenEscrow.InvalidPhase.selector);
        escrow.withdrawNoClaim(id);
    }

    // ---- submitClaim: full / partial / absent / late --------------------

    function test_submitClaim_partial_releasesUnclaimedImmediately() public {
        uint256 id = _readyAgreement();
        uint256 claimAmt = DEPOSIT / 4;
        _submitClaim(id, claimAmt);

        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(uint8(a.phase), uint8(OpenEscrow.Phase.ClaimOpen));
        assertEq(a.claimedAmount, claimAmt);
        assertEq(a.tenantWithdrawable, DEPOSIT - claimAmt);
        assertEq(a.locked, claimAmt);
        _assertConserved(id);
    }

    function test_submitClaim_full() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT);
        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(a.tenantWithdrawable, 0);
        assertEq(a.locked, DEPOSIT);
        _assertConserved(id);
    }

    function test_submitClaim_revertsIfZeroAmount() public {
        uint256 id = _readyAgreement();
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.InvalidClaimAmount.selector);
        escrow.submitClaim(id, 0, HASH1, URI, EV_CLAIM);
    }

    function test_submitClaim_revertsIfExceedsDeposit() public {
        uint256 id = _readyAgreement();
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.InvalidClaimAmount.selector);
        escrow.submitClaim(id, DEPOSIT + 1, HASH1, URI, EV_CLAIM);
    }

    function test_submitClaim_revertsIfNotLandlord() public {
        uint256 id = _readyAgreement();
        vm.prank(tenant);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.submitClaim(id, DEPOSIT / 2, HASH1, URI, EV_CLAIM);
    }

    function test_submitClaim_revertsBeforeClaimWindowStart() public {
        uint256 id = _proposeWithStart(uint64(block.timestamp) + 10 days);
        _acceptArbiter(id);
        _fund(id);
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.ClaimWindowNotOpen.selector);
        escrow.submitClaim(id, DEPOSIT / 2, HASH1, URI, EV_CLAIM);
    }

    function test_submitClaim_succeedsAtExactWindowStart() public {
        uint64 start = uint64(block.timestamp) + 10 days;
        uint256 id = _proposeWithStart(start);
        _acceptArbiter(id);
        _fund(id);
        vm.warp(start);
        vm.prank(landlord);
        escrow.submitClaim(id, DEPOSIT / 2, HASH1, URI, EV_CLAIM);
        assertEq(uint8(_phase(id)), uint8(OpenEscrow.Phase.ClaimOpen));
    }

    function test_submitClaim_revertsAtExactSubmissionDeadline_lateClaim() public {
        uint256 id = _readyAgreement();
        vm.warp(_claimSubmissionDeadline(id)); // boundary is "closed" side
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.ClaimWindowClosed.selector);
        escrow.submitClaim(id, DEPOSIT / 2, HASH1, URI, EV_CLAIM);
    }

    function test_submitClaim_succeedsOneSecondBeforeDeadline() public {
        uint256 id = _readyAgreement();
        vm.warp(_claimSubmissionDeadline(id) - 1);
        _submitClaim(id, DEPOSIT / 2);
        assertEq(uint8(_phase(id)), uint8(OpenEscrow.Phase.ClaimOpen));
    }

    function test_submitClaim_revertsOnZeroContentHash() public {
        uint256 id = _readyAgreement();
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.InvalidEvidence.selector);
        escrow.submitClaim(id, DEPOSIT / 2, bytes32(0), URI, EV_CLAIM);
    }

    function test_submitClaim_recordsEvidence() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        OpenEscrow.Evidence[] memory ev = escrow.getEvidence(id);
        assertEq(ev.length, 1);
        assertEq(ev[0].contentHash, HASH1);
        assertEq(ev[0].submittedBy, landlord);
    }

    // ---- amendClaim: at most one, downward only, deadline untouched -----

    function test_amendClaim_validDownwardAmendment() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        uint64 deadlineBefore = _responseDeadline(id);

        vm.prank(landlord);
        escrow.amendClaim(id, DEPOSIT / 4, HASH2, URI, 1);

        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(a.claimedAmount, DEPOSIT / 4);
        assertEq(a.tenantWithdrawable, DEPOSIT - DEPOSIT / 4);
        assertEq(a.locked, DEPOSIT / 4);
        assertTrue(a.claimAmended);
        assertEq(a.responseDeadline, deadlineBefore, "amendment must not touch responseDeadline");
        _assertConserved(id);
    }

    function test_amendClaim_toZero_retractsClaim() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);

        vm.prank(landlord);
        escrow.amendClaim(id, 0, HASH2, URI, 1);

        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(uint8(a.phase), uint8(OpenEscrow.Phase.Closed));
        assertEq(uint8(a.closeReason), uint8(OpenEscrow.CloseReason.ClaimRetracted));
        assertEq(a.tenantWithdrawable, DEPOSIT);
        assertEq(a.locked, 0);
        _assertConserved(id);
    }

    function test_amendClaim_revertsOnUpwardAmendment() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 4);
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.AmendmentMustNotIncrease.selector);
        escrow.amendClaim(id, DEPOSIT / 2, HASH2, URI, 1);
    }

    function test_amendClaim_revertsOnSecondAmendment() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        vm.prank(landlord);
        escrow.amendClaim(id, DEPOSIT / 4, HASH2, URI, 1);

        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.ClaimAlreadyAmended.selector);
        escrow.amendClaim(id, DEPOSIT / 8, HASH2, URI, 1);
    }

    function test_amendClaim_revertsAfterResponseDeadline_lateAmendment() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        vm.warp(_responseDeadline(id)); // boundary is "closed" side
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.ResponseWindowClosed.selector);
        escrow.amendClaim(id, DEPOSIT / 4, HASH2, URI, 1);
    }

    function test_amendClaim_revertsIfNotLandlord() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        vm.prank(tenant);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.amendClaim(id, DEPOSIT / 4, HASH2, URI, 1);
    }

    function test_amendClaim_revertsAfterTenantResponded() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        vm.prank(tenant);
        escrow.respondToClaim(id, DEPOSIT / 4);

        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.InvalidPhase.selector);
        escrow.amendClaim(id, DEPOSIT / 8, HASH2, URI, 1);
    }

    function test_amendClaim_doesNotExtendDeadline_cannotStallTenant() public {
        // Amend right before the original deadline; deadline must not move, so the
        // window that closes shortly after is the *original* one, not a fresh one.
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        uint64 originalDeadline = _responseDeadline(id);

        vm.warp(originalDeadline - 1);
        vm.prank(landlord);
        escrow.amendClaim(id, DEPOSIT / 4, HASH2, URI, 1);
        assertEq(_responseDeadline(id), originalDeadline);

        vm.warp(originalDeadline); // now "closed" per the unchanged original deadline
        vm.prank(tenant);
        vm.expectRevert(OpenEscrow.ResponseWindowClosed.selector);
        escrow.respondToClaim(id, 0);
    }

    // ---- supplementary evidence -------------------------------------------

    function test_submitEvidence_byTenant_whileClaimOpen() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        vm.prank(tenant);
        escrow.submitEvidence(id, HASH2, URI, 2);
        assertEq(escrow.evidenceCount(id), 2);
    }

    function test_submitEvidence_revertsForStranger() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        vm.prank(stranger);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.submitEvidence(id, HASH2, URI, 2);
    }

    function test_submitEvidence_revertsOutsideClaimOrDispute() public {
        uint256 id = _readyAgreement();
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.InvalidPhase.selector);
        escrow.submitEvidence(id, HASH2, URI, 2);
    }
}
