// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {OperationsReserve} from "../contracts/OperationsReserve.sol";

contract DeployOperationsReserve is Script {
    function run() external returns (OperationsReserve reserve) {
        address token = vm.envAddress("TOKEN_ADDRESS");
        require(token != address(0), "TOKEN_ADDRESS env var not set");

        vm.startBroadcast();
        reserve = new OperationsReserve(token);
        vm.stopBroadcast();

        console.log("OperationsReserve deployed at:", address(reserve));
        console.log("Reserve token address:        ", token);
        console.log("Treasury address:             ", reserve.TREASURY());
        console.log("Reserve amount:               ", reserve.RESERVE_AMOUNT());
    }
}
