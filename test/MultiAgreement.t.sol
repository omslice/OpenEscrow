// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "./Base.t.sol";
import {OpenEscrow} from "../contracts/OpenEscrow.sol";

/// @notice Requirement #16: two or more concurrent agreements proving accounting
///         isolation, plus the global "contract balance covers aggregate liabilities"
///         invariant across them.
contract MultiAgreementTest is Base {
    address internal landlord2 = makeAddr("landlord2");
    address internal tenant2 = makeAddr("tenant2");
    address internal arbiter2 = makeAddr("arbiter2");

    function _aggregateLiabilities(uint256[] memory ids) internal view returns (uint256 total) {
        for (uint256 i = 0; i < ids.length; i++) {
            OpenEscrow.Agreement memory a = escrow.getAgreement(ids[i]);
            total += a.tenantWithdrawable + a.landlordWithdrawable + a.locked;
        }
    }

    function test_isolation_actionsOnOneAgreementDoNotTouchAnother() public {
        usdc.mint(tenant2, 1_000_000e6);
        vm.prank(tenant2);
        usdc.approve(address(escrow), type(uint256).max);

        uint256 idA = _readyAgreement();

        vm.prank(landlord2);
        uint256 idB = escrow.createAgreement(
            tenant2, arbiter2, DEPOSIT * 3, uint64(block.timestamp), CLAIM_PERIOD, RESPONSE_PERIOD, ARBITER_PERIOD
        );
        vm.prank(arbiter2);
        escrow.acceptArbiterRole(idB);
        vm.prank(tenant2);
        escrow.tenantAcceptAndFund(idB);

        OpenEscrow.Agreement memory bBefore = escrow.getAgreement(idB);

        // Fully resolve agreement A through claim -> dispute -> arbiter award.
        _submitClaim(idA, DEPOSIT / 2);
        vm.prank(tenant);
        escrow.respondToClaim(idA, 0);
        vm.prank(arbiter);
        escrow.resolveDispute(idA, DEPOSIT / 4);
        vm.warp(_claimSubmissionDeadline(idA));
        vm.prank(tenant);
        escrow.withdraw(idA);
        vm.prank(landlord);
        escrow.withdraw(idA);

        OpenEscrow.Agreement memory bAfter = escrow.getAgreement(idB);
        assertEq(bAfter.depositAmount, bBefore.depositAmount);
        assertEq(bAfter.tenantWithdrawable, bBefore.tenantWithdrawable);
        assertEq(bAfter.landlordWithdrawable, bBefore.landlordWithdrawable);
        assertEq(bAfter.locked, bBefore.locked);
        assertEq(bAfter.withdrawn, bBefore.withdrawn);
        assertEq(uint8(bAfter.phase), uint8(OpenEscrow.Phase.Active), "B must be untouched by A's lifecycle");

        _assertConserved(idA);
        _assertConserved(idB);
    }

    function test_isolation_contractBalanceCoversAggregateLiabilitiesAcrossThreeAgreements() public {
        usdc.mint(tenant2, 1_000_000e6);
        vm.prank(tenant2);
        usdc.approve(address(escrow), type(uint256).max);
        address tenant3 = makeAddr("tenant3");
        usdc.mint(tenant3, 1_000_000e6);
        vm.prank(tenant3);
        usdc.approve(address(escrow), type(uint256).max);

        uint256[] memory ids = new uint256[](3);
        ids[0] = _readyAgreement();

        vm.prank(landlord2);
        ids[1] = escrow.createAgreement(
            tenant2, arbiter2, DEPOSIT * 2, uint64(block.timestamp), CLAIM_PERIOD, RESPONSE_PERIOD, ARBITER_PERIOD
        );
        vm.prank(arbiter2);
        escrow.acceptArbiterRole(ids[1]);
        vm.prank(tenant2);
        escrow.tenantAcceptAndFund(ids[1]);

        vm.prank(landlord);
        ids[2] = escrow.createAgreement(
            tenant3, arbiter, DEPOSIT / 2, uint64(block.timestamp), CLAIM_PERIOD, RESPONSE_PERIOD, ARBITER_PERIOD
        );
        vm.prank(arbiter);
        escrow.acceptArbiterRole(ids[2]);
        vm.prank(tenant3);
        escrow.tenantAcceptAndFund(ids[2]);

        // Drive each agreement through a different path.
        _submitClaim(ids[0], DEPOSIT / 3);
        vm.prank(tenant);
        escrow.respondToClaim(ids[0], DEPOSIT / 6); // partial accept, partial dispute

        vm.prank(landlord2);
        escrow.submitClaim(ids[1], DEPOSIT, HASH1, URI, EV_CLAIM);
        vm.warp(_responseDeadline(ids[1]));
        escrow.finalizeNoResponse(ids[1]); // -> Disputed via timeout

        vm.warp(_claimSubmissionDeadline(ids[2]));
        vm.prank(tenant3);
        escrow.withdrawNoClaim(ids[2]); // -> Closed(NoClaim)

        assertEq(usdc.balanceOf(address(escrow)), _aggregateLiabilities(ids));

        for (uint256 i = 0; i < ids.length; i++) {
            _assertConserved(ids[i]);
        }
    }
}
