// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {AgreementActivityRegistry} from "../contracts/AgreementActivityRegistry.sol";

contract DeployAgreementActivityRegistry is Script {
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84_532;

    function run() external returns (AgreementActivityRegistry registry) {
        require(block.chainid == BASE_SEPOLIA_CHAIN_ID, "Base Sepolia only");
        address escrow = vm.envAddress("ESCROW_ADDRESS");
        require(escrow != address(0) && escrow.code.length > 0, "invalid ESCROW_ADDRESS");

        vm.startBroadcast();
        registry = new AgreementActivityRegistry(escrow);
        vm.stopBroadcast();

        require(address(registry.ESCROW()) == escrow, "registry escrow mismatch");
        console.log("AgreementActivityRegistry deployed at:", address(registry));
        console.log("OpenEscrow address:                  ", escrow);
    }
}
