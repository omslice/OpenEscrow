// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

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

    event OperationsReservePaid(
        address indexed escrow, uint256 indexed agreementId, address indexed payer, uint256 amount
    );
    event ReserveWithdrawn(address indexed recipient, uint256 amount);

    error ZeroAddress();
    error AlreadyPaid();
    error PaymentMismatch();
    error NotTreasury();

    constructor(address token) {
        if (token == address(0)) revert ZeroAddress();
        TOKEN = IERC20(token);
        TREASURY = msg.sender;
    }

    function payReserve(address escrow, uint256 agreementId) external nonReentrant {
        if (escrow == address(0)) revert ZeroAddress();
        if (paid[escrow][agreementId][msg.sender]) revert AlreadyPaid();

        uint256 beforeBalance = TOKEN.balanceOf(address(this));
        TOKEN.safeTransferFrom(msg.sender, address(this), RESERVE_AMOUNT);
        if (TOKEN.balanceOf(address(this)) - beforeBalance != RESERVE_AMOUNT) {
            revert PaymentMismatch();
        }

        paid[escrow][agreementId][msg.sender] = true;
        emit OperationsReservePaid(escrow, agreementId, msg.sender, RESERVE_AMOUNT);
    }

    function withdrawReserve(address recipient, uint256 amount) external nonReentrant {
        if (msg.sender != TREASURY) revert NotTreasury();
        if (recipient == address(0)) revert ZeroAddress();
        TOKEN.safeTransfer(recipient, amount);
        emit ReserveWithdrawn(recipient, amount);
    }
}
