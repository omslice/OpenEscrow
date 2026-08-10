// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {OpenEscrow} from "./OpenEscrow.sol";

/// @title OpenEscrow Operations Reserve
/// @notice Collects a separately disclosed reserve for sponsored network transactions
///         and document-storage costs. Each agreement pays in the same allowlisted token
///         selected for its refundable deposit. The reserve is never part of the
///         refundable security-deposit principal held by OpenEscrow.
contract OperationsReserve is ReentrancyGuard {
    using SafeERC20 for IERC20;

    OpenEscrow public ESCROW;
    IERC20 public immutable TOKEN;
    IERC20 public immutable YIELD_TOKEN;
    address public immutable TREASURY;

    uint256 public constant RESERVE_AMOUNT = 5e6;

    mapping(address escrow => mapping(uint256 agreementId => mapping(address payer => bool))) public paid;
    mapping(address escrow => mapping(uint256 agreementId => mapping(address payer => uint256))) public paidAmount;
    mapping(address escrow => mapping(uint256 agreementId => uint256)) public totalPaid;
    mapping(address escrow => mapping(uint256 agreementId => address)) public paymentToken;
    mapping(address token => uint256) public availableBalance;

    event EscrowConfigured(address indexed escrow);
    event OperationsReservePaid(
        address indexed escrow, uint256 indexed agreementId, address indexed payer, address token, uint256 amount
    );
    event ReserveWithdrawn(address indexed token, address indexed recipient, uint256 amount);

    error ZeroAddress();
    error InvalidContract();
    error AlreadyPaid();
    error PaymentMismatch();
    error NotTreasury();
    error ZeroAmount();
    error UnsupportedEscrow();
    error UnsupportedToken();
    error TokenConfigurationMismatch();
    error EscrowConfigurationMismatch();
    error InvalidAgreementPhase();
    error AlreadyConfigured();

    constructor(address token, address yieldToken) {
        if (token == address(0) || yieldToken == address(0)) revert ZeroAddress();
        if (token.code.length == 0 || yieldToken.code.length == 0) {
            revert InvalidContract();
        }
        TOKEN = IERC20(token);
        YIELD_TOKEN = IERC20(yieldToken);
        TREASURY = msg.sender;
    }

    /// @notice One-time link to the matching escrow deployment.
    function configureEscrow(address escrow) external {
        if (msg.sender != TREASURY) revert NotTreasury();
        if (address(ESCROW) != address(0)) revert AlreadyConfigured();
        if (escrow == address(0)) revert ZeroAddress();
        if (escrow.code.length == 0) revert InvalidContract();
        OpenEscrow candidate = OpenEscrow(escrow);
        if (address(candidate.TOKEN()) != address(TOKEN) || address(candidate.YIELD_TOKEN()) != address(YIELD_TOKEN)) {
            revert TokenConfigurationMismatch();
        }
        if (candidate.OPERATIONS_RESERVE() != address(this)) revert EscrowConfigurationMismatch();
        ESCROW = candidate;
        emit EscrowConfigured(escrow);
    }

    function payReserve(address escrow, uint256 agreementId) external nonReentrant {
        _payReserve(escrow, agreementId, RESERVE_AMOUNT);
    }

    /// @notice Pays one tenant's disclosed share of the agreement-level reserve.
    ///         OpenEscrow's signed proposal determines the amount; this contract
    ///         records the exact transfer without treating it as refundable escrow.
    function payReserveShare(address escrow, uint256 agreementId, uint256 amount) external nonReentrant {
        _payReserve(escrow, agreementId, amount);
    }

    /// @notice Returns the exact evenly allocated reserve share for a tenant.
    function requiredReserveShare(uint256 agreementId, address payer) public view returns (uint256) {
        if (address(ESCROW) == address(0)) revert UnsupportedEscrow();
        (address[] memory tenants,,,) = ESCROW.getTenantParticipants(agreementId);
        uint256 payerIndex = type(uint256).max;
        for (uint256 i = 0; i < tenants.length; ++i) {
            if (tenants[i] == payer) {
                payerIndex = i;
                break;
            }
        }
        if (payerIndex == type(uint256).max) revert PaymentMismatch();
        uint256 baseShare = RESERVE_AMOUNT / tenants.length;
        uint256 remainder = RESERVE_AMOUNT % tenants.length;
        return payerIndex + 1 == tenants.length ? baseShare + remainder : baseShare;
    }

    /// @notice Records reserve tokens transferred atomically by the configured escrow.
    function recordReservePayment(uint256 agreementId, address payer, uint256 amount) external nonReentrant {
        if (msg.sender != address(ESCROW)) revert UnsupportedEscrow();
        if (paid[msg.sender][agreementId][payer]) revert AlreadyPaid();
        uint256 expectedAmount = requiredReserveShare(agreementId, payer);
        if (amount != expectedAmount) revert PaymentMismatch();

        OpenEscrow.Agreement memory agreement = ESCROW.getAgreement(agreementId);
        // The escrow records its effects before this external call. Earlier tenant
        // contributions therefore remain ReadyToFund, while the final contribution
        // has already advanced the agreement to Active. No other caller can reach
        // this function, and each payer remains one-time guarded below.
        if (agreement.phase != OpenEscrow.Phase.ReadyToFund && agreement.phase != OpenEscrow.Phase.Active) {
            revert InvalidAgreementPhase();
        }
        address selectedToken = agreement.token;
        if (selectedToken != address(TOKEN) && selectedToken != address(YIELD_TOKEN)) revert UnsupportedToken();
        if (IERC20(selectedToken).balanceOf(address(this)) < availableBalance[selectedToken] + amount) {
            revert PaymentMismatch();
        }

        availableBalance[selectedToken] += amount;
        _recordPayment(address(ESCROW), agreementId, payer, selectedToken, amount);
    }

    function _payReserve(address escrow, uint256 agreementId, uint256 amount) internal {
        if (address(ESCROW) == address(0) || escrow != address(ESCROW)) revert UnsupportedEscrow();
        if (paid[escrow][agreementId][msg.sender]) revert AlreadyPaid();
        if (amount == 0 || amount > RESERVE_AMOUNT) revert ZeroAmount();

        OpenEscrow.Agreement memory agreement = ESCROW.getAgreement(agreementId);
        if (agreement.phase != OpenEscrow.Phase.ReadyToFund) revert InvalidAgreementPhase();
        address selectedToken = agreement.token;
        if (selectedToken != address(TOKEN) && selectedToken != address(YIELD_TOKEN)) revert UnsupportedToken();

        uint256 expectedAmount = requiredReserveShare(agreementId, msg.sender);
        if (amount != expectedAmount) revert PaymentMismatch();
        if (totalPaid[escrow][agreementId] + amount > RESERVE_AMOUNT) revert PaymentMismatch();

        IERC20 reserveToken = IERC20(selectedToken);
        uint256 beforeBalance = reserveToken.balanceOf(address(this));
        reserveToken.safeTransferFrom(msg.sender, address(this), amount);
        if (reserveToken.balanceOf(address(this)) - beforeBalance != amount) {
            revert PaymentMismatch();
        }

        availableBalance[selectedToken] += amount;
        _recordPayment(escrow, agreementId, msg.sender, selectedToken, amount);
    }

    function _recordPayment(address escrow, uint256 agreementId, address payer, address token, uint256 amount)
        internal
    {
        if (totalPaid[escrow][agreementId] + amount > RESERVE_AMOUNT) revert PaymentMismatch();
        paid[escrow][agreementId][payer] = true;
        paidAmount[escrow][agreementId][payer] = amount;
        totalPaid[escrow][agreementId] += amount;
        paymentToken[escrow][agreementId] = token;
        emit OperationsReservePaid(escrow, agreementId, payer, token, amount);
    }

    function withdrawReserve(address recipient, uint256 amount) external nonReentrant {
        _withdrawReserve(TOKEN, recipient, amount);
    }

    function withdrawReserveToken(address token, address recipient, uint256 amount) external nonReentrant {
        if (token != address(TOKEN) && token != address(YIELD_TOKEN)) revert UnsupportedToken();
        _withdrawReserve(IERC20(token), recipient, amount);
    }

    function _withdrawReserve(IERC20 token, address recipient, uint256 amount) internal {
        if (msg.sender != TREASURY) revert NotTreasury();
        if (recipient == address(0)) revert ZeroAddress();
        if (amount > availableBalance[address(token)]) revert PaymentMismatch();
        availableBalance[address(token)] -= amount;
        token.safeTransfer(recipient, amount);
        emit ReserveWithdrawn(address(token), recipient, amount);
    }
}
