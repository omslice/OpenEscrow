// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IRulesModule.sol";

/// @title MockRulesModule
/// @notice Simple mock rules module to simulate validation logic
contract MockRulesModule is IRulesModule {
    bool public allowRelease = true;

    /// @notice Simulate validation outcome
    function validateRelease(uint256) external view override returns (bool) {
        return allowRelease;
    }

    /// @notice Allow toggling the behavior for test purposes
    function setAllowRelease(bool _value) external {
        allowRelease = _value;
    }
}

