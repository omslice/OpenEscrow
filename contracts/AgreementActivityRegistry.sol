// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {OpenEscrow} from "./OpenEscrow.sol";

/// @title OpenEscrow Agreement Activity Registry
/// @notice Lets the landlord, every tenant, or current arbiter attest to canonical
///         agreement-record snapshots and publish privacy-safe activity hashes.
/// @dev No raw messages, emails, evidence, or document pointers are stored here.
///      A hash proves a caller saw particular content; it does not prove that the
///      underlying offchain content was truthful or legally sufficient.
contract AgreementActivityRegistry {
    OpenEscrow public immutable ESCROW;

    uint8 public constant ACTIVITY_NOTE = 1;
    uint8 public constant ACTIVITY_DOCUMENT = 2;
    uint8 public constant ACTIVITY_NOTICE = 3;
    uint8 public constant ACTIVITY_DECISION = 4;

    mapping(uint256 agreementId => mapping(bytes32 snapshotHash => mapping(address party => bool))) public anchoredBy;

    event RecordSnapshotAnchored(
        uint256 indexed agreementId, bytes32 indexed snapshotHash, address indexed party, uint64 timestamp
    );
    event ActivityPublished(
        uint256 indexed agreementId,
        uint8 indexed activityType,
        address indexed party,
        bytes32 contentHash,
        uint64 timestamp
    );

    error ZeroAddress();
    error InvalidEscrowContract();
    error InvalidHash();
    error InvalidActivityType();
    error NotAgreementParty();
    error SnapshotAlreadyAnchored();

    constructor(address escrow) {
        if (escrow == address(0)) revert ZeroAddress();
        if (escrow.code.length == 0) revert InvalidEscrowContract();
        ESCROW = OpenEscrow(escrow);
    }

    function anchorSnapshot(uint256 agreementId, bytes32 snapshotHash) external {
        if (snapshotHash == bytes32(0)) revert InvalidHash();
        _requireAgreementParty(agreementId);
        if (anchoredBy[agreementId][snapshotHash][msg.sender]) {
            revert SnapshotAlreadyAnchored();
        }

        anchoredBy[agreementId][snapshotHash][msg.sender] = true;
        emit RecordSnapshotAnchored(agreementId, snapshotHash, msg.sender, uint64(block.timestamp));
    }

    function publishActivity(uint256 agreementId, uint8 activityType, bytes32 contentHash) external {
        if (activityType < ACTIVITY_NOTE || activityType > ACTIVITY_DECISION) {
            revert InvalidActivityType();
        }
        if (contentHash == bytes32(0)) revert InvalidHash();
        _requireAgreementParty(agreementId);

        emit ActivityPublished(agreementId, activityType, msg.sender, contentHash, uint64(block.timestamp));
    }

    function _requireAgreementParty(uint256 agreementId) internal view {
        OpenEscrow.Agreement memory agreement = ESCROW.getAgreement(agreementId);
        bool isTenant = ESCROW.tenantShareBps(agreementId, msg.sender) != 0;
        bool isCurrentAcceptedArbiter = msg.sender == agreement.arbiter && agreement.arbiterAccepted
            && !agreement.arbiterDeclined && !agreement.arbiterResigned;
        if (msg.sender != agreement.landlord && !isTenant && !isCurrentAcceptedArbiter) {
            revert NotAgreementParty();
        }
    }
}
