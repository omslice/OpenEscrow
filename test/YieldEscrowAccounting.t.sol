// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {YieldEscrowAccounting} from "../contracts/libraries/YieldEscrowAccounting.sol";

contract YieldEscrowAccountingTest is Test {
    uint256 internal constant PRINCIPAL = 1_000e6;

    function test_positiveYieldBelongsEntirelyToTenant() public pure {
        YieldEscrowAccounting.Distribution memory result = YieldEscrowAccounting.allocate(PRINCIPAL, 250e6, 1_100e6);

        assertEq(result.landlordAssets, 250e6);
        assertEq(result.tenantAssets, 850e6);
        assertEq(result.yieldToTenant, 100e6);
        assertEq(result.principalLoss, 0);
    }

    function test_noClaimReturnsPrincipalAndYieldToTenant() public pure {
        YieldEscrowAccounting.Distribution memory result = YieldEscrowAccounting.allocate(PRINCIPAL, 0, 1_125e6);

        assertEq(result.landlordAssets, 0);
        assertEq(result.tenantAssets, 1_125e6);
        assertEq(result.yieldToTenant, 125e6);
        assertEq(result.principalLoss, 0);
    }

    function test_fullPrincipalAwardDoesNotTransferYieldToLandlord() public pure {
        YieldEscrowAccounting.Distribution memory result = YieldEscrowAccounting.allocate(PRINCIPAL, PRINCIPAL, 1_100e6);

        assertEq(result.landlordAssets, PRINCIPAL);
        assertEq(result.tenantAssets, 100e6);
        assertEq(result.yieldToTenant, 100e6);
        assertEq(result.principalLoss, 0);
    }

    function test_principalLossIsAllocatedProRata() public pure {
        YieldEscrowAccounting.Distribution memory result = YieldEscrowAccounting.allocate(PRINCIPAL, 250e6, 800e6);

        assertEq(result.landlordAssets, 200e6);
        assertEq(result.tenantAssets, 600e6);
        assertEq(result.yieldToTenant, 0);
        assertEq(result.principalLoss, 200e6);
    }

    function test_roundingRemainderStaysWithTenant() public pure {
        YieldEscrowAccounting.Distribution memory result = YieldEscrowAccounting.allocate(3, 1, 2);

        assertEq(result.landlordAssets, 0);
        assertEq(result.tenantAssets, 2);
        assertEq(result.landlordAssets + result.tenantAssets, 2);
    }

    function test_zeroRedemptionConservesAssets() public pure {
        YieldEscrowAccounting.Distribution memory result = YieldEscrowAccounting.allocate(PRINCIPAL, 400e6, 0);

        assertEq(result.landlordAssets, 0);
        assertEq(result.tenantAssets, 0);
        assertEq(result.principalLoss, PRINCIPAL);
    }

    function test_revertsWhenAwardExceedsPrincipal() public {
        vm.expectRevert(YieldEscrowAccounting.InvalidLandlordPrincipal.selector);
        this.allocate(PRINCIPAL, PRINCIPAL + 1, PRINCIPAL);
    }

    function test_revertsForZeroPrincipal() public {
        vm.expectRevert(YieldEscrowAccounting.ZeroPrincipal.selector);
        this.allocate(0, 0, 0);
    }

    function testFuzz_distributionAlwaysConservesRedeemedAssets(
        uint128 principalSeed,
        uint128 landlordSeed,
        uint128 redeemedSeed
    ) public pure {
        uint256 principal = bound(uint256(principalSeed), 1, type(uint128).max);
        uint256 landlordPrincipal = bound(uint256(landlordSeed), 0, principal);
        uint256 redeemedAssets = uint256(redeemedSeed);

        YieldEscrowAccounting.Distribution memory result =
            YieldEscrowAccounting.allocate(principal, landlordPrincipal, redeemedAssets);

        assertEq(result.landlordAssets + result.tenantAssets, redeemedAssets);
        assertLe(result.landlordAssets, landlordPrincipal);
        if (redeemedAssets >= principal) {
            assertEq(result.landlordAssets, landlordPrincipal);
            assertEq(result.yieldToTenant, redeemedAssets - principal);
            assertEq(result.principalLoss, 0);
        } else {
            assertEq(result.yieldToTenant, 0);
            assertEq(result.principalLoss, principal - redeemedAssets);
        }
    }

    function allocate(uint256 principal, uint256 landlordPrincipal, uint256 redeemedAssets)
        external
        pure
        returns (YieldEscrowAccounting.Distribution memory)
    {
        return YieldEscrowAccounting.allocate(principal, landlordPrincipal, redeemedAssets);
    }
}
