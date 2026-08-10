// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "./Base.t.sol";
import {OpenEscrow} from "../contracts/OpenEscrow.sol";
import {ShortTransferToken} from "./mocks/ShortTransferToken.sol";

/// @notice Requirement #1: proposal, arbiter acceptance, tenant acceptance, funding.
/// @notice Requirement #2: cancellation and proposal expiration paths.
contract LifecycleTest is Base {
    function test_createAgreement_setsProposedPhase() public {
        uint256 id = _propose();
        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(uint8(a.phase), uint8(OpenEscrow.Phase.Proposed));
        assertEq(a.landlord, landlord);
        assertEq(a.tenant, tenant);
        assertEq(a.arbiter, arbiter);
        assertEq(a.agreedAmount, DEPOSIT);
        assertEq(a.depositAmount, 0, "not funded yet");
    }

    function test_createAgreement_revertsOnZeroTenant() public {
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.ZeroAddress.selector);
        escrow.createAgreement(
            address(0), arbiter, DEPOSIT, uint64(block.timestamp), CLAIM_PERIOD, RESPONSE_PERIOD, ARBITER_PERIOD
        );
    }

    function test_createAgreement_withoutArbiter_isImmediatelyReadyToFund() public {
        vm.prank(landlord);
        uint256 id = escrow.createAgreement(
            tenant, address(0), DEPOSIT, uint64(block.timestamp), CLAIM_PERIOD, RESPONSE_PERIOD, ARBITER_PERIOD
        );
        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(uint8(a.phase), uint8(OpenEscrow.Phase.ReadyToFund));
        assertEq(a.arbiter, address(0));
        assertFalse(a.arbiterAccepted);
    }

    function test_createAgreement_revertsOnZeroDeposit() public {
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.ZeroDeposit.selector);
        escrow.createAgreement(
            tenant, arbiter, 0, uint64(block.timestamp), CLAIM_PERIOD, RESPONSE_PERIOD, ARBITER_PERIOD
        );
    }

    function test_createAgreement_revertsIfTenantEqualsLandlord() public {
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.InvalidRoleAssignment.selector);
        escrow.createAgreement(
            landlord, arbiter, DEPOSIT, uint64(block.timestamp), CLAIM_PERIOD, RESPONSE_PERIOD, ARBITER_PERIOD
        );
    }

    function test_createAgreement_revertsIfArbiterEqualsLandlord() public {
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.InvalidRoleAssignment.selector);
        escrow.createAgreement(
            tenant, landlord, DEPOSIT, uint64(block.timestamp), CLAIM_PERIOD, RESPONSE_PERIOD, ARBITER_PERIOD
        );
    }

    function test_createAgreement_revertsIfArbiterEqualsTenant() public {
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.InvalidRoleAssignment.selector);
        escrow.createAgreement(
            tenant, tenant, DEPOSIT, uint64(block.timestamp), CLAIM_PERIOD, RESPONSE_PERIOD, ARBITER_PERIOD
        );
    }

    function test_createAgreement_revertsIfClaimWindowStartInPast() public {
        vm.warp(1000);
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.InvalidClaimWindowStart.selector);
        escrow.createAgreement(
            tenant, arbiter, DEPOSIT, uint64(block.timestamp - 1), CLAIM_PERIOD, RESPONSE_PERIOD, ARBITER_PERIOD
        );
    }

    function test_createAgreement_revertsIfClaimWindowStartTooFarFuture() public {
        uint64 tooFar = uint64(block.timestamp) + escrow.MAX_CLAIM_WINDOW_OFFSET() + 1;
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.InvalidClaimWindowStart.selector);
        escrow.createAgreement(tenant, arbiter, DEPOSIT, tooFar, CLAIM_PERIOD, RESPONSE_PERIOD, ARBITER_PERIOD);
    }

    function test_createAgreement_revertsOnPeriodTooShort() public {
        uint64 tooShort = escrow.MIN_PERIOD() - 1;
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.InvalidPeriod.selector);
        escrow.createAgreement(
            tenant, arbiter, DEPOSIT, uint64(block.timestamp), tooShort, RESPONSE_PERIOD, ARBITER_PERIOD
        );
    }

    function test_createAgreement_revertsOnPeriodTooLong() public {
        uint64 tooLong = escrow.MAX_PERIOD() + 1;
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.InvalidPeriod.selector);
        escrow.createAgreement(
            tenant, arbiter, DEPOSIT, uint64(block.timestamp), tooLong, RESPONSE_PERIOD, ARBITER_PERIOD
        );
    }

    function test_acceptArbiterRole_movesToReadyToFund() public {
        uint256 id = _propose();
        _acceptArbiter(id);
        assertEq(uint8(_phase(id)), uint8(OpenEscrow.Phase.ReadyToFund));
        assertTrue(escrow.getAgreement(id).arbiterAccepted);
    }

    function test_declineArbiterRole_doesNotChangePhase() public {
        uint256 id = _propose();
        vm.prank(arbiter);
        escrow.declineArbiterRole(id);
        assertEq(uint8(_phase(id)), uint8(OpenEscrow.Phase.Proposed));
        assertTrue(escrow.getAgreement(id).arbiterDeclined);
    }

    function test_declineArbiterRole_blocksLaterAcceptance() public {
        uint256 id = _propose();
        vm.prank(arbiter);
        escrow.declineArbiterRole(id);

        vm.prank(arbiter);
        vm.expectRevert(OpenEscrow.NotAuthorized.selector);
        escrow.acceptArbiterRole(id);
    }

    function test_declineArbiterRole_revertsOnRepeatDecline() public {
        uint256 id = _propose();
        vm.prank(arbiter);
        escrow.declineArbiterRole(id);

        vm.prank(arbiter);
        vm.expectRevert(OpenEscrow.ArbiterHasDeclined.selector);
        escrow.declineArbiterRole(id);
    }

    function test_renominateArbiter_resetsDeclinedState() public {
        uint256 id = _propose();
        vm.prank(arbiter);
        escrow.declineArbiterRole(id);

        vm.prank(landlord);
        escrow.renominateArbiter(id, newArbiter);

        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertFalse(a.arbiterDeclined);
        assertEq(a.arbiter, newArbiter);

        vm.prank(newArbiter);
        escrow.acceptArbiterRole(id);
        assertEq(uint8(_phase(id)), uint8(OpenEscrow.Phase.ReadyToFund));
    }

    function test_renominateArbiter_resetsAcceptance() public {
        uint256 id = _propose();
        vm.prank(landlord);
        escrow.renominateArbiter(id, newArbiter);
        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(a.arbiter, newArbiter);
        assertFalse(a.arbiterAccepted);
        assertEq(uint8(a.phase), uint8(OpenEscrow.Phase.Proposed));
    }

    function test_renominateArbiter_worksAfterAcceptanceTooPreFunding() public {
        uint256 id = _propose();
        _acceptArbiter(id);
        vm.prank(landlord);
        escrow.renominateArbiter(id, newArbiter);
        assertEq(uint8(_phase(id)), uint8(OpenEscrow.Phase.Proposed));
    }

    function test_cancelProposal_fromProposed() public {
        uint256 id = _propose();
        vm.prank(landlord);
        escrow.cancelProposal(id);
        assertEq(uint8(_phase(id)), uint8(OpenEscrow.Phase.Cancelled));
    }

    function test_cancelProposal_fromReadyToFund() public {
        uint256 id = _propose();
        _acceptArbiter(id);
        vm.prank(landlord);
        escrow.cancelProposal(id);
        assertEq(uint8(_phase(id)), uint8(OpenEscrow.Phase.Cancelled));
    }

    function test_cancelProposal_revertsAfterFunding() public {
        uint256 id = _readyAgreement();
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.InvalidPhase.selector);
        escrow.cancelProposal(id);
    }

    function test_tenantAcceptAndFund_movesToActiveAndPullsExactAmount() public {
        uint256 id = _propose();
        _acceptArbiter(id);
        uint256 tenantBalBefore = usdc.balanceOf(tenant);
        uint256 escrowBalBefore = usdc.balanceOf(address(escrow));
        _fund(id);

        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(uint8(a.phase), uint8(OpenEscrow.Phase.Active));
        assertEq(a.depositAmount, DEPOSIT);
        assertEq(a.fundedAt, block.timestamp);
        assertEq(a.locked, DEPOSIT);
        assertEq(usdc.balanceOf(tenant), tenantBalBefore - DEPOSIT);
        assertEq(usdc.balanceOf(address(escrow)), escrowBalBefore + DEPOSIT);
        _assertConserved(id);
    }

    function test_tenantAcceptAndFund_revertsIfNotReadyToFund() public {
        uint256 id = _propose(); // arbiter has not accepted
        vm.prank(tenant);
        vm.expectRevert(OpenEscrow.InvalidPhase.selector);
        escrow.tenantAcceptAndFund(id);
    }

    function test_tenantAcceptAndFund_revertsOnDoubleFunding() public {
        uint256 id = _readyAgreement();
        vm.prank(tenant);
        vm.expectRevert(OpenEscrow.InvalidPhase.selector);
        escrow.tenantAcceptAndFund(id);
    }

    function test_tenantAcceptAndFund_revertsOnDepositMismatch_shortTransferToken() public {
        ShortTransferToken shortToken = new ShortTransferToken();
        OpenEscrow shortEscrow = new OpenEscrow(address(shortToken), address(shortToken), address(0));
        shortToken.mint(tenant, DEPOSIT);
        vm.prank(tenant);
        shortToken.approve(address(shortEscrow), type(uint256).max);
        shortToken.setShortfall(1); // delivers 1 wei less than requested

        vm.prank(landlord);
        uint256 id = shortEscrow.createAgreement(
            tenant, arbiter, DEPOSIT, uint64(block.timestamp), CLAIM_PERIOD, RESPONSE_PERIOD, ARBITER_PERIOD
        );
        vm.prank(arbiter);
        shortEscrow.acceptArbiterRole(id);

        vm.prank(tenant);
        vm.expectRevert(OpenEscrow.DepositMismatch.selector);
        shortEscrow.tenantAcceptAndFund(id);
    }

    function test_getAgreement_revertsForNonexistentId() public {
        vm.expectRevert(OpenEscrow.AgreementDoesNotExist.selector);
        escrow.getAgreement(999);
    }
}
