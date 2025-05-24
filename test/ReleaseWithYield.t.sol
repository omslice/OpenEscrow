// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../contracts/OpenEscrowCore.sol";
import "../contracts/MockRulesModule.sol";
import "../contracts/MockYieldModule.sol";

contract ReleaseWithYieldTest is Test {
    OpenEscrowCore public escrow;
    MockRulesModule public rules;
    MockYieldModule public yield;

    address tenant = address(1);
    address landlord = address(2);

    function setUp() public {
        escrow = new OpenEscrowCore();
        rules = new MockRulesModule();
        yield = new MockYieldModule();

        vm.deal(tenant, 10 ether); // fund tenant
        // Inject yield into escrow contract so it can forward it
        vm.deal(address(escrow), 0.2 ether);

    }

    function testReleaseWithYield_DistributesCorrectly() public {
        // Set fixed yield to 0.2 ether
        yield.setFixedYield(0.2 ether);

        // Create agreement
        vm.prank(tenant);
        escrow.createAgreement{value: 1 ether}(
            landlord,
            block.timestamp + 1,
            address(rules),
            address(yield)
        );

        vm.warp(block.timestamp + 2);

        uint256 beforeTenant = tenant.balance;
        uint256 beforeLandlord = landlord.balance;

        escrow.releaseFunds(0);

        uint256 afterTenant = tenant.balance;
        uint256 afterLandlord = landlord.balance;

        // Deposit: landlord gets 1 ETH
        assertEq(afterLandlord - beforeLandlord, 1 ether + 0.1 ether); // 0.1 yield
        assertEq(afterTenant - beforeTenant, 0.1 ether); // 0.1 yield
    }
}
