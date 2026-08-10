// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IDepositAssetAdapter
/// @notice Experimental boundary between a future escrow controller and a
///         yield strategy. This interface is not used by the deployed MVP.
/// @dev Implementations MUST return fixed, non-rebasing receipt shares. A
///      rebasing token such as an aToken cannot be used directly because a
///      shared escrow must be able to attribute every share to one agreement.
interface IDepositAssetAdapter {
    /// @notice The stable settlement asset accepted and returned by the adapter.
    function settlementAsset() external view returns (address);

    /// @notice The fixed, non-rebasing share token used for internal accounting.
    function receiptAsset() external view returns (address);

    /// @notice Maximum settlement assets currently accepted for `receiver`.
    /// @dev A zero value means deposits are temporarily unavailable.
    function maxDeposit(address receiver) external view returns (uint256 settlementAssets);

    /// @notice Maximum receipt shares currently redeemable by `owner`.
    /// @dev This may be lower than the owner's balance during a pause or a
    ///      strategy-liquidity shortage.
    function maxRedeem(address owner) external view returns (uint256 receiptShares);

    /// @notice Deposits settlement assets and sends receipt shares to `receiver`.
    /// @dev The adapter pulls `assets` from msg.sender. A successful call must
    ///      not leave unaccounted settlement assets in the adapter.
    function deposit(uint256 assets, address receiver) external returns (uint256 receiptShares);

    /// @notice Redeems receipt shares and sends settlement assets to `receiver`.
    /// @dev The adapter pulls `receiptShares` from msg.sender. The caller must
    ///      verify the receiver's actual settlement-asset balance delta.
    function redeem(uint256 receiptShares, address receiver) external returns (uint256 settlementAssets);

    /// @notice Estimates settlement assets for a receipt-share amount.
    /// @dev This is a quote only. Distribution must use the actual balance delta
    ///      observed after redemption, never this preview.
    function previewRedeem(uint256 receiptShares) external view returns (uint256 settlementAssets);
}
