// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {OpenEscrow} from "../contracts/OpenEscrow.sol";
import {OperationsReserve} from "../contracts/OperationsReserve.sol";
import {AgreementActivityRegistry} from "../contracts/AgreementActivityRegistry.sol";
import {TestUSDC} from "../contracts/TestUSDC.sol";
import {TestAaveUSDC} from "../contracts/TestAaveUSDC.sol";

/// @notice Deploys the matching test-token and OpenEscrow cohort to Base Sepolia.
/// @dev Signing is deliberately left to Foundry's CLI account/keystore support. This
///      script never reads a raw private key from an environment variable.
contract DeployBaseSepolia is Script {
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84_532;

    function run()
        external
        returns (
            TestUSDC token,
            TestAaveUSDC yieldToken,
            OpenEscrow escrow,
            OperationsReserve reserve,
            AgreementActivityRegistry registry
        )
    {
        require(block.chainid == BASE_SEPOLIA_CHAIN_ID, "Base Sepolia only");

        vm.startBroadcast();
        token = new TestUSDC();
        yieldToken = new TestAaveUSDC(address(token));
        reserve = new OperationsReserve(address(token), address(yieldToken));
        escrow = new OpenEscrow(address(token), address(yieldToken), address(reserve));
        reserve.configureEscrow(address(escrow));
        registry = new AgreementActivityRegistry(address(escrow));
        vm.stopBroadcast();

        require(address(escrow.TOKEN()) == address(token), "escrow token mismatch");
        require(address(escrow.YIELD_TOKEN()) == address(yieldToken), "escrow yield token mismatch");
        require(address(yieldToken.SETTLEMENT_ASSET()) == address(token), "yield settlement asset mismatch");
        require(escrow.OPERATIONS_RESERVE() == address(reserve), "escrow reserve mismatch");
        require(address(reserve.ESCROW()) == address(escrow), "reserve escrow mismatch");
        require(address(reserve.TOKEN()) == address(token), "reserve token mismatch");
        require(address(reserve.YIELD_TOKEN()) == address(yieldToken), "reserve yield token mismatch");
        require(address(registry.ESCROW()) == address(escrow), "registry escrow mismatch");

        console.log("TestUSDC deployed at:          ", address(token));
        console.log("TestAaveUSDC deployed at:      ", address(yieldToken));
        console.log("OpenEscrow deployed at:       ", address(escrow));
        console.log("OperationsReserve deployed at:", address(reserve));
        console.log("ActivityRegistry deployed at: ", address(registry));
        console.log("Reserve treasury/deployer:    ", reserve.TREASURY());
    }
}
