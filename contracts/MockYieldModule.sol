// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IYieldModule.sol";

/// @title MockYieldModule
/// @notice Simple mock that simulates a fixed yield value for testing purposes
contract MockYieldModule is IYieldModule {
    /// @notice The amount of yield to simulate (can be updated for different scenarios)
    uint256 public fixedYield = 0.1 ether;

    /// @notice Allows tests to set a new simulated yield value
    /// @param _newYield The new yield amount (in wei)
    function setFixedYield(uint256 _newYield) external {
        fixedYield = _newYield;
    }

    /// @notice Returns the simulated yield for a given agreement
    /// @dev In a real module, this would calculate yield from actual protocol logic
    /// @param agreementId The ID of the escrow agreement (unused in mock)
    function viewYield(uint256 agreementId) external view override returns (uint256) {
        agreementId; // silence unused var warning
        return fixedYield;
    }

    /// @notice Mocks the process of claiming and distributing yield
    /// @dev Returns a 50/50 split between tenant and landlord
    /// @param agreementId The ID of the escrow agreement (unused in mock)
    /// @return tenantShare The amount allocated to the tenant
    /// @return landlordShare The amount allocated to the landlord
    function claimYield(uint256 agreementId) external override returns (uint256 tenantShare, uint256 landlordShare) {
        agreementId; // silence unused var warning
        tenantShare = fixedYield / 2;
        landlordShare = fixedYield / 2;
    }
}
