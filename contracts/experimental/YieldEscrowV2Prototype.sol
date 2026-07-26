// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IDepositAssetAdapter} from "../interfaces/IDepositAssetAdapter.sol";
import {YieldEscrowAccounting} from "../libraries/YieldEscrowAccounting.sol";

/// @title YieldEscrowV2Prototype
/// @notice Isolated strategy-settlement prototype for Base Sepolia development.
/// @dev This is not a replacement for OpenEscrow and MUST NOT hold real funds.
///      CLAIM_RESOLVER stands in for the existing claim state machine so this
///      prototype can prove strategy accounting without duplicating that logic.
contract YieldEscrowV2Prototype is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Phase {
        None,
        Proposed,
        Funded,
        Settled,
        Distributed
    }

    struct Agreement {
        address landlord;
        address tenant;
        Phase phase;
        uint64 settlementTime;
        uint256 principal;
        uint256 receiptShares;
        uint256 redeemedAssets;
        uint256 landlordPrincipal;
        uint256 landlordWithdrawable;
        uint256 tenantWithdrawable;
    }

    IDepositAssetAdapter public immutable ADAPTER;
    IERC20 public immutable SETTLEMENT_ASSET;
    IERC20 public immutable RECEIPT_ASSET;
    address public immutable CLAIM_RESOLVER;

    uint256 public nextAgreementId;
    mapping(uint256 => Agreement) public agreements;

    event AgreementCreated(
        uint256 indexed id, address indexed landlord, address indexed tenant, uint256 principal, uint64 settlementTime
    );
    event AgreementFunded(uint256 indexed id, uint256 principal, uint256 receiptShares);
    event StrategySettled(uint256 indexed id, uint256 receiptShares, uint256 redeemedAssets);
    event DistributionFinalized(
        uint256 indexed id,
        uint256 landlordPrincipal,
        uint256 landlordAssets,
        uint256 tenantAssets,
        uint256 yieldToTenant,
        uint256 principalLoss
    );
    event Withdrawn(uint256 indexed id, address indexed recipient, uint256 assets);

    error ZeroAddress();
    error ZeroPrincipal();
    error InvalidSettlementTime();
    error AgreementDoesNotExist();
    error InvalidPhase();
    error NotAuthorized();
    error AssetMismatch();
    error DepositMismatch();
    error RedemptionMismatch();
    error MinimumAssetsNotMet();
    error NothingToWithdraw();

    constructor(address adapter, address claimResolver) {
        if (adapter == address(0) || claimResolver == address(0)) revert ZeroAddress();
        if (adapter.code.length == 0) revert ZeroAddress();

        address settlementAsset = IDepositAssetAdapter(adapter).settlementAsset();
        address receiptAsset = IDepositAssetAdapter(adapter).receiptAsset();
        if (settlementAsset == address(0) || receiptAsset == address(0) || settlementAsset == receiptAsset) {
            revert AssetMismatch();
        }
        if (settlementAsset.code.length == 0 || receiptAsset.code.length == 0) revert AssetMismatch();

        ADAPTER = IDepositAssetAdapter(adapter);
        SETTLEMENT_ASSET = IERC20(settlementAsset);
        RECEIPT_ASSET = IERC20(receiptAsset);
        CLAIM_RESOLVER = claimResolver;
    }

    function createAgreement(address tenant, uint256 principal, uint64 settlementTime) external returns (uint256 id) {
        if (tenant == address(0)) revert ZeroAddress();
        if (tenant == msg.sender) revert NotAuthorized();
        if (principal == 0) revert ZeroPrincipal();
        if (settlementTime <= block.timestamp) revert InvalidSettlementTime();

        id = nextAgreementId++;
        agreements[id] = Agreement({
            landlord: msg.sender,
            tenant: tenant,
            phase: Phase.Proposed,
            settlementTime: settlementTime,
            principal: principal,
            receiptShares: 0,
            redeemedAssets: 0,
            landlordPrincipal: 0,
            landlordWithdrawable: 0,
            tenantWithdrawable: 0
        });

        emit AgreementCreated(id, msg.sender, tenant, principal, settlementTime);
    }

    /// @notice Tenant approval is expressed by funding the proposed agreement.
    function fund(uint256 id) external nonReentrant {
        Agreement storage agreement = _agreement(id);
        if (agreement.phase != Phase.Proposed) revert InvalidPhase();
        if (msg.sender != agreement.tenant) revert NotAuthorized();
        if (block.timestamp >= agreement.settlementTime) revert InvalidSettlementTime();

        uint256 settlementBefore = SETTLEMENT_ASSET.balanceOf(address(this));
        SETTLEMENT_ASSET.safeTransferFrom(msg.sender, address(this), agreement.principal);
        if (SETTLEMENT_ASSET.balanceOf(address(this)) - settlementBefore != agreement.principal) {
            revert DepositMismatch();
        }

        uint256 receiptBefore = RECEIPT_ASSET.balanceOf(address(this));
        SETTLEMENT_ASSET.forceApprove(address(ADAPTER), agreement.principal);
        uint256 reportedShares = ADAPTER.deposit(agreement.principal, address(this));
        SETTLEMENT_ASSET.forceApprove(address(ADAPTER), 0);

        uint256 receivedShares = RECEIPT_ASSET.balanceOf(address(this)) - receiptBefore;
        if (
            receivedShares == 0 || reportedShares != receivedShares
                || SETTLEMENT_ASSET.balanceOf(address(this)) != settlementBefore
        ) {
            revert DepositMismatch();
        }

        agreement.receiptShares = receivedShares;
        agreement.phase = Phase.Funded;
        emit AgreementFunded(id, agreement.principal, receivedShares);
    }

    /// @notice Permissionlessly redeems one agreement after its settlement time.
    /// @dev `minAssetsOut` is supplied by the transaction submitter. A production
    ///      design must define how the minimum is derived and how stale quotes expire.
    function settleStrategy(uint256 id, uint256 minAssetsOut) external nonReentrant {
        Agreement storage agreement = _agreement(id);
        if (agreement.phase != Phase.Funded) revert InvalidPhase();
        if (block.timestamp < agreement.settlementTime) revert InvalidSettlementTime();

        uint256 receiptShares = agreement.receiptShares;
        uint256 receiptBefore = RECEIPT_ASSET.balanceOf(address(this));
        uint256 settlementBefore = SETTLEMENT_ASSET.balanceOf(address(this));

        agreement.receiptShares = 0;
        agreement.phase = Phase.Settled;

        RECEIPT_ASSET.forceApprove(address(ADAPTER), receiptShares);
        uint256 reportedAssets = ADAPTER.redeem(receiptShares, address(this));
        RECEIPT_ASSET.forceApprove(address(ADAPTER), 0);

        uint256 redeemedAssets = SETTLEMENT_ASSET.balanceOf(address(this)) - settlementBefore;
        if (reportedAssets != redeemedAssets || receiptBefore - RECEIPT_ASSET.balanceOf(address(this)) != receiptShares)
        {
            revert RedemptionMismatch();
        }
        if (redeemedAssets < minAssetsOut) revert MinimumAssetsNotMet();

        agreement.redeemedAssets = redeemedAssets;
        emit StrategySettled(id, receiptShares, redeemedAssets);
    }

    /// @notice Applies the final principal award produced by a future claim resolver.
    function finalizeDistribution(uint256 id, uint256 landlordPrincipal) external {
        Agreement storage agreement = _agreement(id);
        if (agreement.phase != Phase.Settled) revert InvalidPhase();
        if (msg.sender != CLAIM_RESOLVER) revert NotAuthorized();

        YieldEscrowAccounting.Distribution memory distribution =
            YieldEscrowAccounting.allocate(agreement.principal, landlordPrincipal, agreement.redeemedAssets);

        agreement.landlordPrincipal = landlordPrincipal;
        agreement.landlordWithdrawable = distribution.landlordAssets;
        agreement.tenantWithdrawable = distribution.tenantAssets;
        agreement.phase = Phase.Distributed;

        emit DistributionFinalized(
            id,
            landlordPrincipal,
            distribution.landlordAssets,
            distribution.tenantAssets,
            distribution.yieldToTenant,
            distribution.principalLoss
        );
    }

    function withdraw(uint256 id) external nonReentrant {
        Agreement storage agreement = _agreement(id);
        if (agreement.phase != Phase.Distributed) revert InvalidPhase();

        uint256 assets;
        if (msg.sender == agreement.tenant) {
            assets = agreement.tenantWithdrawable;
            agreement.tenantWithdrawable = 0;
        } else if (msg.sender == agreement.landlord) {
            assets = agreement.landlordWithdrawable;
            agreement.landlordWithdrawable = 0;
        } else {
            revert NotAuthorized();
        }
        if (assets == 0) revert NothingToWithdraw();

        SETTLEMENT_ASSET.safeTransfer(msg.sender, assets);
        emit Withdrawn(id, msg.sender, assets);
    }

    function getAgreement(uint256 id) external view returns (Agreement memory) {
        return _agreement(id);
    }

    function _agreement(uint256 id) internal view returns (Agreement storage agreement) {
        agreement = agreements[id];
        if (agreement.phase == Phase.None) revert AgreementDoesNotExist();
    }
}
