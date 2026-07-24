// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {OpenEscrow} from "../contracts/OpenEscrow.sol";

/// @notice Deploys OpenEscrow pinned to a single immutable token address (ADR-0002).
///
/// Usage:
///   TOKEN_ADDRESS=0x... forge script script/DeployOpenEscrow.s.sol:DeployOpenEscrow \
///     --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify -vvvv
///
/// TOKEN_ADDRESS must be the Base Sepolia test-USDC contract this deployment will use
/// for every agreement (see docs/adr/0002-single-token-usdc.md) - deliberately not
/// hardcoded here, since pinning the wrong address is unrecoverable (no upgradeability,
/// per spec decision 8).
contract DeployOpenEscrow is Script {
    function run() external returns (OpenEscrow escrow) {
        address token = vm.envAddress("TOKEN_ADDRESS");
        require(token != address(0), "TOKEN_ADDRESS env var not set");

        vm.startBroadcast();
        escrow = new OpenEscrow(token);
        vm.stopBroadcast();

        console.log("OpenEscrow deployed at:", address(escrow));
        console.log("Pinned token address:  ", token);
    }
}
