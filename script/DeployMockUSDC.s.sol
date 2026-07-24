// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../test/mocks/MockUSDC.sol";

/// @notice Optional: deploys a freely-mintable 6-decimal test token, for demos that
///         don't want to depend on Circle's Base Sepolia USDC faucet. The resulting
///         address is what you'd pass as TOKEN_ADDRESS to DeployOpenEscrow.s.sol.
/// @dev This is a convenience utility, not part of the audited MVP contract surface -
///      real deployments should use a real (test or mainnet) USDC per ADR-0002.
contract DeployMockUSDC is Script {
    function run() external returns (MockUSDC token) {
        vm.startBroadcast();
        token = new MockUSDC();
        vm.stopBroadcast();

        console.log("MockUSDC deployed at:", address(token));
    }
}
