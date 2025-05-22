// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title OpenEscrowCore - Core escrow contract for rental deposits
/// @notice Modular structure with support for rules and yield modules
contract OpenEscrowCore {
    struct EscrowAgreement {
        address tenant;
        address landlord;
        uint256 amount;
        uint256 releaseTime;
        bool released;
        bool refunded;
        address rulesModule;
        address yieldModule;
    }

    mapping(uint256 => EscrowAgreement) public agreements;
    uint256 public nextAgreementId;

    event AgreementCreated(uint256 indexed id, address tenant, address landlord, uint256 amount);
    event FundsDeposited(uint256 indexed id, uint256 amount);
    event FundsReleased(uint256 indexed id);
    event FundsRefunded(uint256 indexed id);
}
