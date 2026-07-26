// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IDepositAssetAdapter} from "../interfaces/IDepositAssetAdapter.sol";
import {YieldEscrowAccounting} from "../libraries/YieldEscrowAccounting.sol";

/// @title YieldEscrowV2Prototype
/// @notice Isolated multi-tenant yield escrow prototype for Base Sepolia development.
/// @dev This is not a replacement for OpenEscrow and MUST NOT hold real funds.
///      It intentionally omits production evidence, adapter governance, emergency
///      migration, and arbiter-replacement features while their designs are reviewed.
contract YieldEscrowV2Prototype is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Phase {
        None,
        Proposed,
        Funded,
        ClaimWindow,
        ClaimOpen,
        Disputed,
        ResolvedPendingStrategy,
        Distributed,
        Cancelled
    }

    enum CloseReason {
        None,
        NoClaim,
        ClaimRetracted,
        Settled,
        ResolvedByArbiter,
        ResolvedByTimeout,
        ProposalCancelled
    }

    struct Agreement {
        address landlord;
        address arbiter;
        Phase phase;
        CloseReason closeReason;
        bool claimAmended;
        bool strategySettled;
        uint64 fundingDeadline;
        uint64 settlementTime;
        uint64 claimSubmissionDeadline;
        uint64 responsePeriod;
        uint64 arbiterRulingPeriod;
        uint64 responseDeadline;
        uint64 arbiterRulingDeadline;
        uint256 principal;
        uint256 fundedPrincipal;
        uint256 receiptShares;
        uint256 redeemedAssets;
        uint256 claimedPrincipal;
        uint256 acceptedPrincipal;
        uint256 landlordPrincipal;
        uint256 landlordWithdrawable;
        uint256 tenantWithdrawable;
        uint256 withdrawnAssets;
    }

    struct AgreementInput {
        address arbiter;
        uint256 principal;
        uint64 fundingDeadline;
        uint64 settlementTime;
        uint64 claimPeriod;
        uint64 responsePeriod;
        uint64 arbiterRulingPeriod;
    }

    IDepositAssetAdapter public immutable ADAPTER;
    IERC20 public immutable SETTLEMENT_ASSET;
    IERC20 public immutable RECEIPT_ASSET;

    uint16 public constant TOTAL_BPS = 10_000;
    uint256 public constant MAX_TENANTS = 10;
    uint64 public constant MIN_PERIOD = 5 minutes;
    uint64 public constant MAX_PERIOD = 365 days;
    uint64 public constant MAX_SETTLEMENT_OFFSET = 3650 days;

    uint256 public nextAgreementId;
    mapping(uint256 => Agreement) public agreements;
    mapping(uint256 => address[]) private _tenants;
    mapping(uint256 => mapping(address => uint16)) public tenantShareBps;
    mapping(uint256 => mapping(address => uint256)) public tenantContribution;
    mapping(uint256 => mapping(address => uint256)) public tenantWithdrawableByAddress;
    mapping(uint256 => mapping(address => bool)) public tenantClaimResponded;
    mapping(uint256 => mapping(address => uint256)) public tenantAcceptedClaimPrincipal;
    mapping(uint256 => uint256) public claimResponseCount;
    mapping(uint256 => uint256) public minimumAcceptedClaimPrincipal;

    event AgreementCreated(
        uint256 indexed id,
        address indexed landlord,
        address indexed primaryTenant,
        address arbiter,
        uint256 principal,
        uint64 fundingDeadline,
        uint64 settlementTime,
        uint64 claimSubmissionDeadline
    );
    event TenantParticipantAdded(uint256 indexed id, address indexed tenant, uint16 shareBps);
    event TenantShareFunded(uint256 indexed id, address indexed tenant, uint256 principal, uint256 totalFunded);
    event AgreementFunded(uint256 indexed id, uint256 principal, uint256 receiptShares);
    event ProposalCancelled(uint256 indexed id, uint256 principalRefunded);
    event StrategySettled(uint256 indexed id, uint256 receiptShares, uint256 redeemedAssets);
    event ClaimSubmitted(uint256 indexed id, uint256 claimedPrincipal, uint64 responseDeadline);
    event ClaimAmended(uint256 indexed id, uint256 claimedPrincipal);
    event TenantClaimResponseRecorded(
        uint256 indexed id,
        address indexed tenant,
        uint256 acceptedPrincipal,
        uint256 responseCount,
        uint256 requiredResponseCount
    );
    event DisputeCreated(
        uint256 indexed id, uint256 acceptedPrincipal, uint256 disputedPrincipal, uint64 arbiterRulingDeadline
    );
    event DistributionFinalized(
        uint256 indexed id,
        CloseReason closeReason,
        uint256 landlordPrincipal,
        uint256 landlordAssets,
        uint256 tenantAssets,
        uint256 yieldToTenant,
        uint256 principalLoss
    );
    event Withdrawn(uint256 indexed id, address indexed recipient, uint256 assets);

    error ZeroAddress();
    error ZeroPrincipal();
    error InvalidTimeline();
    error InvalidPeriod();
    error AgreementDoesNotExist();
    error InvalidPhase();
    error NotAuthorized();
    error AssetMismatch();
    error DepositMismatch();
    error RedemptionMismatch();
    error MinimumAssetsNotMet();
    error StrategyDepositUnavailable(uint256 availableAssets, uint256 requiredAssets);
    error StrategyRedemptionUnavailable(uint256 availableShares, uint256 requiredShares);
    error InvalidTenantShares();
    error TenantAlreadyFunded();
    error FundingWindowClosed();
    error FundingWindowStillOpen();
    error ClaimWindowNotOpen();
    error ClaimWindowClosed();
    error ClaimWindowStillOpen();
    error InvalidClaimAmount();
    error ResponseWindowClosed();
    error ResponseWindowStillOpen();
    error InvalidResponseAmount();
    error TenantAlreadyResponded();
    error ClaimResponseAlreadyStarted();
    error ClaimAlreadyAmended();
    error AmendmentMustNotIncrease();
    error ArbiterRulingWindowClosed();
    error ArbiterRulingWindowStillOpen();
    error InvalidAward();
    error NothingToWithdraw();

    constructor(address adapter) {
        if (adapter == address(0) || adapter.code.length == 0) revert ZeroAddress();

        address settlementAsset = IDepositAssetAdapter(adapter).settlementAsset();
        address receiptAsset = IDepositAssetAdapter(adapter).receiptAsset();
        if (settlementAsset == address(0) || receiptAsset == address(0) || settlementAsset == receiptAsset) {
            revert AssetMismatch();
        }
        if (settlementAsset.code.length == 0 || receiptAsset.code.length == 0) revert AssetMismatch();

        ADAPTER = IDepositAssetAdapter(adapter);
        SETTLEMENT_ASSET = IERC20(settlementAsset);
        RECEIPT_ASSET = IERC20(receiptAsset);
    }

    function createAgreement(
        address tenant,
        address arbiter,
        uint256 principal,
        uint64 fundingDeadline,
        uint64 settlementTime,
        uint64 claimPeriod,
        uint64 responsePeriod,
        uint64 arbiterRulingPeriod
    ) external returns (uint256 id) {
        address[] memory tenants = new address[](1);
        tenants[0] = tenant;
        uint16[] memory sharesBps = new uint16[](1);
        sharesBps[0] = TOTAL_BPS;
        return _createMultiTenantAgreement(
            tenants,
            sharesBps,
            AgreementInput({
                arbiter: arbiter,
                principal: principal,
                fundingDeadline: fundingDeadline,
                settlementTime: settlementTime,
                claimPeriod: claimPeriod,
                responsePeriod: responsePeriod,
                arbiterRulingPeriod: arbiterRulingPeriod
            })
        );
    }

    function createMultiTenantAgreement(
        address[] calldata tenants,
        uint16[] calldata sharesBps,
        address arbiter,
        uint256 principal,
        uint64 fundingDeadline,
        uint64 settlementTime,
        uint64 claimPeriod,
        uint64 responsePeriod,
        uint64 arbiterRulingPeriod
    ) external returns (uint256 id) {
        return _createMultiTenantAgreement(
            tenants,
            sharesBps,
            AgreementInput({
                arbiter: arbiter,
                principal: principal,
                fundingDeadline: fundingDeadline,
                settlementTime: settlementTime,
                claimPeriod: claimPeriod,
                responsePeriod: responsePeriod,
                arbiterRulingPeriod: arbiterRulingPeriod
            })
        );
    }

    function _createMultiTenantAgreement(
        address[] memory tenants,
        uint16[] memory sharesBps,
        AgreementInput memory input
    ) internal returns (uint256 id) {
        if (input.principal == 0) revert ZeroPrincipal();
        if (
            input.fundingDeadline <= block.timestamp || input.settlementTime <= input.fundingDeadline
                || input.settlementTime > block.timestamp + MAX_SETTLEMENT_OFFSET
        ) revert InvalidTimeline();
        _checkPeriod(input.claimPeriod);
        _checkPeriod(input.responsePeriod);
        _checkPeriod(input.arbiterRulingPeriod);
        if (tenants.length == 0 || tenants.length > MAX_TENANTS || tenants.length != sharesBps.length) {
            revert InvalidTenantShares();
        }

        id = nextAgreementId++;
        Agreement storage agreement = agreements[id];
        agreement.landlord = msg.sender;
        agreement.arbiter = input.arbiter;
        agreement.phase = Phase.Proposed;
        agreement.fundingDeadline = input.fundingDeadline;
        agreement.settlementTime = input.settlementTime;
        agreement.claimSubmissionDeadline = input.settlementTime + input.claimPeriod;
        agreement.responsePeriod = input.responsePeriod;
        agreement.arbiterRulingPeriod = input.arbiterRulingPeriod;
        agreement.principal = input.principal;

        _storeTenantParticipants(id, tenants, sharesBps, msg.sender, input.arbiter);
        if (input.arbiter != address(0) && input.arbiter == msg.sender) revert NotAuthorized();
        for (uint256 i = 0; i < tenants.length; ++i) {
            if (requiredTenantContribution(id, tenants[i]) == 0) revert InvalidTenantShares();
        }

        emit AgreementCreated(
            id,
            msg.sender,
            tenants[0],
            input.arbiter,
            input.principal,
            input.fundingDeadline,
            input.settlementTime,
            agreement.claimSubmissionDeadline
        );
    }

    /// @notice Each tenant funds only their approved ownership share. Principal
    ///         remains as USDC until every tenant has funded, then it is invested once.
    function fundTenantShare(uint256 id) external nonReentrant {
        Agreement storage agreement = _agreement(id);
        if (agreement.phase != Phase.Proposed) revert InvalidPhase();
        if (block.timestamp >= agreement.fundingDeadline) revert FundingWindowClosed();

        uint256 contribution = requiredTenantContribution(id, msg.sender);
        if (contribution == 0) revert NotAuthorized();
        if (tenantContribution[id][msg.sender] != 0) revert TenantAlreadyFunded();

        uint256 settlementBefore = SETTLEMENT_ASSET.balanceOf(address(this));
        SETTLEMENT_ASSET.safeTransferFrom(msg.sender, address(this), contribution);
        if (SETTLEMENT_ASSET.balanceOf(address(this)) - settlementBefore != contribution) revert DepositMismatch();

        tenantContribution[id][msg.sender] = contribution;
        agreement.fundedPrincipal += contribution;
        emit TenantShareFunded(id, msg.sender, contribution, agreement.fundedPrincipal);

        if (agreement.fundedPrincipal == agreement.principal) {
            uint256 receiptShares = _depositStrategy(agreement.principal);
            agreement.receiptShares = receiptShares;
            agreement.phase = Phase.Funded;
            emit AgreementFunded(id, agreement.principal, receiptShares);
        }
    }

    /// @notice Cancels an incompletely funded proposal. The landlord may cancel
    ///         at any time; after the funding deadline anyone may release refunds.
    function cancelProposal(uint256 id) external {
        Agreement storage agreement = _agreement(id);
        if (agreement.phase != Phase.Proposed) revert InvalidPhase();
        if (msg.sender != agreement.landlord && block.timestamp < agreement.fundingDeadline) {
            revert FundingWindowStillOpen();
        }

        uint256 refund = agreement.fundedPrincipal;
        if (refund > 0) {
            address[] storage tenants = _tenants[id];
            for (uint256 i = 0; i < tenants.length; ++i) {
                address tenant = tenants[i];
                uint256 contribution = tenantContribution[id][tenant];
                if (contribution > 0) tenantWithdrawableByAddress[id][tenant] = contribution;
            }
            agreement.tenantWithdrawable = refund;
        }
        agreement.phase = Phase.Cancelled;
        agreement.closeReason = CloseReason.ProposalCancelled;
        emit ProposalCancelled(id, refund);
    }

    /// @notice Permissionlessly redeems one agreement after its settlement time.
    /// @dev A production design must define how `minAssetsOut` is derived and expires.
    function settleStrategy(uint256 id, uint256 minAssetsOut) external nonReentrant {
        Agreement storage agreement = _agreement(id);
        if (agreement.strategySettled) revert InvalidPhase();
        if (
            agreement.phase != Phase.Funded && agreement.phase != Phase.ClaimOpen && agreement.phase != Phase.Disputed
                && agreement.phase != Phase.ResolvedPendingStrategy
        ) revert InvalidPhase();
        if (block.timestamp < agreement.settlementTime) revert InvalidTimeline();

        bool outcomeResolved = agreement.phase == Phase.ResolvedPendingStrategy;
        uint256 receiptShares = agreement.receiptShares;
        uint256 availableShares = ADAPTER.maxRedeem(address(this));
        if (availableShares < receiptShares) {
            revert StrategyRedemptionUnavailable(availableShares, receiptShares);
        }
        uint256 receiptBefore = RECEIPT_ASSET.balanceOf(address(this));
        uint256 settlementBefore = SETTLEMENT_ASSET.balanceOf(address(this));

        agreement.receiptShares = 0;

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
        agreement.strategySettled = true;
        if (agreement.phase == Phase.Funded) agreement.phase = Phase.ClaimWindow;
        emit StrategySettled(id, receiptShares, redeemedAssets);
        if (outcomeResolved) _allocateResolvedAssets(id, agreement);
    }

    function submitClaim(uint256 id, uint256 claimedPrincipal) external {
        Agreement storage agreement = _agreement(id);
        if (agreement.phase != Phase.Funded && agreement.phase != Phase.ClaimWindow) revert InvalidPhase();
        if (msg.sender != agreement.landlord) revert NotAuthorized();
        if (block.timestamp < agreement.settlementTime) revert ClaimWindowNotOpen();
        if (block.timestamp >= agreement.claimSubmissionDeadline) revert ClaimWindowClosed();
        if (claimedPrincipal == 0 || claimedPrincipal > agreement.principal) revert InvalidClaimAmount();

        agreement.claimedPrincipal = claimedPrincipal;
        minimumAcceptedClaimPrincipal[id] = claimedPrincipal;
        agreement.responseDeadline = uint64(block.timestamp) + agreement.responsePeriod;
        agreement.phase = Phase.ClaimOpen;
        emit ClaimSubmitted(id, claimedPrincipal, agreement.responseDeadline);
    }

    function amendClaim(uint256 id, uint256 newClaimedPrincipal) external {
        Agreement storage agreement = _agreement(id);
        if (agreement.phase != Phase.ClaimOpen) revert InvalidPhase();
        if (msg.sender != agreement.landlord) revert NotAuthorized();
        if (block.timestamp >= agreement.responseDeadline) revert ResponseWindowClosed();
        if (agreement.claimAmended) revert ClaimAlreadyAmended();
        if (claimResponseCount[id] != 0) revert ClaimResponseAlreadyStarted();
        if (newClaimedPrincipal > agreement.claimedPrincipal) revert AmendmentMustNotIncrease();

        agreement.claimAmended = true;
        agreement.claimedPrincipal = newClaimedPrincipal;
        minimumAcceptedClaimPrincipal[id] = newClaimedPrincipal;
        emit ClaimAmended(id, newClaimedPrincipal);

        if (newClaimedPrincipal == 0) {
            _resolveClaimOutcome(id, agreement, 0, CloseReason.ClaimRetracted);
        }
    }

    /// @notice Every tenant must respond. The lowest amount accepted by every
    ///         tenant is settled; the remainder of the claim becomes disputed.
    function respondToClaim(uint256 id, uint256 acceptedPrincipal) external {
        Agreement storage agreement = _agreement(id);
        if (agreement.phase != Phase.ClaimOpen) revert InvalidPhase();
        if (!_isTenant(id, msg.sender)) revert NotAuthorized();
        if (block.timestamp >= agreement.responseDeadline) revert ResponseWindowClosed();
        if (acceptedPrincipal > agreement.claimedPrincipal) revert InvalidResponseAmount();
        if (tenantClaimResponded[id][msg.sender]) revert TenantAlreadyResponded();

        tenantClaimResponded[id][msg.sender] = true;
        tenantAcceptedClaimPrincipal[id][msg.sender] = acceptedPrincipal;
        uint256 responseCount = ++claimResponseCount[id];
        if (acceptedPrincipal < minimumAcceptedClaimPrincipal[id]) {
            minimumAcceptedClaimPrincipal[id] = acceptedPrincipal;
        }

        uint256 requiredResponseCount = _tenants[id].length;
        emit TenantClaimResponseRecorded(id, msg.sender, acceptedPrincipal, responseCount, requiredResponseCount);
        if (responseCount == requiredResponseCount) {
            _settleResponses(id, agreement, minimumAcceptedClaimPrincipal[id]);
        }
    }

    /// @notice Tenant silence never approves a claim. After the response deadline
    ///         the entire unaccepted amount becomes disputed.
    function finalizeNoResponse(uint256 id) external {
        Agreement storage agreement = _agreement(id);
        if (agreement.phase != Phase.ClaimOpen) revert InvalidPhase();
        if (block.timestamp < agreement.responseDeadline) revert ResponseWindowStillOpen();
        _settleResponses(id, agreement, 0);
    }

    function finalizeNoClaim(uint256 id) external {
        Agreement storage agreement = _agreement(id);
        if (agreement.phase != Phase.Funded && agreement.phase != Phase.ClaimWindow) revert InvalidPhase();
        if (block.timestamp < agreement.claimSubmissionDeadline) revert ClaimWindowStillOpen();
        _resolveClaimOutcome(id, agreement, 0, CloseReason.NoClaim);
    }

    function resolveDispute(uint256 id, uint256 additionalAwardToLandlord) external {
        Agreement storage agreement = _agreement(id);
        if (agreement.phase != Phase.Disputed) revert InvalidPhase();
        if (agreement.arbiter == address(0) || msg.sender != agreement.arbiter) revert NotAuthorized();
        if (block.timestamp >= agreement.arbiterRulingDeadline) revert ArbiterRulingWindowClosed();

        uint256 disputedPrincipal = agreement.claimedPrincipal - agreement.acceptedPrincipal;
        if (additionalAwardToLandlord > disputedPrincipal) revert InvalidAward();
        _resolveClaimOutcome(
            id, agreement, agreement.acceptedPrincipal + additionalAwardToLandlord, CloseReason.ResolvedByArbiter
        );
    }

    /// @notice Permissionless. Any unproven disputed principal defaults to tenants.
    function claimArbiterTimeout(uint256 id) external {
        Agreement storage agreement = _agreement(id);
        if (agreement.phase != Phase.Disputed) revert InvalidPhase();
        if (block.timestamp < agreement.arbiterRulingDeadline) revert ArbiterRulingWindowStillOpen();
        _resolveClaimOutcome(id, agreement, agreement.acceptedPrincipal, CloseReason.ResolvedByTimeout);
    }

    function withdraw(uint256 id) external nonReentrant {
        Agreement storage agreement = _agreement(id);
        if (agreement.phase != Phase.Distributed && agreement.phase != Phase.Cancelled) revert InvalidPhase();

        uint256 assets;
        if (_isTenant(id, msg.sender)) {
            assets = tenantWithdrawableByAddress[id][msg.sender];
            tenantWithdrawableByAddress[id][msg.sender] = 0;
            agreement.tenantWithdrawable -= assets;
        } else if (msg.sender == agreement.landlord && agreement.phase == Phase.Distributed) {
            assets = agreement.landlordWithdrawable;
            agreement.landlordWithdrawable = 0;
        } else {
            revert NotAuthorized();
        }
        if (assets == 0) revert NothingToWithdraw();

        agreement.withdrawnAssets += assets;
        SETTLEMENT_ASSET.safeTransfer(msg.sender, assets);
        emit Withdrawn(id, msg.sender, assets);
    }

    function getAgreement(uint256 id) external view returns (Agreement memory) {
        return _agreement(id);
    }

    function getTenantParticipants(uint256 id)
        external
        view
        returns (
            address[] memory tenants,
            uint16[] memory sharesBps,
            uint256[] memory contributions,
            uint256[] memory withdrawable
        )
    {
        _agreement(id);
        tenants = _tenants[id];
        sharesBps = new uint16[](tenants.length);
        contributions = new uint256[](tenants.length);
        withdrawable = new uint256[](tenants.length);
        for (uint256 i = 0; i < tenants.length; ++i) {
            address tenant = tenants[i];
            sharesBps[i] = tenantShareBps[id][tenant];
            contributions[i] = tenantContribution[id][tenant];
            withdrawable[i] = tenantWithdrawableByAddress[id][tenant];
        }
    }

    function requiredTenantContribution(uint256 id, address tenant) public view returns (uint256) {
        Agreement storage agreement = _agreement(id);
        uint16 share = tenantShareBps[id][tenant];
        if (share == 0) return 0;

        address[] storage tenants = _tenants[id];
        if (tenant == tenants[tenants.length - 1]) {
            uint256 allocated;
            for (uint256 i = 0; i + 1 < tenants.length; ++i) {
                allocated += Math.mulDiv(agreement.principal, tenantShareBps[id][tenants[i]], TOTAL_BPS);
            }
            return agreement.principal - allocated;
        }
        return Math.mulDiv(agreement.principal, share, TOTAL_BPS);
    }

    function _depositStrategy(uint256 principal) internal returns (uint256 receiptShares) {
        uint256 availableAssets = ADAPTER.maxDeposit(address(this));
        if (availableAssets < principal) {
            revert StrategyDepositUnavailable(availableAssets, principal);
        }
        uint256 settlementBefore = SETTLEMENT_ASSET.balanceOf(address(this));
        uint256 receiptBefore = RECEIPT_ASSET.balanceOf(address(this));

        SETTLEMENT_ASSET.forceApprove(address(ADAPTER), principal);
        uint256 reportedShares = ADAPTER.deposit(principal, address(this));
        SETTLEMENT_ASSET.forceApprove(address(ADAPTER), 0);

        receiptShares = RECEIPT_ASSET.balanceOf(address(this)) - receiptBefore;
        if (
            receiptShares == 0 || reportedShares != receiptShares
                || settlementBefore - SETTLEMENT_ASSET.balanceOf(address(this)) != principal
        ) {
            revert DepositMismatch();
        }
    }

    function _settleResponses(uint256 id, Agreement storage agreement, uint256 acceptedPrincipal) internal {
        agreement.acceptedPrincipal = acceptedPrincipal;
        uint256 disputedPrincipal = agreement.claimedPrincipal - acceptedPrincipal;
        if (disputedPrincipal == 0) {
            _resolveClaimOutcome(id, agreement, acceptedPrincipal, CloseReason.Settled);
            return;
        }

        agreement.arbiterRulingDeadline = uint64(block.timestamp) + agreement.arbiterRulingPeriod;
        agreement.phase = Phase.Disputed;
        emit DisputeCreated(id, acceptedPrincipal, disputedPrincipal, agreement.arbiterRulingDeadline);
    }

    function _resolveClaimOutcome(
        uint256 id,
        Agreement storage agreement,
        uint256 landlordPrincipal,
        CloseReason closeReason
    ) internal {
        agreement.landlordPrincipal = landlordPrincipal;
        agreement.closeReason = closeReason;
        if (!agreement.strategySettled) {
            agreement.phase = Phase.ResolvedPendingStrategy;
            return;
        }
        _allocateResolvedAssets(id, agreement);
    }

    function _allocateResolvedAssets(uint256 id, Agreement storage agreement) internal {
        YieldEscrowAccounting.Distribution memory distribution =
            YieldEscrowAccounting.allocate(agreement.principal, agreement.landlordPrincipal, agreement.redeemedAssets);

        agreement.landlordWithdrawable = distribution.landlordAssets;
        _creditTenants(id, agreement, distribution.tenantAssets);
        agreement.phase = Phase.Distributed;

        emit DistributionFinalized(
            id,
            agreement.closeReason,
            agreement.landlordPrincipal,
            distribution.landlordAssets,
            distribution.tenantAssets,
            distribution.yieldToTenant,
            distribution.principalLoss
        );
    }

    function _creditTenants(uint256 id, Agreement storage agreement, uint256 assets) internal {
        if (assets == 0) return;
        address[] storage tenants = _tenants[id];
        uint256 allocated;
        for (uint256 i = 0; i < tenants.length; ++i) {
            address tenant = tenants[i];
            uint256 tenantAssets = i + 1 == tenants.length
                ? assets - allocated
                : Math.mulDiv(assets, tenantShareBps[id][tenant], TOTAL_BPS);
            tenantWithdrawableByAddress[id][tenant] = tenantAssets;
            allocated += tenantAssets;
        }
        agreement.tenantWithdrawable = assets;
    }

    function _storeTenantParticipants(
        uint256 id,
        address[] memory tenants,
        uint16[] memory sharesBps,
        address landlord,
        address arbiter
    ) internal {
        uint256 totalShares;
        for (uint256 i = 0; i < tenants.length; ++i) {
            address tenant = tenants[i];
            uint16 share = sharesBps[i];
            if (tenant == address(0)) revert ZeroAddress();
            if (tenant == landlord || tenant == arbiter || share == 0) revert NotAuthorized();
            for (uint256 j = 0; j < i; ++j) {
                if (tenants[j] == tenant) revert InvalidTenantShares();
            }
            _tenants[id].push(tenant);
            tenantShareBps[id][tenant] = share;
            totalShares += share;
            emit TenantParticipantAdded(id, tenant, share);
        }
        if (totalShares != TOTAL_BPS) revert InvalidTenantShares();
    }

    function _agreement(uint256 id) internal view returns (Agreement storage agreement) {
        agreement = agreements[id];
        if (agreement.phase == Phase.None) revert AgreementDoesNotExist();
    }

    function _checkPeriod(uint64 period) internal pure {
        if (period < MIN_PERIOD || period > MAX_PERIOD) revert InvalidPeriod();
    }

    function _isTenant(uint256 id, address account) internal view returns (bool) {
        return tenantShareBps[id][account] != 0;
    }
}
