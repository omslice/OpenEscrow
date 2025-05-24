// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../contracts/OpenEscrowCore.sol";
import "../contracts/EscrowViewer.sol";
import "../contracts/MockRulesModule.sol";
import "../contracts/MockYieldModule.sol";

contract EscrowViewerTest is Test {
    OpenEscrowCore public escrow;
    EscrowViewer public viewer;
    MockRulesModule public rules;
    MockYieldModule public yield;

    address tenant = address(1);
    address landlord = address(2);

    function setUp() public {
        escrow = new OpenEscrowCore();
        viewer = new EscrowViewer(address(escrow));
        rules = new MockRulesModule();
        yield = new MockYieldModule();

        vm.deal(tenant, 10 ether);
    }

    /// @notice Should return correct info for a basic agreement with yield
    function testGetEscrowInfo_WithYield() public {
        yield.setFixedYield(0.2 ether);

        vm.prank(tenant);
        escrow.createAgreement{value: 1 ether}(
            landlord,
            block.timestamp + 1,
            address(rules),
            address(yield)
        );

        vm.warp(block.timestamp + 2);

        EscrowViewer.EscrowInfo memory info = viewer.getEscrowInfo(0);

        assertEq(info.tenant, tenant, "Tenant mismatch");
        assertEq(info.landlord, landlord, "Landlord mismatch");
        assertEq(info.amount, 1 ether, "Amount mismatch");
        assertTrue(info.readyToRelease, "Should be ready to release");
        assertEq(info.yieldEstimate, 0.2 ether, "Yield estimate mismatch");
        assertFalse(info.released, "Should not be marked released yet");
        assertFalse(info.refunded, "Should not be refunded yet");
    }

    /// @notice Should show not ready if time has not passed yet
    function testGetEscrowInfo_NotReady() public {
        vm.prank(tenant);
        escrow.createAgreement{value: 1 ether}(
            landlord,
            block.timestamp + 1000,
            address(0),
            address(0)
        );

        EscrowViewer.EscrowInfo memory info = viewer.getEscrowInfo(0);
        assertFalse(info.readyToRelease, "Should not be ready yet");
        assertEq(info.yieldEstimate, 0, "Should be no yield");
    }
}
