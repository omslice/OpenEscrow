// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IOperationsReserve {
    function TOKEN() external view returns (IERC20);
    function YIELD_TOKEN() external view returns (IERC20);
    function requiredReserveShare(uint256 agreementId, address payer) external view returns (uint256);
    function recordReservePayment(uint256 agreementId, address payer, uint256 amount) external;
}

/// @title OpenEscrow - shared rental security deposit escrow (Base Sepolia MVP)
/// @notice Implements docs/mvp-spec.md. One default test token plus an explicit
///         per-agreement test-token path, in one shared contract holding independent
///         agreements keyed by id. No admin role or upgradeability.
/// @dev Evidence stored onchain is limited to a content hash, a pointer/URI, a type
///      code, a timestamp and the submitting address. The URI is NOT private storage
///      (e.g. public IPFS is publicly readable and permanent) - callers must never
///      put personal information, lease documents, invoices, or photographs directly
///      onchain, and should treat any URI they publish as public.
contract OpenEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum Phase {
        None,
        Proposed,
        ReadyToFund,
        Active,
        ClaimOpen,
        Disputed,
        Closed,
        Cancelled
    }

    enum CloseReason {
        None,
        NoClaim,
        ClaimRetracted,
        Settled,
        ResolvedByArbiter,
        ResolvedByTimeout
    }

    struct Agreement {
        address landlord;
        bool arbiterAccepted;
        bool arbiterDeclined;
        bool arbiterResigned;
        bool claimAmended;
        bool pendingArbiterConfirmed;
        address tenant;
        Phase phase;
        CloseReason closeReason;
        address arbiter;
        address pendingArbiter;
        address pendingArbiterProposer;
        address token;
        uint256 agreedAmount; // term agreed at proposal; target for funding
        uint256 depositAmount; // D, set to the amount actually received at funding
        uint64 fundedAt;
        uint64 claimWindowStart;
        uint64 claimPeriod;
        uint64 responsePeriod;
        uint64 arbiterRulingPeriod;
        uint64 claimSubmissionDeadline; // = claimWindowStart + claimPeriod
        uint64 responseDeadline; // fixed at first claim submission, never reset
        uint64 disputeCreatedAt;
        uint64 arbiterRulingDeadline; // fixed at dispute creation, never reset by replacement
        uint256 claimedAmount; // C
        uint256 tenantWithdrawable; // T
        uint256 landlordWithdrawable; // Ld
        uint256 locked; // amount not yet finalized to either party
        uint256 withdrawn; // W, cumulative
    }

    struct Evidence {
        bytes32 contentHash;
        string uri;
        uint8 evidenceType;
        uint64 timestamp;
        address submittedBy;
    }

    struct AgreementInput {
        address arbiter;
        address token;
        uint256 depositAmount;
        uint64 claimWindowStart;
        uint64 claimPeriod;
        uint64 responsePeriod;
        uint64 arbiterRulingPeriod;
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    IERC20 public immutable TOKEN;
    IERC20 public immutable YIELD_TOKEN;
    address public immutable OPERATIONS_RESERVE;

    uint256 public nextAgreementId;
    mapping(uint256 => Agreement) public agreements;
    mapping(uint256 => Evidence[]) private _evidence;
    mapping(uint256 => address[]) private _tenants;
    mapping(uint256 => mapping(address => uint16)) public tenantShareBps;
    mapping(uint256 => mapping(address => uint256)) public tenantContribution;
    mapping(uint256 => mapping(address => uint256)) public tenantWithdrawableByAddress;

    uint64 public constant MIN_PERIOD = 5 minutes;
    uint64 public constant MAX_PERIOD = 365 days;
    uint64 public constant MAX_CLAIM_WINDOW_OFFSET = 3650 days;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event AgreementProposed(
        uint256 indexed id,
        address indexed landlord,
        address indexed tenant,
        address arbiter,
        uint256 agreedAmount,
        uint64 claimWindowStart,
        uint64 claimPeriod,
        uint64 responsePeriod,
        uint64 arbiterRulingPeriod
    );
    event ArbiterAccepted(uint256 indexed id, address indexed arbiter);
    event ArbiterDeclined(uint256 indexed id, address indexed arbiter);
    event ArbiterRenominated(uint256 indexed id, address indexed oldArbiter, address indexed newArbiter);
    event ProposalCancelled(uint256 indexed id);
    event AgreementFunded(uint256 indexed id, uint256 amount);
    event TenantParticipantAdded(uint256 indexed id, address indexed tenant, uint16 shareBps);
    event TenantShareFunded(uint256 indexed id, address indexed tenant, uint256 amount, uint256 totalFunded);
    event ClaimSubmitted(uint256 indexed id, uint256 amount, uint256 unclaimedReleased);
    event ClaimAmended(uint256 indexed id, uint256 newAmount, uint256 additionalReleasedToTenant);
    event ClaimRetracted(uint256 indexed id);
    event EvidenceSubmitted(
        uint256 indexed id, uint256 index, address indexed submittedBy, bytes32 contentHash, uint8 evidenceType
    );
    event ClaimResponded(uint256 indexed id, uint256 acceptedAmount, uint256 disputedAmount);
    event ResponseTimedOut(uint256 indexed id, uint256 disputedAmount);
    event DisputeCreated(uint256 indexed id, uint256 disputedAmount, uint64 arbiterRulingDeadline);
    event DisputeResolved(uint256 indexed id, uint256 awardedToLandlord, uint256 awardedToTenant);
    event ArbiterTimedOut(uint256 indexed id, uint256 awardedToTenant);
    event NoClaimWithdrawal(uint256 indexed id, uint256 amount);
    event ArbiterReplacementProposed(uint256 indexed id, address indexed proposer, address indexed newArbiter);
    event ArbiterReplacementConfirmed(uint256 indexed id, address indexed confirmer);
    event ArbiterReplacementCancelled(uint256 indexed id);
    event ArbiterReplaced(uint256 indexed id, address indexed oldArbiter, address indexed newArbiter);
    event ArbiterResigned(uint256 indexed id, address indexed arbiter);
    event Withdrawn(uint256 indexed id, address indexed party, uint256 amount);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error NotAuthorized();
    error InvalidPhase();
    error AgreementDoesNotExist();
    error ZeroAddress();
    error InvalidRoleAssignment();
    error ZeroDeposit();
    error InvalidPeriod();
    error InvalidClaimWindowStart();
    error DepositMismatch();
    error ClaimWindowNotOpen();
    error ClaimWindowClosed();
    error ClaimWindowStillOpen();
    error InvalidClaimAmount();
    error ClaimAlreadyAmended();
    error AmendmentMustNotIncrease();
    error ResponseWindowClosed();
    error ResponseWindowStillOpen();
    error InvalidResponseAmount();
    error ArbiterRulingWindowClosed();
    error ArbiterRulingWindowStillOpen();
    error InvalidAward();
    error ArbiterHasDeclined();
    error ArbiterHasResigned();
    error NoReplacementPending();
    error ReplacementAlreadyConfirmed();
    error CannotConfirmOwnProposal();
    error NothingToWithdraw();
    error InvalidEvidence();
    error UnsupportedToken();
    error InvalidTenantShares();
    error TenantAlreadyFunded();
    error OperationsReserveNotConfigured();
    error InvalidOperationsReserve();

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(address token, address yieldToken, address operationsReserve) {
        if (token == address(0) || yieldToken == address(0)) revert ZeroAddress();
        if (
            operationsReserve != address(0)
                && (operationsReserve.code.length == 0
                    || address(IOperationsReserve(operationsReserve).TOKEN()) != token
                    || address(IOperationsReserve(operationsReserve).YIELD_TOKEN()) != yieldToken)
        ) revert InvalidOperationsReserve();
        TOKEN = IERC20(token);
        YIELD_TOKEN = IERC20(yieldToken);
        OPERATIONS_RESERVE = operationsReserve;
    }

    // ---------------------------------------------------------------------
    // Proposal / arbiter appointment / funding
    // ---------------------------------------------------------------------

    function createAgreement(
        address tenant,
        address arbiter,
        uint256 depositAmount,
        uint64 claimWindowStart,
        uint64 claimPeriod,
        uint64 responsePeriod,
        uint64 arbiterRulingPeriod
    ) external returns (uint256 id) {
        return _createAgreement(
            tenant,
            arbiter,
            address(TOKEN),
            depositAmount,
            claimWindowStart,
            claimPeriod,
            responsePeriod,
            arbiterRulingPeriod
        );
    }

    /// @notice Testnet-only token selection path. The UI only offers the two documented
    ///         demo assets. Any production version must replace this with a reviewed
    ///         allowlist or a dedicated vault/asset architecture.
    function createAgreementWithToken(
        address tenant,
        address arbiter,
        address token,
        uint256 depositAmount,
        uint64 claimWindowStart,
        uint64 claimPeriod,
        uint64 responsePeriod,
        uint64 arbiterRulingPeriod
    ) external returns (uint256 id) {
        return _createAgreement(
            tenant, arbiter, token, depositAmount, claimWindowStart, claimPeriod, responsePeriod, arbiterRulingPeriod
        );
    }

    /// @notice Creates one agreement whose refundable deposit is owned and funded by
    ///         multiple tenants. Shares use basis points and must total exactly 10,000.
    ///         The first tenant remains the primary tenant for claim-response actions.
    function createMultiTenantAgreementWithToken(
        address[] calldata tenants,
        uint16[] calldata sharesBps,
        address arbiter,
        address token,
        uint256 depositAmount,
        uint64 claimWindowStart,
        uint64 claimPeriod,
        uint64 responsePeriod,
        uint64 arbiterRulingPeriod
    ) external returns (uint256 id) {
        return _createMultiTenantAgreement(
            tenants,
            sharesBps,
            AgreementInput({
                arbiter: arbiter,
                token: token,
                depositAmount: depositAmount,
                claimWindowStart: claimWindowStart,
                claimPeriod: claimPeriod,
                responsePeriod: responsePeriod,
                arbiterRulingPeriod: arbiterRulingPeriod
            })
        );
    }

    function _createAgreement(
        address tenant,
        address arbiter,
        address token,
        uint256 depositAmount,
        uint64 claimWindowStart,
        uint64 claimPeriod,
        uint64 responsePeriod,
        uint64 arbiterRulingPeriod
    ) internal returns (uint256 id) {
        address[] memory tenants = new address[](1);
        tenants[0] = tenant;
        uint16[] memory sharesBps = new uint16[](1);
        sharesBps[0] = 10_000;
        return _createMultiTenantAgreement(
            tenants,
            sharesBps,
            AgreementInput({
                arbiter: arbiter,
                token: token,
                depositAmount: depositAmount,
                claimWindowStart: claimWindowStart,
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
        address landlord = msg.sender;
        if (tenants.length == 0 || tenants.length > 10 || tenants.length != sharesBps.length) {
            revert InvalidTenantShares();
        }
        if (input.token == address(0)) revert ZeroAddress();
        if (input.token != address(TOKEN) && input.token != address(YIELD_TOKEN)) revert UnsupportedToken();
        if (input.depositAmount == 0) revert ZeroDeposit();
        if (input.claimWindowStart < block.timestamp) revert InvalidClaimWindowStart();
        if (input.claimWindowStart > block.timestamp + MAX_CLAIM_WINDOW_OFFSET) revert InvalidClaimWindowStart();
        _checkPeriod(input.claimPeriod);
        _checkPeriod(input.responsePeriod);
        _checkPeriod(input.arbiterRulingPeriod);

        id = nextAgreementId++;
        Agreement storage a = agreements[id];
        a.landlord = landlord;
        a.tenant = tenants[0];
        a.arbiter = input.arbiter;
        a.token = input.token;
        a.agreedAmount = input.depositAmount;
        a.claimWindowStart = input.claimWindowStart;
        a.claimPeriod = input.claimPeriod;
        a.responsePeriod = input.responsePeriod;
        a.arbiterRulingPeriod = input.arbiterRulingPeriod;
        a.claimSubmissionDeadline = input.claimWindowStart + input.claimPeriod;
        _storeTenantParticipants(id, tenants, sharesBps, landlord, input.arbiter);
        if (input.arbiter != address(0) && input.arbiter == landlord) revert InvalidRoleAssignment();
        // A named arbiter must accept before funding. With no named arbiter the
        // agreement can fund immediately; if a dispute later occurs, the parties
        // can mutually appoint one before the fixed ruling deadline. Otherwise the
        // existing tenant-favoring timeout resolves the unproven claim.
        a.phase = input.arbiter == address(0) ? Phase.ReadyToFund : Phase.Proposed;

        emit AgreementProposed(
            id,
            landlord,
            tenants[0],
            input.arbiter,
            input.depositAmount,
            input.claimWindowStart,
            input.claimPeriod,
            input.responsePeriod,
            input.arbiterRulingPeriod
        );
    }

    /// @notice Accepts an arbiter nomination (initial) or finalizes an already-confirmed
    ///         mutual replacement (post-funding). Same entry point for both, per spec T2/T16.
    function acceptArbiterRole(uint256 id) external {
        Agreement storage a = _agreement(id);

        if (a.phase == Phase.Proposed && msg.sender == a.arbiter && !a.arbiterAccepted && !a.arbiterDeclined) {
            a.arbiterAccepted = true;
            a.phase = Phase.ReadyToFund;
            emit ArbiterAccepted(id, msg.sender);
            return;
        }

        if (a.pendingArbiter != address(0) && msg.sender == a.pendingArbiter && a.pendingArbiterConfirmed) {
            _requireReplaceablePhase(a.phase);
            address old = a.arbiter;
            a.arbiter = a.pendingArbiter;
            a.arbiterAccepted = true;
            a.arbiterDeclined = false;
            a.arbiterResigned = false;
            _clearPendingReplacement(a);
            emit ArbiterReplaced(id, old, msg.sender);
            return;
        }

        if (a.phase == Phase.Closed || a.phase == Phase.Cancelled) revert InvalidPhase();
        revert NotAuthorized();
    }

    function declineArbiterRole(uint256 id) external {
        Agreement storage a = _agreement(id);
        if (a.phase != Phase.Proposed) revert InvalidPhase();
        if (msg.sender != a.arbiter) revert NotAuthorized();
        if (a.arbiterDeclined) revert ArbiterHasDeclined();
        a.arbiterDeclined = true;
        emit ArbiterDeclined(id, msg.sender);
    }

    function renominateArbiter(uint256 id, address newArbiter) external {
        Agreement storage a = _agreement(id);
        if (a.phase != Phase.Proposed && a.phase != Phase.ReadyToFund) revert InvalidPhase();
        if (msg.sender != a.landlord) revert NotAuthorized();
        if (newArbiter == address(0)) revert ZeroAddress();
        if (newArbiter == a.landlord || _isTenant(id, newArbiter)) revert InvalidRoleAssignment();

        address old = a.arbiter;
        a.arbiter = newArbiter;
        a.arbiterAccepted = false;
        a.arbiterDeclined = false;
        a.arbiterResigned = false;
        a.phase = Phase.Proposed;
        // A pending replacement proposal from a prior ReadyToFund period is now moot -
        // the phase guards in confirmArbiterReplacement/acceptArbiterRole already make it
        // unusable, but clearing it here keeps a stale "pending replacement" from lingering
        // in reads (e.g. the frontend) for a proposal that can never actually complete.
        _clearPendingReplacement(a);
        emit ArbiterRenominated(id, old, newArbiter);
    }

    function cancelProposal(uint256 id) external {
        Agreement storage a = _agreement(id);
        if (a.phase != Phase.Proposed && a.phase != Phase.ReadyToFund) revert InvalidPhase();
        if (msg.sender != a.landlord) revert NotAuthorized();
        if (a.depositAmount > 0) {
            address[] storage tenants = _tenants[id];
            for (uint256 i = 0; i < tenants.length; ++i) {
                address tenant = tenants[i];
                uint256 contributed = tenantContribution[id][tenant];
                if (contributed > 0) {
                    tenantWithdrawableByAddress[id][tenant] += contributed;
                    a.tenantWithdrawable += contributed;
                }
            }
            a.locked = 0;
        }
        a.phase = Phase.Cancelled;
        _clearPendingReplacement(a);
        emit ProposalCancelled(id);
    }

    /// @dev Uses a balance-delta check so the recorded deposit always matches tokens
    ///      actually received, rather than trusting the transfer amount blindly.
    function tenantAcceptAndFund(uint256 id) external nonReentrant {
        _fundTenantShare(id);
    }

    /// @notice Funds only the caller's approved portion. The agreement becomes Active
    ///         after the full agreed amount has been received across all tenant wallets.
    function fundTenantShare(uint256 id) external nonReentrant {
        _fundTenantShare(id, 0);
    }

    /// @notice Atomically collects the caller's refundable deposit share and evenly
    ///         allocated operations-reserve share. The selected token needs one
    ///         allowance to this contract for the combined amount.
    function fundTenantShareWithReserve(uint256 id) external nonReentrant {
        if (OPERATIONS_RESERVE == address(0)) revert OperationsReserveNotConfigured();
        uint256 reserveAmount = IOperationsReserve(OPERATIONS_RESERVE).requiredReserveShare(id, msg.sender);
        _fundTenantShare(id, reserveAmount);
    }

    function _fundTenantShare(uint256 id) internal {
        _fundTenantShare(id, 0);
    }

    function _fundTenantShare(uint256 id, uint256 reserveAmount) internal {
        Agreement storage a = _agreement(id);
        if (a.phase != Phase.ReadyToFund) revert InvalidPhase();
        uint256 target = requiredTenantContribution(id, msg.sender);
        if (target == 0) revert NotAuthorized();
        if (tenantContribution[id][msg.sender] != 0) revert TenantAlreadyFunded();

        IERC20 token = IERC20(a.token);
        uint256 balBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), target + reserveAmount);
        uint256 received = token.balanceOf(address(this)) - balBefore;
        if (received != target + reserveAmount) revert DepositMismatch();

        if (reserveAmount > 0) {
            uint256 reserveBalBefore = token.balanceOf(OPERATIONS_RESERVE);
            token.safeTransfer(OPERATIONS_RESERVE, reserveAmount);
            if (token.balanceOf(OPERATIONS_RESERVE) - reserveBalBefore != reserveAmount) {
                revert DepositMismatch();
            }
            IOperationsReserve(OPERATIONS_RESERVE).recordReservePayment(id, msg.sender, reserveAmount);
            if (token.balanceOf(address(this)) - balBefore != target) revert DepositMismatch();
        }

        tenantContribution[id][msg.sender] = target;
        a.depositAmount += target;
        a.locked += target;
        emit TenantShareFunded(id, msg.sender, target, a.depositAmount);
        if (a.depositAmount == a.agreedAmount) {
            a.fundedAt = uint64(block.timestamp);
            a.phase = Phase.Active;
            emit AgreementFunded(id, a.depositAmount);
        }
    }

    // ---------------------------------------------------------------------
    // Claims
    // ---------------------------------------------------------------------

    function submitClaim(uint256 id, uint256 amount, bytes32 contentHash, string calldata uri, uint8 evidenceType)
        external
    {
        Agreement storage a = _agreement(id);
        if (a.phase != Phase.Active) revert InvalidPhase();
        if (msg.sender != a.landlord) revert NotAuthorized();
        if (block.timestamp < a.claimWindowStart) revert ClaimWindowNotOpen();
        if (block.timestamp >= a.claimSubmissionDeadline) revert ClaimWindowClosed();
        if (amount == 0 || amount > a.depositAmount) revert InvalidClaimAmount();

        uint256 unclaimed = a.depositAmount - amount;
        _creditTenants(id, a, unclaimed);
        a.locked = amount;
        a.claimedAmount = amount;
        a.responseDeadline = uint64(block.timestamp) + a.responsePeriod;
        a.phase = Phase.ClaimOpen;

        _recordEvidence(id, contentHash, uri, evidenceType, msg.sender);
        emit ClaimSubmitted(id, amount, unclaimed);
    }

    /// @dev At most one amendment per agreement (§decision 2). May only reduce the
    ///      claimed amount, and never touches responseDeadline - the tenant's response
    ///      window is fixed at first submission and cannot be shortened or extended by
    ///      amendment. Reducing to zero retracts the claim entirely.
    function amendClaim(uint256 id, uint256 newAmount, bytes32 contentHash, string calldata uri, uint8 evidenceType)
        external
    {
        Agreement storage a = _agreement(id);
        if (a.phase != Phase.ClaimOpen) revert InvalidPhase();
        if (msg.sender != a.landlord) revert NotAuthorized();
        if (a.claimAmended) revert ClaimAlreadyAmended();
        if (block.timestamp >= a.responseDeadline) revert ResponseWindowClosed();
        if (newAmount > a.claimedAmount) revert AmendmentMustNotIncrease();

        uint256 delta = a.claimedAmount - newAmount;
        _creditTenants(id, a, delta);
        a.locked -= delta;
        a.claimedAmount = newAmount;
        a.claimAmended = true;

        _recordEvidence(id, contentHash, uri, evidenceType, msg.sender);

        if (newAmount == 0) {
            a.phase = Phase.Closed;
            a.closeReason = CloseReason.ClaimRetracted;
            _clearPendingReplacement(a);
            emit ClaimRetracted(id);
        } else {
            emit ClaimAmended(id, newAmount, delta);
        }
    }

    /// @notice Supplementary evidence from either party while a claim is live.
    function submitEvidence(uint256 id, bytes32 contentHash, string calldata uri, uint8 evidenceType) external {
        Agreement storage a = _agreement(id);
        if (a.phase != Phase.ClaimOpen && a.phase != Phase.Disputed) revert InvalidPhase();
        if (msg.sender != a.landlord && !_isTenant(id, msg.sender)) revert NotAuthorized();
        _recordEvidence(id, contentHash, uri, evidenceType, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Tenant response / no-response / no-claim
    // ---------------------------------------------------------------------

    /// @notice Unifies acceptance and disputing: acceptedAmount == claimedAmount is full
    ///         acceptance, 0 < acceptedAmount < claimedAmount is partial, 0 is full dispute.
    function respondToClaim(uint256 id, uint256 acceptedAmount) external {
        Agreement storage a = _agreement(id);
        if (a.phase != Phase.ClaimOpen) revert InvalidPhase();
        // The first tenant is the proposal's primary tenant and remains the single
        // claim-response coordinator in this MVP. All tenant owners receive their
        // pro-rata settlement regardless of which approved primary tenant responds.
        if (msg.sender != a.tenant) revert NotAuthorized();
        if (block.timestamp >= a.responseDeadline) revert ResponseWindowClosed();
        if (acceptedAmount > a.claimedAmount) revert InvalidResponseAmount();

        _settleResponse(id, a, acceptedAmount);
    }

    /// @notice Permissionless. Tenant silence past the deadline is treated as a full
    ///         dispute requiring arbiter review - it never auto-awards the landlord.
    function finalizeNoResponse(uint256 id) external {
        Agreement storage a = _agreement(id);
        if (a.phase != Phase.ClaimOpen) revert InvalidPhase();
        if (block.timestamp < a.responseDeadline) revert ResponseWindowStillOpen();

        _settleResponse(id, a, 0);
        emit ResponseTimedOut(id, a.claimedAmount);
    }

    function _settleResponse(uint256 id, Agreement storage a, uint256 acceptedAmount) internal {
        uint256 disputed = a.claimedAmount - acceptedAmount;

        if (acceptedAmount > 0) {
            a.landlordWithdrawable += acceptedAmount;
        }
        a.locked -= acceptedAmount;

        if (disputed == 0) {
            a.phase = Phase.Closed;
            a.closeReason = CloseReason.Settled;
            _clearPendingReplacement(a);
            emit ClaimResponded(id, acceptedAmount, 0);
        } else {
            a.disputeCreatedAt = uint64(block.timestamp);
            a.arbiterRulingDeadline = uint64(block.timestamp) + a.arbiterRulingPeriod;
            a.phase = Phase.Disputed;
            emit ClaimResponded(id, acceptedAmount, disputed);
            emit DisputeCreated(id, disputed, a.arbiterRulingDeadline);
        }
    }

    function withdrawNoClaim(uint256 id) external {
        Agreement storage a = _agreement(id);
        if (a.phase != Phase.Active) revert InvalidPhase();
        if (!_isTenant(id, msg.sender)) revert NotAuthorized();
        if (block.timestamp < a.claimSubmissionDeadline) revert ClaimWindowStillOpen();

        uint256 amount = a.locked;
        _creditTenants(id, a, amount);
        a.locked = 0;
        a.phase = Phase.Closed;
        a.closeReason = CloseReason.NoClaim;
        _clearPendingReplacement(a);
        emit NoClaimWithdrawal(id, amount);
    }

    // ---------------------------------------------------------------------
    // Arbiter ruling / timeout
    // ---------------------------------------------------------------------

    function resolveDispute(uint256 id, uint256 awardToLandlord) external {
        Agreement storage a = _agreement(id);
        if (a.phase != Phase.Disputed) revert InvalidPhase();
        if (msg.sender != a.arbiter) revert NotAuthorized();
        if (a.arbiterResigned) revert ArbiterHasResigned();
        if (block.timestamp >= a.arbiterRulingDeadline) revert ArbiterRulingWindowClosed();
        if (awardToLandlord > a.locked) revert InvalidAward();

        uint256 disputed = a.locked;
        uint256 toTenant = disputed - awardToLandlord;
        if (awardToLandlord > 0) a.landlordWithdrawable += awardToLandlord;
        if (toTenant > 0) _creditTenants(id, a, toTenant);
        a.locked = 0;
        a.phase = Phase.Closed;
        a.closeReason = CloseReason.ResolvedByArbiter;
        _clearPendingReplacement(a);
        emit DisputeResolved(id, awardToLandlord, toTenant);
    }

    /// @notice Permissionless. If the arbiter never rules, the disputed amount defaults
    ///         to the tenant - an unproven claim is treated as unproven.
    function claimArbiterTimeout(uint256 id) external {
        Agreement storage a = _agreement(id);
        if (a.phase != Phase.Disputed) revert InvalidPhase();
        if (block.timestamp < a.arbiterRulingDeadline) revert ArbiterRulingWindowStillOpen();

        uint256 amount = a.locked;
        _creditTenants(id, a, amount);
        a.locked = 0;
        a.phase = Phase.Closed;
        a.closeReason = CloseReason.ResolvedByTimeout;
        _clearPendingReplacement(a);
        emit ArbiterTimedOut(id, amount);
    }

    // ---------------------------------------------------------------------
    // Arbiter replacement / resignation
    // ---------------------------------------------------------------------

    /// @dev arbiterRulingDeadline is never touched by a replacement, so neither party
    ///      can use replacement to unilaterally extend a dispute (§decision 5).
    function proposeArbiterReplacement(uint256 id, address newArbiter) external {
        Agreement storage a = _agreement(id);
        _requireReplaceablePhase(a.phase);
        if (msg.sender != a.landlord && msg.sender != a.tenant) revert NotAuthorized();
        if (newArbiter == address(0)) revert ZeroAddress();
        if (newArbiter == a.landlord || _isTenant(id, newArbiter)) revert InvalidRoleAssignment();

        a.pendingArbiter = newArbiter;
        a.pendingArbiterProposer = msg.sender;
        a.pendingArbiterConfirmed = false;
        emit ArbiterReplacementProposed(id, msg.sender, newArbiter);
    }

    function confirmArbiterReplacement(uint256 id) external {
        Agreement storage a = _agreement(id);
        _requireReplaceablePhase(a.phase);
        if (a.pendingArbiter == address(0)) revert NoReplacementPending();
        if (msg.sender != a.landlord && msg.sender != a.tenant) revert NotAuthorized();
        if (msg.sender == a.pendingArbiterProposer) revert CannotConfirmOwnProposal();
        if (a.pendingArbiterConfirmed) revert ReplacementAlreadyConfirmed();

        a.pendingArbiterConfirmed = true;
        emit ArbiterReplacementConfirmed(id, msg.sender);
    }

    function cancelArbiterReplacementProposal(uint256 id) external {
        Agreement storage a = _agreement(id);
        _requireReplaceablePhase(a.phase);
        if (a.pendingArbiter == address(0)) revert NoReplacementPending();
        if (msg.sender != a.pendingArbiterProposer) revert NotAuthorized();

        _clearPendingReplacement(a);
        emit ArbiterReplacementCancelled(id);
    }

    function resignAsArbiter(uint256 id) external {
        Agreement storage a = _agreement(id);
        _requireReplaceablePhase(a.phase);
        if (msg.sender != a.arbiter) revert NotAuthorized();
        if (a.arbiterResigned) revert ArbiterHasResigned();
        a.arbiterResigned = true;
        emit ArbiterResigned(id, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Withdrawal (pull-based)
    // ---------------------------------------------------------------------

    function withdraw(uint256 id) external nonReentrant {
        Agreement storage a = _agreement(id);

        uint256 amount;
        if (_isTenant(id, msg.sender)) {
            amount = tenantWithdrawableByAddress[id][msg.sender];
            if (amount == 0) revert NothingToWithdraw();
            tenantWithdrawableByAddress[id][msg.sender] = 0;
            a.tenantWithdrawable -= amount;
        } else if (msg.sender == a.landlord) {
            amount = a.landlordWithdrawable;
            if (amount == 0) revert NothingToWithdraw();
            a.landlordWithdrawable = 0;
        } else {
            revert NotAuthorized();
        }

        a.withdrawn += amount;
        IERC20(a.token).safeTransfer(msg.sender, amount);
        emit Withdrawn(id, msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getEvidence(uint256 id) external view returns (Evidence[] memory) {
        return _evidence[id];
    }

    /// @notice Convenience accessor returning the full struct, avoiding fragile
    ///         positional tuple destructuring of the `agreements` public getter.
    function getAgreement(uint256 id) external view returns (Agreement memory) {
        return _agreement(id);
    }

    function evidenceCount(uint256 id) external view returns (uint256) {
        return _evidence[id].length;
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
        Agreement storage a = _agreement(id);
        uint16 share = tenantShareBps[id][tenant];
        if (share == 0) return 0;
        address[] storage tenants = _tenants[id];
        if (tenant == tenants[tenants.length - 1]) {
            uint256 allocated;
            for (uint256 i = 0; i + 1 < tenants.length; ++i) {
                allocated += (a.agreedAmount * tenantShareBps[id][tenants[i]]) / 10_000;
            }
            return a.agreedAmount - allocated;
        }
        return (a.agreedAmount * share) / 10_000;
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    function _agreement(uint256 id) internal view returns (Agreement storage a) {
        a = agreements[id];
        if (a.phase == Phase.None) revert AgreementDoesNotExist();
    }

    function _checkPeriod(uint64 period) internal pure {
        if (period < MIN_PERIOD || period > MAX_PERIOD) revert InvalidPeriod();
    }

    function _requireReplaceablePhase(Phase phase) internal pure {
        if (phase != Phase.ReadyToFund && phase != Phase.Active && phase != Phase.ClaimOpen && phase != Phase.Disputed)
        {
            revert InvalidPhase();
        }
    }

    function _clearPendingReplacement(Agreement storage a) internal {
        a.pendingArbiter = address(0);
        a.pendingArbiterProposer = address(0);
        a.pendingArbiterConfirmed = false;
    }

    function _isTenant(uint256 id, address account) internal view returns (bool) {
        return tenantShareBps[id][account] != 0;
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
            if (tenant == landlord || tenant == arbiter || share == 0) revert InvalidRoleAssignment();
            for (uint256 j = 0; j < i; ++j) {
                if (tenants[j] == tenant) revert InvalidRoleAssignment();
            }
            _tenants[id].push(tenant);
            tenantShareBps[id][tenant] = share;
            totalShares += share;
            emit TenantParticipantAdded(id, tenant, share);
        }
        if (totalShares != 10_000) revert InvalidTenantShares();
    }

    function _creditTenants(uint256 id, Agreement storage a, uint256 amount) internal {
        if (amount == 0) return;
        address[] storage tenants = _tenants[id];
        uint256 allocated;
        for (uint256 i = 0; i < tenants.length; ++i) {
            address tenant = tenants[i];
            uint256 shareAmount =
                i + 1 == tenants.length ? amount - allocated : (amount * tenantShareBps[id][tenant]) / 10_000;
            tenantWithdrawableByAddress[id][tenant] += shareAmount;
            allocated += shareAmount;
        }
        a.tenantWithdrawable += amount;
    }

    /// @dev Onchain evidence is intentionally minimal: a content hash, a pointer/URI or
    ///      opaque identifier, a caller-defined type code, a timestamp and the submitter.
    ///      Never store names, physical addresses, lease documents, invoices, or photos
    ///      directly onchain - only their hash and an offchain, access-controlled pointer.
    ///      Public IPFS is public and permanent, not private storage.
    function _recordEvidence(
        uint256 id,
        bytes32 contentHash,
        string calldata uri,
        uint8 evidenceType,
        address submitter
    ) internal {
        if (contentHash == bytes32(0)) revert InvalidEvidence();
        _evidence[id].push(
            Evidence({
                contentHash: contentHash,
                uri: uri,
                evidenceType: evidenceType,
                timestamp: uint64(block.timestamp),
                submittedBy: submitter
            })
        );
        emit EvidenceSubmitted(id, _evidence[id].length - 1, submitter, contentHash, evidenceType);
    }
}
