// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../contracts/EscrowFactory.sol";

/// @title EscrowFactoryTest
/// @notice Basic tests for the EscrowFactory deployment flow
contract EscrowFactoryTest is Test {
    EscrowFactory public factory;
    address user = address(1);

    function setUp() public {
        factory = new EscrowFactory();
    }

    function testCreateEscrow_RegistersCorrectly() public {
        vm.prank(user);
        address newEscrow = factory.createEscrow();

        // Check it’s stored correctly
        address[] memory userEscrows = factory.getEscrowsByUser(user);
        assertEq(userEscrows.length, 1);
        assertEq(userEscrows[0], newEscrow);

        address[] memory allEscrows = factory.getAllEscrows();
        assertEq(allEscrows.length, 1);
        assertEq(allEscrows[0], newEscrow);
    }
}
