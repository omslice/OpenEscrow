// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AaveStataTokenAdapter} from "./AaveStataTokenAdapter.sol";

/// @notice Identity-pinned adapter for the official Aave V3 Base Sepolia USDC
///         StataToken V2 deployment recorded by the Aave Address Book.
contract BaseSepoliaAaveUSDCAdapter is AaveStataTokenAdapter {
    uint256 public constant BASE_SEPOLIA_CHAIN_ID = 84_532;
    address public constant USDC = 0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f;
    address public constant A_USDC = 0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC;
    address public constant POOL = 0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27;
    address public constant STATA_USDC = 0xf430cb6E2b85f99222fBFA6dFEa18Ff60FA6B32a;

    constructor() AaveStataTokenAdapter(STATA_USDC, USDC, A_USDC, POOL, BASE_SEPOLIA_CHAIN_ID) {}
}
