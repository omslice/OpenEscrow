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

    OpenEscrow public immutable ESCROW;
    IERC20 public immutable TOKEN;
    IERC20 public immutable YIELD_TOKEN;
    address public immutable TREASURY;

    uint256 public constant RESERVE_AMOUNT = 5e6;

    mapping(address escrow => mapping(uint256 agreementId => mapping(address payer => bool))) public paid;
    mapping(address escrow => mapping(uint256 agreementId => mapping(address payer => uint256))) public paidAmount;
    mapping(address escrow => mapping(uint256 agreementId => uint256)) public totalPaid;
    mapping(address escrow => mapping(uint256 agreementId => address)) public paymentToken;

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

    constructor(address escrow, address token, address yieldToken) {
        if (escrow == address(0) || token == address(0) || yieldToken == address(0)) revert ZeroAddress();
        if (escrow.code.length == 0 || token.code.length == 0 || yieldToken.code.length == 0) {
            revert InvalidContract();
        }
        ESCROW = OpenEscrow(escrow);
        TOKEN = IERC20(token);
        YIELD_TOKEN = IERC20(yieldToken);
        TREASURY = msg.sender;
        if (address(ESCROW.TOKEN()) != token || address(ESCROW.YIELD_TOKEN()) != yieldToken) {
            revert TokenConfigurationMismatch();
        }
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

    function _payReserve(address escrow, uint256 agreementId, uint256 amount) internal {
        if (escrow != address(ESCROW)) revert UnsupportedEscrow();
        if (paid[escrow][agreementId][msg.sender]) revert AlreadyPaid();
        if (amount == 0 || amount > RESERVE_AMOUNT) revert ZeroAmount();

        OpenEscrow.Agreement memory agreement = ESCROW.getAgreement(agreementId);
        address selectedToken = agreement.token;
        if (selectedToken != address(TOKEN) && selectedToken != address(YIELD_TOKEN)) revert UnsupportedToken();

        (address[] memory tenants,,,) = ESCROW.getTenantParticipants(agreementId);
        uint256 payerIndex = type(uint256).max;
        for (uint256 i = 0; i < tenants.length; ++i) {
            if (tenants[i] == msg.sender) {
                payerIndex = i;
                break;
            }
        }
        if (payerIndex == type(uint256).max) revert PaymentMismatch();
        uint256 baseShare = RESERVE_AMOUNT / tenants.length;
        uint256 expectedAmount =
            payerIndex + 1 == tenants.length ? RESERVE_AMOUNT - baseShare * (tenants.length - 1) : baseShare;
        if (amount != expectedAmount) revert PaymentMismatch();
        if (totalPaid[escrow][agreementId] + amount > RESERVE_AMOUNT) revert PaymentMismatch();

        IERC20 reserveToken = IERC20(selectedToken);
        uint256 beforeBalance = reserveToken.balanceOf(address(this));
        reserveToken.safeTransferFrom(msg.sender, address(this), amount);
        if (reserveToken.balanceOf(address(this)) - beforeBalance != amount) {
            revert PaymentMismatch();
        }

        paid[escrow][agreementId][msg.sender] = true;
        paidAmount[escrow][agreementId][msg.sender] = amount;
        totalPaid[escrow][agreementId] += amount;
        paymentToken[escrow][agreementId] = selectedToken;
        emit OperationsReservePaid(escrow, agreementId, msg.sender, selectedToken, amount);
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
        token.safeTransfer(recipient, amount);
        emit ReserveWithdrawn(address(token), recipient, amount);
    }
}
