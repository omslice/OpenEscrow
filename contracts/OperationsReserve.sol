// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IOpenEscrowTenantRegistry {
    function getTenantParticipants(uint256 agreementId)
        external
        view
        returns (
            address[] memory tenants,
            uint16[] memory sharesBps,
            uint256[] memory contributions,
            uint256[] memory withdrawable
        );
}

/// @title OpenEscrow Operations Reserve
/// @notice Collects a separately disclosed testUSDC reserve for sponsored network
///         transactions and document-storage costs. The reserve is never part of
///         the refundable security-deposit principal held by OpenEscrow.
contract OperationsReserve is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable TOKEN;
    address public immutable TREASURY;

    uint256 public constant RESERVE_AMOUNT = 5e6;

    mapping(address escrow => mapping(uint256 agreementId => mapping(address payer => bool))) public paid;
    mapping(address escrow => mapping(uint256 agreementId => mapping(address payer => uint256))) public paidAmount;
    mapping(address escrow => mapping(uint256 agreementId => uint256)) public totalPaid;

    event OperationsReservePaid(
        address indexed escrow, uint256 indexed agreementId, address indexed payer, uint256 amount
    );
    event ReserveWithdrawn(address indexed recipient, uint256 amount);

    error ZeroAddress();
    error AlreadyPaid();
    error PaymentMismatch();
    error NotTreasury();
    error ZeroAmount();

    constructor(address token) {
        if (token == address(0)) revert ZeroAddress();
        TOKEN = IERC20(token);
        TREASURY = msg.sender;
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
        if (escrow == address(0)) revert ZeroAddress();
        if (paid[escrow][agreementId][msg.sender]) revert AlreadyPaid();
        if (amount == 0 || amount > RESERVE_AMOUNT) revert ZeroAmount();
        address[] memory tenants;
        try IOpenEscrowTenantRegistry(escrow).getTenantParticipants(agreementId) returns (
            address[] memory agreementTenants, uint16[] memory, uint256[] memory, uint256[] memory
        ) {
            tenants = agreementTenants;
        } catch {
            revert PaymentMismatch();
        }
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

        uint256 beforeBalance = TOKEN.balanceOf(address(this));
        TOKEN.safeTransferFrom(msg.sender, address(this), amount);
        if (TOKEN.balanceOf(address(this)) - beforeBalance != amount) {
            revert PaymentMismatch();
        }

        paid[escrow][agreementId][msg.sender] = true;
        paidAmount[escrow][agreementId][msg.sender] = amount;
        totalPaid[escrow][agreementId] += amount;
        emit OperationsReservePaid(escrow, agreementId, msg.sender, amount);
    }

    function withdrawReserve(address recipient, uint256 amount) external nonReentrant {
        if (msg.sender != TREASURY) revert NotTreasury();
        if (recipient == address(0)) revert ZeroAddress();
        TOKEN.safeTransfer(recipient, amount);
        emit ReserveWithdrawn(recipient, amount);
    }
}
