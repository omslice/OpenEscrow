// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../contracts/OpenEscrowCore.sol";
import "../contracts/MockRulesModule.sol";

contract OpenEscrowCoreTest is Test {
    OpenEscrowCore public escrow;
    MockRulesModule public rules;

    address tenant = address(1);
    address landlord = address(2);

    function setUp() public {
        escrow = new OpenEscrowCore();
        rules = new MockRulesModule();

        vm.deal(tenant, 10 ether); // Give the tenant some ETH
    }

    /// @notice Should revert if release blocked by rules module
    function testReleaseBlockedByRulesModule() public {
        vm.prank(tenant);
        escrow.createAgreement{value: 1 ether}(
            landlord,
            block.timestamp + 1,
            address(rules),
            address(0)
        );

        vm.warp(block.timestamp + 2);
        rules.setAllowRelease(false);

        vm.expectRevert("Release blocked by rules module");
        escrow.releaseFunds(0);
    }

    /// @notice Should succeed if release allowed by rules module
    function testReleaseAllowedByRulesModule() public {
        vm.prank(tenant);
        escrow.createAgreement{value: 1 ether}(
            landlord,
            block.timestamp + 1,
            address(rules),
            address(0)
        );

        vm.warp(block.timestamp + 2);
        rules.setAllowRelease(true);

        uint256 before = landlord.balance;
        escrow.releaseFunds(0);
        uint256 afterBalance = landlord.balance;

        assertEq(afterBalance - before, 1 ether);
    }

    /// @notice Should revert if no ETH is sent during agreement creation
    function testCreateAgreement_RevertIfNoValueSent() public {
        vm.prank(tenant);
        vm.expectRevert("Must send some ETH");

        escrow.createAgreement(
            landlord,
            block.timestamp + 1,
            address(0),
            address(0)
        );
    }

    /// @notice Should revert if landlord address is zero
    function testCreateAgreement_RevertIfInvalidLandlord() public {
        vm.prank(tenant);
        vm.expectRevert("Invalid landlord address");

        escrow.createAgreement{value: 1 ether}(
            address(0),
            block.timestamp + 1,
            address(0),
            address(0)
        );
    }

    /// @notice Should store correct data when agreement is created properly
    function testCreateAgreement_Success() public {
        vm.prank(tenant);
        escrow.createAgreement{value: 1 ether}(
            landlord,
            block.timestamp + 1,
            address(0),
            address(0)
        );

        (
            address tenantStored,
            address landlordStored,
            uint256 amount,
            uint256 releaseTime,
            bool released,
            bool refunded,
            address rulesModule,
            address yieldModule
        ) = escrow.agreements(0);

        assertEq(tenantStored, tenant);
        assertEq(landlordStored, landlord);
        assertEq(amount, 1 ether);
        assertGt(releaseTime, block.timestamp);
        assertFalse(released);
        assertFalse(refunded);
        assertEq(rulesModule, address(0));
        assertEq(yieldModule, address(0));
    }

    /// @notice Should revert if refund is called too early (before releaseTime)
    function testRefund_RevertIfTooEarly() public {
        vm.prank(tenant);
        escrow.createAgreement{value: 1 ether}(
            landlord,
            block.timestamp + 100,
            address(0),
            address(0)
        );

        vm.prank(tenant);
        vm.expectRevert("Too early to refund");
        escrow.refund(0);
    }

    /// @notice Should revert if refund is called by non-tenant
    function testRefund_RevertIfNotTenant() public {
        vm.prank(tenant);
        escrow.createAgreement{value: 1 ether}(
            landlord,
            block.timestamp + 1,
            address(0),
            address(0)
        );

        vm.warp(block.timestamp + 2);

        vm.prank(landlord);
        vm.expectRevert("Only tenant");
        escrow.refund(0);
    }

    /// @notice Should revert if already released
    function testRefund_RevertIfAlreadyReleased() public {
        vm.prank(tenant);
        escrow.createAgreement{value: 1 ether}(
            landlord,
            block.timestamp + 1,
            address(0),
            address(0)
        );

        vm.warp(block.timestamp + 2);
        escrow.releaseFunds(0);

        vm.prank(tenant);
        vm.expectRevert("Already released");
        escrow.refund(0);
    }

    /// @notice Should succeed and send funds back to tenant
    function testRefund_Success() public {
        vm.prank(tenant);
        escrow.createAgreement{value: 1 ether}(
            landlord,
            block.timestamp + 1,
            address(0),
            address(0)
        );

        vm.warp(block.timestamp + 2);

        uint256 before = tenant.balance;

        vm.prank(tenant);
        escrow.refund(0);

        uint256 afterBalance = tenant.balance;
        assertEq(afterBalance - before, 1 ether);

        (, , , , , bool refunded,,) = escrow.agreements(0);
        assertTrue(refunded);
    }
}
