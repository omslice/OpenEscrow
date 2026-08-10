// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {OpenEscrow} from "../contracts/OpenEscrow.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @notice Shared setup and helpers for the OpenEscrow test suite.
abstract contract Base is Test {
    OpenEscrow internal escrow;
    MockUSDC internal usdc;

    address internal landlord = makeAddr("landlord");
    address internal tenant = makeAddr("tenant");
    address internal arbiter = makeAddr("arbiter");
    address internal stranger = makeAddr("stranger");
    address internal newArbiter = makeAddr("newArbiter");

    uint256 internal constant DEPOSIT = 1_000e6; // 1000 mUSDC
    uint64 internal constant CLAIM_PERIOD = 7 days;
    uint64 internal constant RESPONSE_PERIOD = 2 days;
    uint64 internal constant ARBITER_PERIOD = 3 days;

    bytes32 internal constant HASH1 = keccak256("evidence-1");
    bytes32 internal constant HASH2 = keccak256("evidence-2");
    string internal constant URI = "ipfs://placeholder-cid";
    uint8 internal constant EV_CLAIM = 0;

    function setUp() public virtual {
        usdc = new MockUSDC();
        escrow = new OpenEscrow(address(usdc), address(usdc), address(0));

        usdc.mint(tenant, 1_000_000e6);
        vm.prank(tenant);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // ---- helpers -----------------------------------------------------

    function _propose() internal returns (uint256 id) {
        vm.prank(landlord);
        id = escrow.createAgreement(
            tenant, arbiter, DEPOSIT, uint64(block.timestamp), CLAIM_PERIOD, RESPONSE_PERIOD, ARBITER_PERIOD
        );
    }

    function _proposeWithStart(uint64 claimWindowStart) internal returns (uint256 id) {
        vm.prank(landlord);
        id = escrow.createAgreement(
            tenant, arbiter, DEPOSIT, claimWindowStart, CLAIM_PERIOD, RESPONSE_PERIOD, ARBITER_PERIOD
        );
    }

    function _acceptArbiter(uint256 id) internal {
        vm.prank(arbiter);
        escrow.acceptArbiterRole(id);
    }

    function _fund(uint256 id) internal {
        vm.prank(tenant);
        escrow.tenantAcceptAndFund(id);
    }

    /// @dev Proposes, accepts arbiter, and funds a standard agreement in one call.
    function _readyAgreement() internal returns (uint256 id) {
        id = _propose();
        _acceptArbiter(id);
        _fund(id);
    }

    function _submitClaim(uint256 id, uint256 amount) internal {
        vm.prank(landlord);
        escrow.submitClaim(id, amount, HASH1, URI, EV_CLAIM);
    }

    function _claimSubmissionDeadline(uint256 id) internal view returns (uint64) {
        return escrow.getAgreement(id).claimSubmissionDeadline;
    }

    function _responseDeadline(uint256 id) internal view returns (uint64) {
        return escrow.getAgreement(id).responseDeadline;
    }

    function _arbiterRulingDeadline(uint256 id) internal view returns (uint64) {
        return escrow.getAgreement(id).arbiterRulingDeadline;
    }

    function _phase(uint256 id) internal view returns (OpenEscrow.Phase) {
        return escrow.getAgreement(id).phase;
    }

    function _assertConserved(uint256 id) internal view {
        OpenEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(
            a.depositAmount,
            a.tenantWithdrawable + a.landlordWithdrawable + a.locked + a.withdrawn,
            "D == T+Ld+locked+W violated"
        );
    }
}
