// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./OpenEscrowCore.sol";
import "./IYieldModule.sol";

/// @title EscrowViewer
/// @notice Read-only helper to retrieve escrow agreement state and yield estimates
contract EscrowViewer {
    OpenEscrowCore public escrow;

    constructor(address _escrow) {
        escrow = OpenEscrowCore(_escrow);
    }

    /// @notice Aggregate data structure returned for front-end dashboards
    struct EscrowInfo {
        address tenant;
        address landlord;
        uint256 amount;
        uint256 releaseTime;
        bool released;
        bool refunded;
        bool readyToRelease;
        uint256 yieldEstimate;
    }

    /// @notice Returns full aggregated state for a given agreement ID
    /// @param agreementId The ID of the escrow agreement to inspect
    function getEscrowInfo(uint256 agreementId) external view returns (EscrowInfo memory info) {
        (
            address tenant,
            address landlord,
            uint256 amount,
            uint256 releaseTime,
            bool released,
            bool refunded,
            address rulesModule,
            address yieldModule
        ) = escrow.agreements(agreementId);

        bool readyToRelease = !released && !refunded && block.timestamp >= releaseTime;

        uint256 yieldEstimate = 0;
        if (yieldModule != address(0)) {
            yieldEstimate = IYieldModule(yieldModule).viewYield(agreementId);
        }

        info = EscrowInfo({
            tenant: tenant,
            landlord: landlord,
            amount: amount,
            releaseTime: releaseTime,
            released: released,
            refunded: refunded,
            readyToRelease: readyToRelease,
            yieldEstimate: yieldEstimate
        });
    }
}
