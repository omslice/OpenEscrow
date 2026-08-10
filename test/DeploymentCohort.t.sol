// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {OpenEscrow} from "../contracts/OpenEscrow.sol";
import {OperationsReserve} from "../contracts/OperationsReserve.sol";
import {AgreementActivityRegistry} from "../contracts/AgreementActivityRegistry.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {MockYieldUSDC} from "../contracts/MockYieldUSDC.sol";

/// @notice Proves that immutable releases remain isolated even when agreement IDs
///         overlap. A new deployment is a new cohort, not an in-place upgrade or a
///         migration of balances, roles, registry permissions, or reserve receipts.
contract DeploymentCohortTest is Test {
    uint256 internal constant DEPOSIT = 1_000e6;
    uint256 internal constant RESERVE = 5e6;

    MockUSDC internal usdc;
    MockYieldUSDC internal yieldToken;

    OpenEscrow internal retiredEscrow;
    OperationsReserve internal retiredReserve;
    AgreementActivityRegistry internal retiredRegistry;

    OpenEscrow internal candidateEscrow;
    OperationsReserve internal candidateReserve;
    AgreementActivityRegistry internal candidateRegistry;

    address internal retiredLandlord = makeAddr("retired-landlord");
    address internal retiredTenant = makeAddr("retired-tenant");
    address internal candidateLandlord = makeAddr("candidate-landlord");
    address internal candidateTenant = makeAddr("candidate-tenant");

    function setUp() public {
        usdc = new MockUSDC();
        yieldToken = new MockYieldUSDC();

        retiredReserve = new OperationsReserve(address(usdc), address(yieldToken));
        retiredEscrow = new OpenEscrow(address(usdc), address(yieldToken), address(retiredReserve));
        retiredReserve.configureEscrow(address(retiredEscrow));
        retiredRegistry = new AgreementActivityRegistry(address(retiredEscrow));

        candidateReserve = new OperationsReserve(address(usdc), address(yieldToken));
        candidateEscrow = new OpenEscrow(address(usdc), address(yieldToken), address(candidateReserve));
        candidateReserve.configureEscrow(address(candidateEscrow));
        candidateRegistry = new AgreementActivityRegistry(address(candidateEscrow));

        usdc.mint(retiredTenant, DEPOSIT + RESERVE);
        usdc.mint(candidateTenant, DEPOSIT + RESERVE);
    }

    function _createAndFund(OpenEscrow escrow, address landlord, address tenant) internal returns (uint256 id) {
        vm.prank(landlord);
        id = escrow.createAgreementWithToken(
            tenant, address(0), address(usdc), DEPOSIT, uint64(block.timestamp + 30 days), 7 days, 7 days, 7 days
        );
        vm.startPrank(tenant);
        usdc.approve(address(escrow), DEPOSIT + RESERVE);
        escrow.fundTenantShareWithReserve(id);
        vm.stopPrank();
    }

    function test_retiredAndCandidateCohortsRemainIsolatedAcrossOverlappingIds() public {
        uint256 retiredId = _createAndFund(retiredEscrow, retiredLandlord, retiredTenant);
        uint256 candidateId = _createAndFund(candidateEscrow, candidateLandlord, candidateTenant);

        // Agreement identifiers are local to an immutable deployment, so an ID
        // collision must not imply shared state or authority.
        assertEq(retiredId, candidateId);
        assertEq(retiredEscrow.getAgreement(retiredId).landlord, retiredLandlord);
        assertEq(candidateEscrow.getAgreement(candidateId).landlord, candidateLandlord);
        assertEq(usdc.balanceOf(address(retiredEscrow)), DEPOSIT);
        assertEq(usdc.balanceOf(address(candidateEscrow)), DEPOSIT);
        assertEq(usdc.balanceOf(address(retiredReserve)), RESERVE);
        assertEq(usdc.balanceOf(address(candidateReserve)), RESERVE);

        bytes32 snapshot = keccak256("cohort-specific-snapshot");
        vm.prank(retiredTenant);
        retiredRegistry.anchorSnapshot(retiredId, snapshot);
        vm.prank(retiredTenant);
        vm.expectRevert(AgreementActivityRegistry.NotAgreementParty.selector);
        candidateRegistry.anchorSnapshot(candidateId, snapshot);

        vm.prank(candidateTenant);
        candidateRegistry.anchorSnapshot(candidateId, snapshot);
        vm.prank(candidateTenant);
        vm.expectRevert(AgreementActivityRegistry.NotAgreementParty.selector);
        retiredRegistry.anchorSnapshot(retiredId, snapshot);

        vm.prank(retiredTenant);
        vm.expectRevert(OperationsReserve.UnsupportedEscrow.selector);
        retiredReserve.payReserve(address(candidateEscrow), candidateId);
        vm.prank(candidateTenant);
        vm.expectRevert(OperationsReserve.UnsupportedEscrow.selector);
        candidateReserve.payReserve(address(retiredEscrow), retiredId);

        // Closing and withdrawing the retired cohort changes only its own
        // principal; the candidate cohort remains fully funded and active.
        vm.warp(retiredEscrow.getAgreement(retiredId).claimSubmissionDeadline);
        vm.prank(retiredTenant);
        retiredEscrow.withdrawNoClaim(retiredId);
        vm.prank(retiredTenant);
        retiredEscrow.withdraw(retiredId);

        assertEq(usdc.balanceOf(address(retiredEscrow)), 0);
        assertEq(usdc.balanceOf(address(candidateEscrow)), DEPOSIT);
        OpenEscrow.Agreement memory candidate = candidateEscrow.getAgreement(candidateId);
        assertEq(uint8(candidate.phase), uint8(OpenEscrow.Phase.Active));
        assertEq(candidate.locked, DEPOSIT);
        assertEq(candidate.withdrawn, 0);
    }
}
