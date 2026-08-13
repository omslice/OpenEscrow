// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "./Base.t.sol";
import {OpenEscrow} from "../contracts/OpenEscrow.sol";

contract OptionalArbiterTest is Base {
    function _readyWithoutArbiter() internal returns (uint256 id) {
        vm.prank(landlord);
        id = escrow.createAgreement(
            tenant, address(0), DEPOSIT, uint64(block.timestamp), CLAIM_PERIOD, RESPONSE_PERIOD, ARBITER_PERIOD
        );
        _fund(id);
    }

    function test_withoutArbiter_tenantCanFundImmediately() public {
        uint256 id = _readyWithoutArbiter();
        assertEq(uint8(_phase(id)), uint8(OpenEscrow.Phase.Active));
        assertEq(escrow.getAgreement(id).arbiter, address(0));
        _assertConserved(id);
    }

    function test_withoutArbiter_tenantDisputeIsRecordOnlyAndDoesNotOpenArbitration() public {
        uint256 id = _readyWithoutArbiter();
        _submitClaim(id, DEPOSIT / 2);
        vm.prank(tenant);
        escrow.respondToClaim(id, 0);

        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(uint8(a.phase), uint8(OpenEscrow.Phase.Closed));
        assertEq(a.landlordWithdrawable, DEPOSIT / 2);
        assertEq(a.tenantWithdrawable, DEPOSIT / 2);
        assertEq(a.locked, 0);

        vm.expectRevert(OpenEscrow.InvalidPhase.selector);
        escrow.claimArbiterTimeout(id);
        _assertConserved(id);
    }

    function test_withoutArbiter_partiesCanMutuallyAppointOneBeforeClaim() public {
        uint256 id = _readyWithoutArbiter();

        vm.prank(landlord);
        escrow.proposeArbiterReplacement(id, newArbiter);
        vm.prank(tenant);
        escrow.confirmArbiterReplacement(id);
        vm.prank(newArbiter);
        escrow.acceptArbiterRole(id);

        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(uint8(a.phase), uint8(OpenEscrow.Phase.Active));
        assertEq(a.arbiter, newArbiter);
        assertTrue(a.arbiterAccepted);
        _assertConserved(id);
    }
}
