// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title YieldEscrowAccounting
/// @notice Pure settlement allocation for a future yield-enabled escrow.
/// @dev Claims remain principal-denominated. Positive yield belongs entirely to
///      tenants. If redemption returns less than principal, the loss is shared
///      pro rata between the principal beneficiaries, with rounding assigned to
///      the tenant. This library is not wired into the deployed MVP.
library YieldEscrowAccounting {
    error ZeroPrincipal();
    error InvalidLandlordPrincipal();

    struct Distribution {
        uint256 landlordAssets;
        uint256 tenantAssets;
        uint256 yieldToTenant;
        uint256 principalLoss;
    }

    /// @param principal Original settlement-asset principal.
    /// @param landlordPrincipal Final principal-denominated landlord award.
    /// @param redeemedAssets Actual settlement assets received from redemption.
    function allocate(uint256 principal, uint256 landlordPrincipal, uint256 redeemedAssets)
        internal
        pure
        returns (Distribution memory distribution)
    {
        if (principal == 0) revert ZeroPrincipal();
        if (landlordPrincipal > principal) revert InvalidLandlordPrincipal();

        if (redeemedAssets >= principal) {
            distribution.landlordAssets = landlordPrincipal;
            distribution.tenantAssets = redeemedAssets - landlordPrincipal;
            distribution.yieldToTenant = redeemedAssets - principal;
            return distribution;
        }

        distribution.landlordAssets = Math.mulDiv(redeemedAssets, landlordPrincipal, principal);
        distribution.tenantAssets = redeemedAssets - distribution.landlordAssets;
        distribution.principalLoss = principal - redeemedAssets;
    }
}
