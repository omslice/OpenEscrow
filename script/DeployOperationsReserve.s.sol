// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {OperationsReserve} from "../contracts/OperationsReserve.sol";

contract DeployOperationsReserve is Script {
    function run() external returns (OperationsReserve reserve) {
        address token = vm.envAddress("TOKEN_ADDRESS");
        address yieldToken = vm.envAddress("YIELD_TOKEN_ADDRESS");
        require(token != address(0), "TOKEN_ADDRESS env var not set");
        require(yieldToken != address(0), "YIELD_TOKEN_ADDRESS env var not set");

        vm.startBroadcast();
        reserve = new OperationsReserve(token, yieldToken);
        vm.stopBroadcast();

        console.log("OperationsReserve deployed at:", address(reserve));
        console.log("OpenEscrow address:            not configured");
        console.log("Plain reserve token:          ", token);
        console.log("Yield reserve token:          ", yieldToken);
        console.log("Treasury address:             ", reserve.TREASURY());
        console.log("Reserve amount:               ", reserve.RESERVE_AMOUNT());
        console.log("Next: deploy OpenEscrow with this reserve address.");
    }
}
