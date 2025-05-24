// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../contracts/MockYieldModule.sol";

/// @title MockYieldModuleTest
/// @notice Basic unit tests for MockYieldModule
contract MockYieldModuleTest is Test {
    MockYieldModule public mock;
    uint256 constant AGREEMENT_ID = 1;

    function setUp() public {
        mock = new MockYieldModule();
    }

    /// @notice Should return default mocked yield
    function testViewYield_Default() public {
        uint256 yield = mock.viewYield(AGREEMENT_ID);
        assertEq(yield, 0.1 ether);
    }

    /// @notice Should return 50/50 split on claimYield()
    function testClaimYield() public {
        (uint256 tenantShare, uint256 landlordShare) = mock.claimYield(AGREEMENT_ID);

        assertEq(tenantShare, 0.05 ether, "Tenant share should be 0.05 ETH");
        assertEq(landlordShare, 0.05 ether, "Landlord share should be 0.05 ETH");

    }
}
