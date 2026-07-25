// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {OperationsReserve} from "../contracts/OperationsReserve.sol";

/// @notice Deploys only OperationsReserve for the existing Base Sepolia OpenEscrow.
/// @dev This leaves OpenEscrow and all of its agreement IDs untouched.
contract DeployOperationsReserveBaseSepolia is Script {
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84_532;

    function run() external returns (OperationsReserve reserve) {
        require(block.chainid == BASE_SEPOLIA_CHAIN_ID, "Base Sepolia only");

        address escrow = vm.envAddress("ESCROW_ADDRESS");
        address token = vm.envAddress("TOKEN_ADDRESS");
        address yieldToken = vm.envAddress("YIELD_TOKEN_ADDRESS");
        require(escrow != address(0) && escrow.code.length > 0, "invalid ESCROW_ADDRESS");
        require(token != address(0) && token.code.length > 0, "invalid TOKEN_ADDRESS");
        require(yieldToken != address(0) && yieldToken.code.length > 0, "invalid YIELD_TOKEN_ADDRESS");

        vm.startBroadcast();
        reserve = new OperationsReserve(escrow, token, yieldToken);
        vm.stopBroadcast();

        require(address(reserve.ESCROW()) == escrow, "reserve escrow mismatch");
        require(address(reserve.TOKEN()) == token, "reserve plain token mismatch");
        require(address(reserve.YIELD_TOKEN()) == yieldToken, "reserve yield token mismatch");

        console.log("OperationsReserve deployed at:", address(reserve));
        console.log("Existing OpenEscrow preserved:", escrow);
        console.log("Plain reserve token:          ", token);
        console.log("Yield reserve token:          ", yieldToken);
        console.log("Treasury/deployer:            ", reserve.TREASURY());
    }
}
