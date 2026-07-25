// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {MockYieldUSDC} from "../contracts/MockYieldUSDC.sol";

contract DeployMockYieldUSDC is Script {
    function run() external returns (MockYieldUSDC token) {
        vm.startBroadcast();
        token = new MockYieldUSDC();
        vm.stopBroadcast();
        console.log("MockYieldUSDC deployed at:", address(token));
    }
}
