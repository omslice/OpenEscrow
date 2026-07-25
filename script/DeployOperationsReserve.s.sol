// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {OperationsReserve} from "../contracts/OperationsReserve.sol";

contract DeployOperationsReserve is Script {
    function run() external returns (OperationsReserve reserve) {
        address escrow = vm.envAddress("ESCROW_ADDRESS");
        address token = vm.envAddress("TOKEN_ADDRESS");
        address yieldToken = vm.envAddress("YIELD_TOKEN_ADDRESS");
        require(escrow != address(0), "ESCROW_ADDRESS env var not set");
        require(token != address(0), "TOKEN_ADDRESS env var not set");
        require(yieldToken != address(0), "YIELD_TOKEN_ADDRESS env var not set");

        vm.startBroadcast();
        reserve = new OperationsReserve(escrow, token, yieldToken);
        vm.stopBroadcast();

        console.log("OperationsReserve deployed at:", address(reserve));
        console.log("OpenEscrow address:           ", escrow);
        console.log("Plain reserve token:          ", token);
        console.log("Yield reserve token:          ", yieldToken);
        console.log("Treasury address:             ", reserve.TREASURY());
        console.log("Reserve amount:               ", reserve.RESERVE_AMOUNT());
    }
}
