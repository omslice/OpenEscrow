// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "./Base.t.sol";
import {OpenEscrow} from "../contracts/OpenEscrow.sol";

/// @notice Requirement #12: unauthorized callers for every protected transition, swept
///         systematically in one place (some are also exercised incidentally alongside
///         their happy path in the other test files - this file is the canonical sweep).
contract AuthTest is Base {
    function test_auth_declineArbiterRole_onlyNominatedArbiter() public {
        uint256 id = _propose();
        vm.prank(stranger);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.declineArbiterRole(id);
    }

    function test_auth_renominateArbiter_onlyLandlord() public {
        uint256 id = _propose();
        vm.prank(tenant);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.renominateArbiter(id, newArbiter);
    }

    function test_auth_cancelProposal_onlyLandlord() public {
        uint256 id = _propose();
        vm.prank(tenant);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.cancelProposal(id);
    }

    function test_auth_acceptArbiterRole_onlyNominatedArbiter() public {
        uint256 id = _propose();
        vm.prank(stranger);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.acceptArbiterRole(id);
    }

    function test_auth_tenantAcceptAndFund_onlyTenant() public {
        uint256 id = _propose();
        _acceptArbiter(id);
        vm.prank(stranger);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.tenantAcceptAndFund(id);
    }

    function test_auth_tenantAcceptAndFund_landlordCannotFundOwnAgreement() public {
        uint256 id = _propose();
        _acceptArbiter(id);
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.tenantAcceptAndFund(id);
    }

    function test_auth_submitClaim_onlyLandlord() public {
        uint256 id = _readyAgreement();
        vm.prank(arbiter);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.submitClaim(id, DEPOSIT / 2, HASH1, URI, EV_CLAIM);
    }

    function test_auth_amendClaim_onlyLandlord() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        vm.prank(arbiter);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.amendClaim(id, DEPOSIT / 4, HASH2, URI, 1);
    }

    function test_auth_submitEvidence_onlyPartiesNotArbiter() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        vm.prank(arbiter);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.submitEvidence(id, HASH2, URI, 2);
    }

    function test_auth_respondToClaim_onlyTenant() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        vm.prank(arbiter);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.respondToClaim(id, 0);
    }

    function test_auth_withdrawNoClaim_onlyTenant() public {
        uint256 id = _readyAgreement();
        vm.warp(_claimSubmissionDeadline(id));
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.withdrawNoClaim(id);
    }

    function test_auth_resolveDispute_onlyArbiter() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        vm.prank(tenant);
        escrow.respondToClaim(id, 0);
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.resolveDispute(id, 0);
    }

    function test_auth_proposeArbiterReplacement_onlyPartiesNotArbiter() public {
        uint256 id = _readyAgreement();
        vm.prank(arbiter);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.proposeArbiterReplacement(id, newArbiter);
    }

    function test_auth_proposeArbiterReplacement_strangerRejected() public {
        uint256 id = _readyAgreement();
        vm.prank(stranger);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.proposeArbiterReplacement(id, newArbiter);
    }

    function test_auth_confirmArbiterReplacement_strangerRejected() public {
        uint256 id = _readyAgreement();
        vm.prank(landlord);
        escrow.proposeArbiterReplacement(id, newArbiter);
        vm.prank(stranger);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.confirmArbiterReplacement(id);
    }

    function test_auth_resignAsArbiter_onlyCurrentArbiter() public {
        uint256 id = _readyAgreement();
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.resignAsArbiter(id);
    }

    function test_auth_withdraw_strangerRejected() public {
        uint256 id = _readyAgreement();
        _submitClaim(id, DEPOSIT / 2);
        vm.prank(stranger);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.withdraw(id);
    }

    /// @notice Permissionless transitions must NOT revert with NotAuthorized for any
    ///         caller - `stranger` succeeding here is the correct behavior, not a gap.
    function test_auth_permissionlessTransitions_anyCallerAllowed() public {
        uint256 id1 = _readyAgreement();
        vm.warp(_claimSubmissionDeadline(id1));
        vm.prank(tenant);
        escrow.withdrawNoClaim(id1); // still tenant-gated; contrast with the two below

        uint256 id2 = _readyAgreement();
        _submitClaim(id2, DEPOSIT / 2);
        vm.warp(_responseDeadline(id2));
        vm.prank(stranger);
        escrow.finalizeNoResponse(id2); // permissionless

        vm.warp(_arbiterRulingDeadline(id2));
        vm.prank(stranger);
        escrow.claimArbiterTimeout(id2); // permissionless
        assertEq(uint8(_phase(id2)), uint8(OpenEscrow.Phase.Closed));
    }
}
