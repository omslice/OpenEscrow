// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {AgreementActivityRegistry} from "../contracts/AgreementActivityRegistry.sol";

contract DeployAgreementActivityRegistry is Script {
    function run() external returns (AgreementActivityRegistry registry) {
        address escrow = vm.envAddress("ESCROW_ADDRESS");
        require(escrow != address(0), "ESCROW_ADDRESS env var not set");

        vm.startBroadcast();
        registry = new AgreementActivityRegistry(escrow);
        vm.stopBroadcast();

        console.log("AgreementActivityRegistry deployed at:", address(registry));
        console.log("OpenEscrow address:                  ", escrow);
    }
}
