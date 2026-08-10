// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockYieldUSDC
/// @notice Legacy test-only yield-bearing share token retained to verify the retired
///         Base Sepolia cohort. New deployments use TestAaveUSDC instead. Share balances are fixed while their
///         displayed testUSDC value grows linearly at 20% per day.
/// @dev There is no underlying asset or redemption mechanism. This contract exists
///      only to exercise yield-aware escrow UX on Base Sepolia.
contract MockYieldUSDC is ERC20 {
    uint256 public constant ONE = 1e18;
    uint256 public constant YIELD_PER_DAY = 0.2e18;
    uint256 public immutable launchedAt;

    constructor() ERC20("Yield-Bearing Test USDC", "ytUSDC") {
        launchedAt = block.timestamp;
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Freely mints test shares. These tokens have no monetary value.
    function mint(address to, uint256 shares) external {
        _mint(to, shares);
    }

    function valueIndex() public view returns (uint256) {
        return valueIndexAt(block.timestamp);
    }

    function valueIndexAt(uint256 timestamp) public view returns (uint256) {
        if (timestamp <= launchedAt) return ONE;
        return ONE + ((timestamp - launchedAt) * YIELD_PER_DAY) / 1 days;
    }

    function convertToAssets(uint256 shares) external view returns (uint256) {
        return (shares * valueIndex()) / ONE;
    }

    function convertToAssetsAt(uint256 shares, uint256 timestamp) external view returns (uint256) {
        return (shares * valueIndexAt(timestamp)) / ONE;
    }
}
