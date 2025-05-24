// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title IYieldModule
/// @notice Interface for pluggable yield modules in OpenEscrow
/// @dev Allows OpenEscrow to integrate external yield strategies (e.g., Aave, Compound, mock)
interface IYieldModule {
    /**
     * @notice View the yield generated for a given escrow agreement
     * @dev This is a read-only function that does not modify state.
     * @param agreementId The ID of the escrow agreement
     * @return The amount of yield available (in wei)
     */
    function viewYield(uint256 agreementId) external view returns (uint256);

    /**
     * @notice Claims yield and returns the split between tenant and landlord
     * @dev Actual split logic is handled inside the yield module implementation
     * @param agreementId The ID of the escrow agreement
     * @return tenantShare The amount to be sent to the tenant
     * @return landlordShare The amount to be sent to the landlord
     */
    function claimYield(uint256 agreementId) external returns (uint256 tenantShare, uint256 landlordShare);
}
