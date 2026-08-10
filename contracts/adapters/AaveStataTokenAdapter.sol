// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IDepositAssetAdapter} from "../interfaces/IDepositAssetAdapter.sol";

interface IStataTokenIdentity {
    function aToken() external view returns (address);
    function POOL() external view returns (address);
}

interface IATokenIdentity {
    function UNDERLYING_ASSET_ADDRESS() external view returns (address);
    function POOL() external view returns (address);
}

/// @title AaveStataTokenAdapter
/// @notice Fixed-share adapter for an Aave V3 StataToken V2 ERC-4626 vault.
/// @dev Constructor checks pin this adapter to one chain, settlement asset,
///      aToken, Pool, and StataToken identity. It is an experimental boundary
///      for YieldEscrowV2Prototype and has not been audited for real funds.
contract AaveStataTokenAdapter is IDepositAssetAdapter, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC4626 public immutable VAULT;
    IERC20 public immutable SETTLEMENT_ASSET;
    IERC20 public immutable RECEIPT_ASSET;
    address public immutable A_TOKEN;
    address public immutable AAVE_POOL;
    uint256 public immutable EXPECTED_CHAIN_ID;

    error ZeroAddress();
    error InvalidContract(address account);
    error WrongChain(uint256 actualChainId, uint256 expectedChainId);
    error IdentityMismatch();
    error ZeroAmount();
    error InvalidReceiver();
    error DepositUnavailable(uint256 availableAssets, uint256 requiredAssets);
    error RedemptionUnavailable(uint256 availableShares, uint256 requiredShares);
    error TransferMismatch();
    error VaultResultMismatch();

    constructor(
        address stataToken,
        address expectedSettlementAsset,
        address expectedAToken,
        address expectedPool,
        uint256 expectedChainId
    ) {
        if (
            stataToken == address(0) || expectedSettlementAsset == address(0) || expectedAToken == address(0)
                || expectedPool == address(0)
        ) revert ZeroAddress();
        if (block.chainid != expectedChainId) revert WrongChain(block.chainid, expectedChainId);
        _requireContract(stataToken);
        _requireContract(expectedSettlementAsset);
        _requireContract(expectedAToken);
        _requireContract(expectedPool);

        IERC4626 vault = IERC4626(stataToken);
        VAULT = vault;
        SETTLEMENT_ASSET = IERC20(expectedSettlementAsset);
        RECEIPT_ASSET = IERC20(stataToken);
        A_TOKEN = expectedAToken;
        AAVE_POOL = expectedPool;
        EXPECTED_CHAIN_ID = expectedChainId;
        _assertIdentity();
    }

    function settlementAsset() external view returns (address) {
        return address(SETTLEMENT_ASSET);
    }

    function receiptAsset() external view returns (address) {
        return address(RECEIPT_ASSET);
    }

    function maxDeposit(address receiver) external view returns (uint256 settlementAssets) {
        _assertIdentity();
        return VAULT.maxDeposit(receiver);
    }

    function maxRedeem(address owner) external view returns (uint256 receiptShares) {
        _assertIdentity();
        return VAULT.maxRedeem(owner);
    }

    function deposit(uint256 assets, address receiver) external nonReentrant returns (uint256 receiptShares) {
        if (assets == 0) revert ZeroAmount();
        if (receiver == address(0) || receiver == address(this)) revert InvalidReceiver();
        _assertIdentity();

        uint256 availableAssets = VAULT.maxDeposit(receiver);
        if (availableAssets < assets) revert DepositUnavailable(availableAssets, assets);

        uint256 adapterAssetsBefore = SETTLEMENT_ASSET.balanceOf(address(this));
        uint256 adapterSharesBefore = RECEIPT_ASSET.balanceOf(address(this));
        uint256 receiverSharesBefore = RECEIPT_ASSET.balanceOf(receiver);

        SETTLEMENT_ASSET.safeTransferFrom(msg.sender, address(this), assets);
        if (SETTLEMENT_ASSET.balanceOf(address(this)) - adapterAssetsBefore != assets) {
            revert TransferMismatch();
        }

        SETTLEMENT_ASSET.forceApprove(address(VAULT), assets);
        uint256 reportedShares = VAULT.deposit(assets, receiver);
        SETTLEMENT_ASSET.forceApprove(address(VAULT), 0);

        receiptShares = RECEIPT_ASSET.balanceOf(receiver) - receiverSharesBefore;
        if (
            receiptShares == 0 || reportedShares != receiptShares
                || SETTLEMENT_ASSET.balanceOf(address(this)) != adapterAssetsBefore
                || RECEIPT_ASSET.balanceOf(address(this)) != adapterSharesBefore
        ) revert VaultResultMismatch();
    }

    function redeem(uint256 receiptShares, address receiver) external nonReentrant returns (uint256 settlementAssets) {
        if (receiptShares == 0) revert ZeroAmount();
        if (receiver == address(0) || receiver == address(this)) revert InvalidReceiver();
        _assertIdentity();

        uint256 adapterSharesBefore = RECEIPT_ASSET.balanceOf(address(this));
        uint256 adapterAssetsBefore = SETTLEMENT_ASSET.balanceOf(address(this));
        uint256 receiverAssetsBefore = SETTLEMENT_ASSET.balanceOf(receiver);

        RECEIPT_ASSET.safeTransferFrom(msg.sender, address(this), receiptShares);
        if (RECEIPT_ASSET.balanceOf(address(this)) - adapterSharesBefore != receiptShares) {
            revert TransferMismatch();
        }

        uint256 availableShares = VAULT.maxRedeem(address(this));
        if (availableShares < receiptShares) {
            revert RedemptionUnavailable(availableShares, receiptShares);
        }

        uint256 reportedAssets = VAULT.redeem(receiptShares, receiver, address(this));
        settlementAssets = SETTLEMENT_ASSET.balanceOf(receiver) - receiverAssetsBefore;
        if (
            settlementAssets == 0 || reportedAssets != settlementAssets
                || RECEIPT_ASSET.balanceOf(address(this)) != adapterSharesBefore
                || SETTLEMENT_ASSET.balanceOf(address(this)) != adapterAssetsBefore
        ) revert VaultResultMismatch();
    }

    function previewRedeem(uint256 receiptShares) external view returns (uint256 settlementAssets) {
        _assertIdentity();
        return VAULT.previewRedeem(receiptShares);
    }

    function _assertIdentity() private view {
        if (
            block.chainid != EXPECTED_CHAIN_ID || VAULT.asset() != address(SETTLEMENT_ASSET)
                || IStataTokenIdentity(address(VAULT)).aToken() != A_TOKEN
                || IStataTokenIdentity(address(VAULT)).POOL() != AAVE_POOL
                || IATokenIdentity(A_TOKEN).UNDERLYING_ASSET_ADDRESS() != address(SETTLEMENT_ASSET)
                || IATokenIdentity(A_TOKEN).POOL() != AAVE_POOL
        ) revert IdentityMismatch();
    }

    function _requireContract(address account) private view {
        if (account.code.length == 0) revert InvalidContract(account);
    }
}
