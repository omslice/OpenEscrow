// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "./Base.t.sol";
import {OpenEscrow} from "../contracts/OpenEscrow.sol";

/// @notice Requirement #10: arbiter awards of zero, partial, and full disputed amount.
/// @notice Requirement #11: arbiter timeout returns disputed funds to the tenant.
contract ArbiterTest is Base {
    function _disputed(uint256 claimAmt, uint256 acceptedAmt) internal returns (uint256 id) {
        id = _readyAgreement();
        _submitClaim(id, claimAmt);
        vm.prank(tenant);
        escrow.respondToClaim(id, acceptedAmt);
    }

    // ---- resolveDispute: 0 / partial / full award --------------------------

    function test_resolveDispute_awardZero_allDisputedGoesToTenant() public {
        uint256 id = _disputed(DEPOSIT / 2, 0); // disputed = 500

        vm.prank(arbiter);
        escrow.resolveDispute(id, 0);

        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(uint8(a.phase), uint8(OpenEscrow.Phase.Closed));
        assertEq(uint8(a.closeReason), uint8(OpenEscrow.CloseReason.ResolvedByArbiter));
        assertEq(a.landlordWithdrawable, 0);
        assertEq(a.tenantWithdrawable, DEPOSIT); // 500 unclaimed + 500 awarded
        assertEq(a.locked, 0);
        _assertConserved(id);
    }

    function test_resolveDispute_awardFull_allDisputedGoesToLandlord() public {
        uint256 id = _disputed(DEPOSIT / 2, 0);

        vm.prank(arbiter);
        escrow.resolveDispute(id, DEPOSIT / 2);

        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(a.landlordWithdrawable, DEPOSIT / 2);
        assertEq(a.tenantWithdrawable, DEPOSIT / 2);
        assertEq(a.locked, 0);
        _assertConserved(id);
    }

    function test_resolveDispute_awardPartial() public {
        uint256 id = _disputed(DEPOSIT / 2, 0); // disputed = 500
        uint256 award = DEPOSIT / 10; // 100

        vm.prank(arbiter);
        escrow.resolveDispute(id, award);

        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(a.landlordWithdrawable, award);
        assertEq(a.tenantWithdrawable, DEPOSIT / 2 + (DEPOSIT / 2 - award));
        assertEq(a.locked, 0);
        _assertConserved(id);
    }

    function test_resolveDispute_afterPartialAcceptance_boundedByDisputedNotClaimed() public {
        uint256 id = _disputed(DEPOSIT / 2, DEPOSIT / 5); // claimed 500, accepted 200, disputed 300
        vm.prank(arbiter);
        escrow.resolveDispute(id, DEPOSIT / 2 - DEPOSIT / 5); // award full disputed 300
        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        // landlord total = accepted(200) + awarded(300) = 500 == original claim, never more
        assertEq(a.landlordWithdrawable, DEPOSIT / 2);
        _assertConserved(id);
    }

    function test_resolveDispute_revertsIfAwardExceedsDisputed() public {
        uint256 id = _disputed(DEPOSIT / 2, 0);
        vm.prank(arbiter);
        vm.expectRevert(OpenEscrow.InvalidAward.selector);
        escrow.resolveDispute(id, DEPOSIT / 2 + 1);
    }

    function test_resolveDispute_revertsIfNotArbiter() public {
        uint256 id = _disputed(DEPOSIT / 2, 0);
        vm.prank(stranger);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.resolveDispute(id, 0);
    }

    function test_resolveDispute_revertsAtExactRulingDeadline() public {
        uint256 id = _disputed(DEPOSIT / 2, 0);
        vm.warp(_arbiterRulingDeadline(id));
        vm.prank(arbiter);
        vm.expectRevert(OpenEscrow.ArbiterRulingWindowClosed.selector);
        escrow.resolveDispute(id, 0);
    }

    function test_resolveDispute_succeedsOneSecondBeforeDeadline() public {
        uint256 id = _disputed(DEPOSIT / 2, 0);
        vm.warp(_arbiterRulingDeadline(id) - 1);
        vm.prank(arbiter);
        escrow.resolveDispute(id, 0);
        assertEq(uint8(_phase(id)), uint8(OpenEscrow.Phase.Closed));
    }

    function test_resolveDispute_revertsOnDoubleRuling() public {
        uint256 id = _disputed(DEPOSIT / 2, 0);
        vm.prank(arbiter);
        escrow.resolveDispute(id, 0);
        vm.prank(arbiter);
        vm.expectRevert(OpenEscrow.InvalidPhase.selector);
        escrow.resolveDispute(id, 0);
    }

    function test_resolveDispute_revertsIfArbiterResigned() public {
        uint256 id = _disputed(DEPOSIT / 2, 0);
        vm.prank(arbiter);
        escrow.resignAsArbiter(id);
        vm.prank(arbiter);
        vm.expectRevert(OpenEscrow.ArbiterHasResigned.selector);
        escrow.resolveDispute(id, 0);
    }

    // ---- arbiter timeout: disputed funds default to tenant ----------------

    function test_claimArbiterTimeout_revertsBeforeDeadline() public {
        uint256 id = _disputed(DEPOSIT / 2, 0);
        vm.expectRevert(OpenEscrow.ArbiterRulingWindowStillOpen.selector);
        escrow.claimArbiterTimeout(id);
    }

    function test_claimArbiterTimeout_atExactDeadline_sendsDisputedToTenant() public {
        uint256 id = _disputed(DEPOSIT / 2, 0);
        vm.warp(_arbiterRulingDeadline(id));

        vm.prank(stranger); // permissionless
        escrow.claimArbiterTimeout(id);

        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(uint8(a.phase), uint8(OpenEscrow.Phase.Closed));
        assertEq(uint8(a.closeReason), uint8(OpenEscrow.CloseReason.ResolvedByTimeout));
        assertEq(a.landlordWithdrawable, 0);
        assertEq(a.tenantWithdrawable, DEPOSIT);
        assertEq(a.locked, 0);
        _assertConserved(id);
    }

    function test_claimArbiterTimeout_revertsAfterRuling() public {
        uint256 id = _disputed(DEPOSIT / 2, 0);
        vm.prank(arbiter);
        escrow.resolveDispute(id, DEPOSIT / 4);
        vm.warp(_arbiterRulingDeadline(id));
        vm.expectRevert(OpenEscrow.InvalidPhase.selector);
        escrow.claimArbiterTimeout(id);
    }

    function test_claimArbiterTimeout_revertsOnDoubleCall() public {
        uint256 id = _disputed(DEPOSIT / 2, 0);
        vm.warp(_arbiterRulingDeadline(id));
        escrow.claimArbiterTimeout(id);
        vm.expectRevert(OpenEscrow.InvalidPhase.selector);
        escrow.claimArbiterTimeout(id);
    }

    // ---- replacement: mutual consent, never extends a dispute --------------

    function test_replacement_fullFlow_preFundingViaRenominateNotReplacement() public {
        // Pre-funding uses renominateArbiter (landlord-only); replacement flow is
        // reserved for post-funding phases, exercised below.
        uint256 id = _propose();
        vm.prank(tenant);
        vm.expectRevert(OpenEscrow.InvalidPhase.selector);
        escrow.proposeArbiterReplacement(id, newArbiter);
    }

    function test_replacement_fullFlow_postFunding() public {
        uint256 id = _readyAgreement();

        vm.prank(landlord);
        escrow.proposeArbiterReplacement(id, newArbiter);

        vm.prank(tenant); // the other party confirms
        escrow.confirmArbiterReplacement(id);

        vm.prank(newArbiter);
        escrow.acceptArbiterRole(id);

        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(a.arbiter, newArbiter);
        assertTrue(a.arbiterAccepted);
        assertFalse(a.arbiterResigned);
    }

    function test_replacement_oldArbiterStillValidDuringPendingReplacement() public {
        uint256 id = _readyAgreement();
        vm.prank(landlord);
        escrow.proposeArbiterReplacement(id, newArbiter);
        // not yet confirmed/accepted - old arbiter can still submit a claim-independent
        // action; more directly, old arbiter can still resign/act since it remains
        // `arbiter` until the swap actually happens.
        assertEq(escrow.getAgreement(id).arbiter, arbiter);
    }

    function test_replacement_confirmRevertsForProposer() public {
        uint256 id = _readyAgreement();
        vm.prank(landlord);
        escrow.proposeArbiterReplacement(id, newArbiter);
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.CannotConfirmOwnProposal.selector);
        escrow.confirmArbiterReplacement(id);
    }

    function test_replacement_confirmRevertsForStranger() public {
        uint256 id = _readyAgreement();
        vm.prank(landlord);
        escrow.proposeArbiterReplacement(id, newArbiter);
        vm.prank(stranger);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.confirmArbiterReplacement(id);
    }

    function test_replacement_doubleConfirmReverts() public {
        uint256 id = _readyAgreement();
        vm.prank(landlord);
        escrow.proposeArbiterReplacement(id, newArbiter);
        vm.prank(tenant);
        escrow.confirmArbiterReplacement(id);
        vm.prank(tenant);
        vm.expectRevert(OpenEscrow.ReplacementAlreadyConfirmed.selector);
        escrow.confirmArbiterReplacement(id);
    }

    function test_replacement_newArbiterCannotAcceptWithoutBothConfirmations() public {
        uint256 id = _readyAgreement();
        vm.prank(landlord);
        escrow.proposeArbiterReplacement(id, newArbiter);
        // tenant never confirms
        vm.prank(newArbiter);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.acceptArbiterRole(id);
    }

    function test_replacement_cancelByProposer() public {
        uint256 id = _readyAgreement();
        vm.prank(landlord);
        escrow.proposeArbiterReplacement(id, newArbiter);
        vm.prank(landlord);
        escrow.cancelArbiterReplacementProposal(id);

        vm.prank(tenant);
        vm.expectRevert(OpenEscrow.NoReplacementPending.selector);
        escrow.confirmArbiterReplacement(id);
    }

    function test_replacement_cancelRevertsForNonProposer() public {
        uint256 id = _readyAgreement();
        vm.prank(landlord);
        escrow.proposeArbiterReplacement(id, newArbiter);
        vm.prank(tenant);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.cancelArbiterReplacementProposal(id);
    }

    /// @notice Core guarantee: replacement mid-dispute never extends how long funds
    ///         stay locked, even though both parties agree to it.
    function test_replacement_duringDispute_neverExtendsRulingDeadline() public {
        uint256 id = _disputed(DEPOSIT / 2, 0);
        uint64 originalDeadline = _arbiterRulingDeadline(id);

        vm.warp(originalDeadline - 1 hours);
        vm.prank(landlord);
        escrow.proposeArbiterReplacement(id, newArbiter);
        vm.prank(tenant);
        escrow.confirmArbiterReplacement(id);
        vm.prank(newArbiter);
        escrow.acceptArbiterRole(id);

        assertEq(_arbiterRulingDeadline(id), originalDeadline, "replacement must not move the ruling deadline");

        // old arbiter is no longer authorized
        vm.prank(arbiter);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.resolveDispute(id, 0);

        // new arbiter still bound by the original, unmoved deadline
        vm.warp(originalDeadline);
        vm.prank(newArbiter);
        vm.expectRevert(OpenEscrow.ArbiterRulingWindowClosed.selector);
        escrow.resolveDispute(id, 0);
    }

    function test_replacement_revertsForRoleConflict() public {
        uint256 id = _readyAgreement();
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.InvalidRoleAssignment.selector);
        escrow.proposeArbiterReplacement(id, tenant);
    }

    // ---- resignation ---------------------------------------------------

    function test_resignAsArbiter_blocksRulingUntilReplaced() public {
        uint256 id = _readyAgreement();
        vm.prank(arbiter);
        escrow.resignAsArbiter(id);
        assertTrue(escrow.getAgreement(id).arbiterResigned);

        _submitClaim(id, DEPOSIT / 2);
        vm.prank(tenant);
        escrow.respondToClaim(id, 0);

        vm.prank(arbiter);
        vm.expectRevert(OpenEscrow.ArbiterHasResigned.selector);
        escrow.resolveDispute(id, 0);
    }

    function test_resignAsArbiter_timeoutStillWorksAfterResignation() public {
        uint256 id = _disputed(DEPOSIT / 2, 0);
        vm.prank(arbiter);
        escrow.resignAsArbiter(id);

        vm.warp(_arbiterRulingDeadline(id));
        escrow.claimArbiterTimeout(id);
        assertEq(escrow.getAgreement(id).tenantWithdrawable, DEPOSIT);
    }

    function test_resignAsArbiter_revertsIfNotArbiter() public {
        uint256 id = _readyAgreement();
        vm.prank(stranger);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.resignAsArbiter(id);
    }

    // ---- regression: replacement steps must re-validate phase, not just at propose time ----
    // A prior version only checked _requireReplaceablePhase in proposeArbiterReplacement.
    // Since replacement is a multi-step process (propose -> confirm -> accept), the phase
    // could legitimately change in between, and confirm/accept had no guard of their own.

    /// @notice If the underlying dispute resolves before the confirmed replacement is
    ///         accepted, the acceptance must not be allowed to mutate a Closed agreement.
    function test_replacement_acceptRevertsIfAgreementClosedBeforeAcceptance() public {
        uint256 id = _disputed(DEPOSIT / 2, 0);

        vm.prank(landlord);
        escrow.proposeArbiterReplacement(id, newArbiter);
        vm.prank(tenant);
        escrow.confirmArbiterReplacement(id);

        // The dispute resolves (by the *old* arbiter) before newArbiter ever accepts.
        vm.prank(arbiter);
        escrow.resolveDispute(id, 0);
        assertEq(uint8(_phase(id)), uint8(OpenEscrow.Phase.Closed));

        address arbiterBefore = escrow.getAgreement(id).arbiter;
        vm.prank(newArbiter);
        vm.expectRevert(OpenEscrow.InvalidPhase.selector);
        escrow.acceptArbiterRole(id);

        // Confirms the agreement's arbiter is frozen once Closed - no stale acceptance
        // can mutate it or re-emit ArbiterReplaced after the fact.
        assertEq(escrow.getAgreement(id).arbiter, arbiterBefore);
    }

    /// @notice Same root cause, confirm-side: confirming after closure must also revert.
    function test_replacement_confirmRevertsIfAgreementClosedBeforeConfirmation() public {
        uint256 id = _disputed(DEPOSIT / 2, 0);

        vm.prank(landlord);
        escrow.proposeArbiterReplacement(id, newArbiter);

        vm.prank(arbiter);
        escrow.resolveDispute(id, 0);
        assertEq(uint8(_phase(id)), uint8(OpenEscrow.Phase.Closed));

        vm.prank(tenant);
        vm.expectRevert(OpenEscrow.InvalidPhase.selector);
        escrow.confirmArbiterReplacement(id);
    }

    /// @notice A confirmed-but-not-yet-accepted replacement must not let the candidate
    ///         hijack the arbiter slot after the landlord has since renominated someone
    ///         else - renominateArbiter must invalidate the stale pending proposal.
    function test_renominateArbiter_invalidatesStaleConfirmedReplacement() public {
        uint256 id = _propose();
        _acceptArbiter(id);

        vm.prank(landlord);
        escrow.proposeArbiterReplacement(id, newArbiter);
        vm.prank(tenant);
        escrow.confirmArbiterReplacement(id);
        assertTrue(escrow.getAgreement(id).pendingArbiterConfirmed);

        address freshArbiter = makeAddr("freshArbiter");
        vm.prank(landlord);
        escrow.renominateArbiter(id, freshArbiter);

        // The stale confirmed candidate can no longer accept and hijack the slot.
        vm.prank(newArbiter);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.acceptArbiterRole(id);

        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(a.arbiter, freshArbiter);
        assertFalse(a.arbiterAccepted);
        assertEq(a.pendingArbiter, address(0));
        assertEq(uint8(a.phase), uint8(OpenEscrow.Phase.Proposed));

        // The agreement is still perfectly usable - the intended arbiter can accept normally.
        vm.prank(freshArbiter);
        escrow.acceptArbiterRole(id);
        assertEq(uint8(_phase(id)), uint8(OpenEscrow.Phase.ReadyToFund));
    }
}
