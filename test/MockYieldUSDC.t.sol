// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {MockYieldUSDC} from "../contracts/MockYieldUSDC.sol";

contract MockYieldUSDCTest is Test {
    MockYieldUSDC internal token;

    function setUp() public {
        token = new MockYieldUSDC();
    }

    function test_valueAccruesTwentyPercentPerDay() public {
        uint256 shares = 1_000e6;
        token.mint(address(this), shares);
        assertEq(token.convertToAssets(shares), 1_000e6);

        vm.warp(block.timestamp + 1 days);
        assertEq(token.balanceOf(address(this)), shares, "share balance must remain fixed");
        assertEq(token.convertToAssets(shares), 1_200e6);

        vm.warp(block.timestamp + 4 days);
        assertEq(token.convertToAssets(shares), 2_000e6);
    }
}
