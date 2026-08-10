// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {OpenEscrow} from "../contracts/OpenEscrow.sol";
import {OperationsReserve} from "../contracts/OperationsReserve.sol";

/// @notice Deploys OpenEscrow with immutable plain and yield-test token allowlist entries.
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
        address yieldToken = vm.envAddress("YIELD_TOKEN_ADDRESS");
        address operationsReserve = vm.envAddress("OPERATIONS_RESERVE_ADDRESS");
        require(token != address(0), "TOKEN_ADDRESS env var not set");
        require(yieldToken != address(0), "YIELD_TOKEN_ADDRESS env var not set");
        require(operationsReserve != address(0), "OPERATIONS_RESERVE_ADDRESS env var not set");
        OperationsReserve reserve = OperationsReserve(operationsReserve);
        require(address(reserve.ESCROW()) == address(0), "OperationsReserve already configured");

        vm.startBroadcast();
        escrow = new OpenEscrow(token, yieldToken, operationsReserve);
        reserve.configureEscrow(address(escrow));
        vm.stopBroadcast();

        console.log("OpenEscrow deployed at:", address(escrow));
        console.log("Pinned token address:  ", token);
        console.log("Yield token address:   ", yieldToken);
        console.log("Operations reserve:    ", operationsReserve);
    }
}
