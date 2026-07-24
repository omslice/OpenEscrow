// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "./Base.t.sol";
import {OpenEscrow} from "../contracts/OpenEscrow.sol";

/// @notice Requirement #5: full and partial tenant acceptance.
/// @notice Requirement #6: full and partial tenant dispute.
/// @notice Requirement #7: non-response becomes a dispute, never landlord approval.
contract ResponseTest is Base {
    function test_respondToClaim_fullAcceptance_settlesImmediately() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);

        vm.prank(tenant);
        escrow.respondToClaim(id, DEPOSIT / 2);

        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(uint8(a.phase), uint8(OpenEscrow.Phase.Closed));
        assertEq(uint8(a.closeReason), uint8(OpenEscrow.CloseReason.Settled));
        assertEq(a.landlordWithdrawable, DEPOSIT / 2);
        assertEq(a.tenantWithdrawable, DEPOSIT / 2); // unclaimed portion released at submission
        assertEq(a.locked, 0);
        _assertConserved(id);
    }

    function test_respondToClaim_fullDispute_locksEverythingClaimed() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);

        vm.prank(tenant);
        escrow.respondToClaim(id, 0);

        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(uint8(a.phase), uint8(OpenEscrow.Phase.Disputed));
        assertEq(a.landlordWithdrawable, 0);
        assertEq(a.locked, DEPOSIT / 2);
        assertEq(a.arbiterRulingDeadline, uint64(block.timestamp) + ARBITER_PERIOD);
        _assertConserved(id);
    }

    function test_respondToClaim_partialAcceptance_splitsBetweenLandlordAndDispute() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2); // claimed = 500
        uint256 accepted = DEPOSIT / 5; // 200 accepted, 300 disputed

        vm.prank(tenant);
        escrow.respondToClaim(id, accepted);

        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(uint8(a.phase), uint8(OpenEscrow.Phase.Disputed));
        assertEq(a.landlordWithdrawable, accepted);
        assertEq(a.locked, DEPOSIT / 2 - accepted);
        assertEq(a.tenantWithdrawable, DEPOSIT / 2); // unclaimed half, from submission
        _assertConserved(id);
    }

    function test_respondToClaim_revertsIfExceedsClaimedAmount() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        vm.prank(tenant);
        vm.expectRevert(OpenEscrow.InvalidResponseAmount.selector);
        escrow.respondToClaim(id, DEPOSIT / 2 + 1);
    }

    function test_respondToClaim_revertsIfNotTenant() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.respondToClaim(id, 0);
    }

    function test_respondToClaim_revertsAtExactDeadline() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        vm.warp(_responseDeadline(id));
        vm.prank(tenant);
        vm.expectRevert(OpenEscrow.ResponseWindowClosed.selector);
        escrow.respondToClaim(id, 0);
    }

    function test_respondToClaim_succeedsOneSecondBeforeDeadline() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        vm.warp(_responseDeadline(id) - 1);
        vm.prank(tenant);
        escrow.respondToClaim(id, 0);
        assertEq(uint8(_phase(id)), uint8(OpenEscrow.Phase.Disputed));
    }

    function test_respondToClaim_revertsOnDoubleResponse() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        vm.prank(tenant);
        escrow.respondToClaim(id, 0);
        vm.prank(tenant);
        vm.expectRevert(OpenEscrow.InvalidPhase.selector);
        escrow.respondToClaim(id, 0);
    }

    // ---- non-response never auto-approves the landlord --------------------

    function test_finalizeNoResponse_revertsBeforeDeadline() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        vm.expectRevert(OpenEscrow.ResponseWindowStillOpen.selector);
        escrow.finalizeNoResponse(id);
    }

    function test_finalizeNoResponse_atExactDeadline_becomesFullDispute_notApproval() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        vm.warp(_responseDeadline(id));

        vm.prank(stranger); // permissionless
        escrow.finalizeNoResponse(id);

        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(uint8(a.phase), uint8(OpenEscrow.Phase.Disputed), "must require arbiter review, not auto-settle");
        assertEq(a.landlordWithdrawable, 0, "landlord must never be auto-paid on tenant silence");
        assertEq(a.locked, DEPOSIT / 2);
        _assertConserved(id);
    }

    function test_finalizeNoResponse_revertsIfTenantAlreadyResponded() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        vm.prank(tenant);
        escrow.respondToClaim(id, DEPOSIT / 2); // fully accepts, closes
        vm.warp(_responseDeadline(id));
        vm.expectRevert(OpenEscrow.InvalidPhase.selector);
        escrow.finalizeNoResponse(id);
    }

    function test_finalizeNoResponse_revertsOnDoubleCall() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        vm.warp(_responseDeadline(id));
        escrow.finalizeNoResponse(id);
        vm.expectRevert(OpenEscrow.InvalidPhase.selector);
        escrow.finalizeNoResponse(id);
    }
}
