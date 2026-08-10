// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BaseSepoliaAaveUSDCAdapter} from "../../contracts/adapters/BaseSepoliaAaveUSDCAdapter.sol";

contract BaseSepoliaAaveUSDCAdapterForkTest is Test {
    BaseSepoliaAaveUSDCAdapter internal adapter;

    function setUp() public {
        string memory rpcUrl = vm.envOr("BASE_SEPOLIA_RPC_URL", string(""));
        if (bytes(rpcUrl).length == 0) {
            vm.skip(true, "set BASE_SEPOLIA_RPC_URL to run Base Sepolia fork verification");
        }
        vm.createSelectFork(rpcUrl);
        adapter = new BaseSepoliaAaveUSDCAdapter();
    }

    function test_officialDeploymentIdentityAndCapacity() public view {
        assertEq(block.chainid, adapter.BASE_SEPOLIA_CHAIN_ID());
        assertEq(adapter.settlementAsset(), adapter.USDC());
        assertEq(adapter.receiptAsset(), adapter.STATA_USDC());
        assertEq(adapter.A_TOKEN(), adapter.A_USDC());
        assertEq(adapter.AAVE_POOL(), adapter.POOL());
        assertGt(adapter.maxDeposit(address(this)), 0);
    }

    function test_depositAndRedeemOfficialStataTokenOnFork() public {
        IERC20 usdc = IERC20(adapter.USDC());
        IERC20 stataUsdc = IERC20(adapter.STATA_USDC());
        uint256 assets = 10e6;

        deal(address(usdc), address(this), assets, true);
        usdc.approve(address(adapter), assets);
        uint256 shares = adapter.deposit(assets, address(this));

        assertGt(shares, 0);
        assertEq(stataUsdc.balanceOf(address(this)), shares);
        assertEq(usdc.balanceOf(address(adapter)), 0);
        assertEq(stataUsdc.balanceOf(address(adapter)), 0);

        stataUsdc.approve(address(adapter), shares);
        uint256 redeemedAssets = adapter.redeem(shares, address(this));

        assertGt(redeemedAssets, 0);
        assertEq(stataUsdc.balanceOf(address(this)), 0);
        assertEq(usdc.balanceOf(address(adapter)), 0);
        assertEq(stataUsdc.balanceOf(address(adapter)), 0);
    }
}
