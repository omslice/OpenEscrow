// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../contracts/OpenEscrowCore.sol";
import "../contracts/MockYieldModule.sol";

/**
 * @title RefundWithYieldTest
 * @dev Tests that the tenant receives both the principal and yield on refund.
 */
contract RefundWithYieldTest is Test {
    OpenEscrowCore escrow;
    MockYieldModule yieldModule;

    address tenant = address(0xBEEF);
    address landlord = address(0xCAFE);

    function setUp() public {
        // Deploy a fresh OpenEscrowCore contract before each test
        escrow = new OpenEscrowCore();

        // Deploy a MockYieldModule and set it to return a fixed yield
        yieldModule = new MockYieldModule();

        // Set the mock yield to 0.01 ether for test consistency
        yieldModule.setFixedYield(0.01 ether);
    }

    /**
     * @notice Tests that refund() returns both the original amount and yield to the tenant.
     * Scenario:
     * - Tenant creates an escrow with 1 ether and links a yield module
     * - After release time, tenant calls refund()
     * - Tenant receives 1 ether + 0.01 ether (yield)
     */
    function testRefundReturnsPrincipalPlusYield() public {
        // Give the tenant an initial balance of 1 ether
        vm.deal(tenant, 1 ether);

        // Set all calls to originate from the tenant address
        vm.startPrank(tenant);

        // Create a new escrow agreement and capture its ID
        uint256 agreementId = escrow.createAgreement{value: 1 ether}(
            landlord,
            block.timestamp + 1,  // Set release time to "now + 1"
            address(0),           // No rules module for this test
            address(yieldModule)  // Attach the mock yield module
        );

        // Advance the blockchain time so the release time has passed
        vm.warp(block.timestamp + 2);

        // Save the tenant's balance before calling refund()
        uint256 tenantBalanceBefore = tenant.balance;

        // Fund the escrow contract with enough ETH to pay the yield
        vm.deal(address(escrow), 1.01 ether);

        // Call refund on the agreement; should send principal + yield to the tenant
        escrow.refund(agreementId);

        // Calculate the expected balance (principal + 50% of yield for tenant)
        uint256 expected = tenantBalanceBefore + 1 ether + 0.005 ether; // adjust yield if your mock is different

        // Assert that the tenant's new balance matches the expected value
        assertEq(tenant.balance, expected, "Tenant should receive principal + yield share");
    }

}
