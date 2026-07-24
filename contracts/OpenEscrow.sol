// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title OpenEscrow - shared rental security deposit escrow (Base Sepolia MVP)
/// @notice Implements docs/mvp-spec.md. One immutable test-USDC token, one shared
///         contract holding many independent agreements keyed by id. No admin role,
///         no rules module, no yield, no upgradeability.
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
        bool arbiterResigned;
        bool claimAmended;
        bool pendingArbiterConfirmed;
        address tenant;
        Phase phase;
        CloseReason closeReason;
        address arbiter;
        address pendingArbiter;
        address pendingArbiterProposer;
        uint256 agreedAmount; // term agreed at proposal; target for funding
        uint256 depositAmount; // D, set to the amount actually received at funding
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

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    IERC20 public immutable TOKEN;

    uint256 public nextAgreementId;
    mapping(uint256 => Agreement) public agreements;
    mapping(uint256 => Evidence[]) private _evidence;

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
    error ArbiterHasResigned();
    error NoReplacementPending();
    error ReplacementAlreadyConfirmed();
    error CannotConfirmOwnProposal();
    error NothingToWithdraw();
    error InvalidEvidence();

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(address token) {
        if (token == address(0)) revert ZeroAddress();
        TOKEN = IERC20(token);
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
        address landlord = msg.sender;
        if (tenant == address(0) || arbiter == address(0)) revert ZeroAddress();
        if (tenant == landlord || arbiter == landlord || arbiter == tenant) revert InvalidRoleAssignment();
        if (depositAmount == 0) revert ZeroDeposit();
        if (claimWindowStart < block.timestamp) revert InvalidClaimWindowStart();
        if (claimWindowStart > block.timestamp + MAX_CLAIM_WINDOW_OFFSET) revert InvalidClaimWindowStart();
        _checkPeriod(claimPeriod);
        _checkPeriod(responsePeriod);
        _checkPeriod(arbiterRulingPeriod);

        id = nextAgreementId++;
        Agreement storage a = agreements[id];
        a.landlord = landlord;
        a.tenant = tenant;
        a.arbiter = arbiter;
        a.agreedAmount = depositAmount;
        a.claimWindowStart = claimWindowStart;
        a.claimPeriod = claimPeriod;
        a.responsePeriod = responsePeriod;
        a.arbiterRulingPeriod = arbiterRulingPeriod;
        a.claimSubmissionDeadline = claimWindowStart + claimPeriod;
        a.phase = Phase.Proposed;

        emit AgreementProposed(
            id,
            landlord,
            tenant,
            arbiter,
            depositAmount,
            claimWindowStart,
            claimPeriod,
            responsePeriod,
            arbiterRulingPeriod
        );
    }

    /// @notice Accepts an arbiter nomination (initial) or finalizes an already-confirmed
    ///         mutual replacement (post-funding). Same entry point for both, per spec T2/T16.
    function acceptArbiterRole(uint256 id) external {
        Agreement storage a = _agreement(id);

        if (a.phase == Phase.Proposed && msg.sender == a.arbiter && !a.arbiterAccepted) {
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
            a.arbiterResigned = false;
            a.pendingArbiter = address(0);
            a.pendingArbiterProposer = address(0);
            a.pendingArbiterConfirmed = false;
            emit ArbiterReplaced(id, old, msg.sender);
            return;
        }

        revert NotAuthorized();
    }

    function declineArbiterRole(uint256 id) external {
        Agreement storage a = _agreement(id);
        if (a.phase != Phase.Proposed) revert InvalidPhase();
        if (msg.sender != a.arbiter) revert NotAuthorized();
        emit ArbiterDeclined(id, msg.sender);
    }

    function renominateArbiter(uint256 id, address newArbiter) external {
        Agreement storage a = _agreement(id);
        if (a.phase != Phase.Proposed && a.phase != Phase.ReadyToFund) revert InvalidPhase();
        if (msg.sender != a.landlord) revert NotAuthorized();
        if (newArbiter == address(0)) revert ZeroAddress();
        if (newArbiter == a.landlord || newArbiter == a.tenant) revert InvalidRoleAssignment();

        address old = a.arbiter;
        a.arbiter = newArbiter;
        a.arbiterAccepted = false;
        a.arbiterResigned = false;
        a.phase = Phase.Proposed;
        // A pending replacement proposal from a prior ReadyToFund period is now moot -
        // the phase guards in confirmArbiterReplacement/acceptArbiterRole already make it
        // unusable, but clearing it here keeps a stale "pending replacement" from lingering
        // in reads (e.g. the frontend) for a proposal that can never actually complete.
        a.pendingArbiter = address(0);
        a.pendingArbiterProposer = address(0);
        a.pendingArbiterConfirmed = false;
        emit ArbiterRenominated(id, old, newArbiter);
    }

    function cancelProposal(uint256 id) external {
        Agreement storage a = _agreement(id);
        if (a.phase != Phase.Proposed && a.phase != Phase.ReadyToFund) revert InvalidPhase();
        if (msg.sender != a.landlord) revert NotAuthorized();
        a.phase = Phase.Cancelled;
        emit ProposalCancelled(id);
    }

    /// @dev Uses a balance-delta check so the recorded deposit always matches tokens
    ///      actually received, rather than trusting the transfer amount blindly.
    function tenantAcceptAndFund(uint256 id) external nonReentrant {
        Agreement storage a = _agreement(id);
        if (a.phase != Phase.ReadyToFund) revert InvalidPhase();
        if (msg.sender != a.tenant) revert NotAuthorized();

        uint256 target = a.agreedAmount;
        uint256 balBefore = TOKEN.balanceOf(address(this));
        TOKEN.safeTransferFrom(msg.sender, address(this), target);
        uint256 received = TOKEN.balanceOf(address(this)) - balBefore;
        if (received != target) revert DepositMismatch();

        a.depositAmount = received;
        a.locked = received;
        a.phase = Phase.Active;
        emit AgreementFunded(id, received);
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
        a.tenantWithdrawable += unclaimed;
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
        a.tenantWithdrawable += delta;
        a.locked -= delta;
        a.claimedAmount = newAmount;
        a.claimAmended = true;

        _recordEvidence(id, contentHash, uri, evidenceType, msg.sender);

        if (newAmount == 0) {
            a.phase = Phase.Closed;
            a.closeReason = CloseReason.ClaimRetracted;
            emit ClaimRetracted(id);
        } else {
            emit ClaimAmended(id, newAmount, delta);
        }
    }

    /// @notice Supplementary evidence from either party while a claim is live.
    function submitEvidence(uint256 id, bytes32 contentHash, string calldata uri, uint8 evidenceType) external {
        Agreement storage a = _agreement(id);
        if (a.phase != Phase.ClaimOpen && a.phase != Phase.Disputed) revert InvalidPhase();
        if (msg.sender != a.landlord && msg.sender != a.tenant) revert NotAuthorized();
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
        if (msg.sender != a.tenant) revert NotAuthorized();
        if (block.timestamp < a.claimSubmissionDeadline) revert ClaimWindowStillOpen();

        uint256 amount = a.locked;
        a.tenantWithdrawable += amount;
        a.locked = 0;
        a.phase = Phase.Closed;
        a.closeReason = CloseReason.NoClaim;
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
        if (toTenant > 0) a.tenantWithdrawable += toTenant;
        a.locked = 0;
        a.phase = Phase.Closed;
        a.closeReason = CloseReason.ResolvedByArbiter;
        emit DisputeResolved(id, awardToLandlord, toTenant);
    }

    /// @notice Permissionless. If the arbiter never rules, the disputed amount defaults
    ///         to the tenant - an unproven claim is treated as unproven.
    function claimArbiterTimeout(uint256 id) external {
        Agreement storage a = _agreement(id);
        if (a.phase != Phase.Disputed) revert InvalidPhase();
        if (block.timestamp < a.arbiterRulingDeadline) revert ArbiterRulingWindowStillOpen();

        uint256 amount = a.locked;
        a.tenantWithdrawable += amount;
        a.locked = 0;
        a.phase = Phase.Closed;
        a.closeReason = CloseReason.ResolvedByTimeout;
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
        if (newArbiter == a.landlord || newArbiter == a.tenant) revert InvalidRoleAssignment();

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
        if (a.pendingArbiter == address(0)) revert NoReplacementPending();
        if (msg.sender != a.pendingArbiterProposer) revert NotAuthorized();

        a.pendingArbiter = address(0);
        a.pendingArbiterProposer = address(0);
        a.pendingArbiterConfirmed = false;
        emit ArbiterReplacementCancelled(id);
    }

    function resignAsArbiter(uint256 id) external {
        Agreement storage a = _agreement(id);
        _requireReplaceablePhase(a.phase);
        if (msg.sender != a.arbiter) revert NotAuthorized();
        a.arbiterResigned = true;
        emit ArbiterResigned(id, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Withdrawal (pull-based)
    // ---------------------------------------------------------------------

    function withdraw(uint256 id) external nonReentrant {
        Agreement storage a = _agreement(id);

        uint256 amount;
        if (msg.sender == a.tenant) {
            amount = a.tenantWithdrawable;
            if (amount == 0) revert NothingToWithdraw();
            a.tenantWithdrawable = 0;
        } else if (msg.sender == a.landlord) {
            amount = a.landlordWithdrawable;
            if (amount == 0) revert NothingToWithdraw();
            a.landlordWithdrawable = 0;
        } else {
            revert NotAuthorized();
        }

        a.withdrawn += amount;
        TOKEN.safeTransfer(msg.sender, amount);
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
        return agreements[id];
    }

    function evidenceCount(uint256 id) external view returns (uint256) {
        return _evidence[id].length;
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
