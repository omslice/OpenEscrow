// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {OpenEscrow} from "../contracts/OpenEscrow.sol";
import {OperationsReserve} from "../contracts/OperationsReserve.sol";
import {AgreementActivityRegistry} from "../contracts/AgreementActivityRegistry.sol";

/// @notice Deploys the matching OpenEscrow and OperationsReserve release to Base Sepolia.
/// @dev Signing is deliberately left to Foundry's CLI account/keystore support. This
///      script never reads a raw private key from an environment variable.
contract DeployBaseSepolia is Script {
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84_532;

    function run() external returns (OpenEscrow escrow, OperationsReserve reserve, AgreementActivityRegistry registry) {
        require(block.chainid == BASE_SEPOLIA_CHAIN_ID, "Base Sepolia only");

        address token = vm.envAddress("TOKEN_ADDRESS");
        address yieldToken = vm.envAddress("YIELD_TOKEN_ADDRESS");
        require(token != address(0) && token.code.length > 0, "invalid TOKEN_ADDRESS");
        require(yieldToken != address(0) && yieldToken.code.length > 0, "invalid YIELD_TOKEN_ADDRESS");

        vm.startBroadcast();
        reserve = new OperationsReserve(token, yieldToken);
        escrow = new OpenEscrow(token, yieldToken, address(reserve));
        reserve.configureEscrow(address(escrow));
        registry = new AgreementActivityRegistry(address(escrow));
        vm.stopBroadcast();

        require(address(escrow.TOKEN()) == token, "escrow token mismatch");
        require(address(escrow.YIELD_TOKEN()) == yieldToken, "escrow yield token mismatch");
        require(escrow.OPERATIONS_RESERVE() == address(reserve), "escrow reserve mismatch");
        require(address(reserve.ESCROW()) == address(escrow), "reserve escrow mismatch");
        require(address(reserve.TOKEN()) == token, "reserve token mismatch");
        require(address(reserve.YIELD_TOKEN()) == yieldToken, "reserve yield token mismatch");
        require(address(registry.ESCROW()) == address(escrow), "registry escrow mismatch");

        console.log("OpenEscrow deployed at:       ", address(escrow));
        console.log("OperationsReserve deployed at:", address(reserve));
        console.log("ActivityRegistry deployed at: ", address(registry));
        console.log("Plain token:                  ", token);
        console.log("Yield token:                  ", yieldToken);
        console.log("Reserve treasury/deployer:    ", reserve.TREASURY());
    }
}
