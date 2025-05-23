// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title IRulesModule
/// @notice Interface for external rule modules that validate whether funds can be released
interface IRulesModule {
    /// @notice Called before releasing funds
    /// @param agreementId The ID of the escrow agreement
    /// @return approved True if release is allowed, false otherwise
    function validateRelease(uint256 agreementId) external view returns (bool approved);
}
