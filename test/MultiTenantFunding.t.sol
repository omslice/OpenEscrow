// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "./Base.t.sol";
import {OpenEscrow} from "../contracts/OpenEscrow.sol";

contract MultiTenantFundingTest is Base {
    address internal tenantTwo = makeAddr("tenantTwo");

    function setUp() public override {
        super.setUp();
        usdc.mint(tenantTwo, 1_000_000e6);
        vm.prank(tenantTwo);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function _proposeMulti(uint16 firstShare, uint16 secondShare) internal returns (uint256 id) {
        address[] memory tenants = new address[](2);
        tenants[0] = tenant;
        tenants[1] = tenantTwo;
        uint16[] memory shares = new uint16[](2);
        shares[0] = firstShare;
        shares[1] = secondShare;

        vm.prank(landlord);
        id = escrow.createMultiTenantAgreementWithToken(
            tenants,
            shares,
            arbiter,
            address(usdc),
            DEPOSIT,
            uint64(block.timestamp),
            CLAIM_PERIOD,
            RESPONSE_PERIOD,
            ARBITER_PERIOD
        );
        vm.prank(arbiter);
        escrow.acceptArbiterRole(id);
    }

    function test_eachTenantFundsOnlyApprovedShare_andFullAmountActivates() public {
        uint256 id = _proposeMulti(6_000, 4_000);
        assertEq(escrow.requiredTenantContribution(id, tenant), 600e6);
        assertEq(escrow.requiredTenantContribution(id, tenantTwo), 400e6);

        vm.prank(tenantTwo);
        escrow.fundTenantShare(id);
        OpenEscrow.Agreement memory partiallyFunded = escrow.getAgreement(id);
        assertEq(uint8(partiallyFunded.phase), uint8(OpenEscrow.Phase.ReadyToFund));
        assertEq(partiallyFunded.depositAmount, 400e6);
        assertEq(partiallyFunded.locked, 400e6);
        assertEq(partiallyFunded.fundedAt, 0);

        vm.prank(tenant);
        escrow.fundTenantShare(id);
        OpenEscrow.Agreement memory funded = escrow.getAgreement(id);
        assertEq(uint8(funded.phase), uint8(OpenEscrow.Phase.Active));
        assertEq(funded.depositAmount, DEPOSIT);
        assertEq(funded.locked, DEPOSIT);
        assertEq(funded.fundedAt, block.timestamp);
        _assertConserved(id);
    }

    function test_refundCreditsEachTenantByOwnershipShare() public {
        uint256 id = _proposeMulti(6_000, 4_000);
        vm.prank(tenant);
        escrow.fundTenantShare(id);
        vm.prank(tenantTwo);
        escrow.fundTenantShare(id);

        vm.warp(_claimSubmissionDeadline(id));
        vm.prank(tenantTwo);
        escrow.withdrawNoClaim(id);

        assertEq(escrow.tenantWithdrawableByAddress(id, tenant), 600e6);
        assertEq(escrow.tenantWithdrawableByAddress(id, tenantTwo), 400e6);

        uint256 tenantTwoBefore = usdc.balanceOf(tenantTwo);
        vm.prank(tenantTwo);
        escrow.withdraw(id);
        assertEq(usdc.balanceOf(tenantTwo), tenantTwoBefore + 400e6);
        assertEq(escrow.getAgreement(id).tenantWithdrawable, 600e6);
        _assertConserved(id);
    }

    function test_cancelAfterPartialFunding_returnsExactContribution() public {
        uint256 id = _proposeMulti(5_000, 5_000);
        vm.prank(tenantTwo);
        escrow.fundTenantShare(id);

        vm.prank(landlord);
        escrow.cancelProposal(id);

        OpenEscrow.Agreement memory cancelled = escrow.getAgreement(id);
        assertEq(uint8(cancelled.phase), uint8(OpenEscrow.Phase.Cancelled));
        assertEq(cancelled.tenantWithdrawable, 500e6);
        assertEq(escrow.tenantWithdrawableByAddress(id, tenantTwo), 500e6);

        vm.prank(tenantTwo);
        escrow.withdraw(id);
        _assertConserved(id);
    }

    function test_rejectsSharesThatDoNotTotalOneHundredPercent() public {
        address[] memory tenants = new address[](2);
        tenants[0] = tenant;
        tenants[1] = tenantTwo;
        uint16[] memory shares = new uint16[](2);
        shares[0] = 5_000;
        shares[1] = 4_999;

        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.InvalidTenantShares.selector);
        escrow.createMultiTenantAgreementWithToken(
            tenants,
            shares,
            arbiter,
            address(usdc),
            DEPOSIT,
            uint64(block.timestamp),
            CLAIM_PERIOD,
            RESPONSE_PERIOD,
            ARBITER_PERIOD
        );
    }

    function test_secondaryTenantCannotBeRenominatedAsArbiter() public {
        uint256 id = _proposeMulti(5_000, 5_000);
        vm.prank(landlord);
        vm.expectRevert(OpenEscrow.InvalidRoleAssignment.selector);
        escrow.renominateArbiter(id, tenantTwo);
    }
}
