// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title OpenEscrow Test USDC
/// @notice Freely mintable, fixed-value test token for Base Sepolia demonstrations.
/// @dev This token has no issuer, reserves, redemption right, or monetary value.
contract TestUSDC is ERC20 {
    constructor() ERC20("OpenEscrow Test USDC", "testUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
