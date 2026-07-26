// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {BaseSepoliaAaveUSDCAdapter} from "../contracts/adapters/BaseSepoliaAaveUSDCAdapter.sol";
import {YieldEscrowV2Prototype} from "../contracts/experimental/YieldEscrowV2Prototype.sol";

/// @notice Reproducible Base Sepolia deployment for the experimental Aave-backed V2.
/// @dev This script never reads a raw private key. It is intentionally separate
///      from the deployed MVP and must not be used with real funds.
contract DeployYieldEscrowV2BaseSepolia is Script {
    function run() external returns (BaseSepoliaAaveUSDCAdapter adapter, YieldEscrowV2Prototype prototype) {
        require(block.chainid == 84_532, "Base Sepolia only");

        vm.startBroadcast();
        adapter = new BaseSepoliaAaveUSDCAdapter();
        prototype = new YieldEscrowV2Prototype(address(adapter));
        vm.stopBroadcast();

        require(prototype.ADAPTER() == adapter, "adapter mismatch");
        require(address(prototype.SETTLEMENT_ASSET()) == adapter.USDC(), "settlement asset mismatch");
        require(address(prototype.RECEIPT_ASSET()) == adapter.STATA_USDC(), "receipt asset mismatch");

        console.log("Base Sepolia Aave USDC adapter:", address(adapter));
        console.log("Yield escrow V2 prototype:    ", address(prototype));
        console.log("Settlement USDC:              ", adapter.USDC());
        console.log("Aave StataToken shares:       ", adapter.STATA_USDC());
    }
}
