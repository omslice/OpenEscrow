// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./OpenEscrowCore.sol";

/// @title EscrowFactory
/// @notice Deploys new instances of OpenEscrowCore and tracks them by user
contract EscrowFactory {
    // Stores all deployed escrow addresses per creator
    mapping(address => address[]) public userEscrows;

    // Global list of all escrows
    address[] public allEscrows;

    /// @notice Deploys a new escrow contract and registers it
    function createEscrow() external returns (address) {
        OpenEscrowCore escrow = new OpenEscrowCore();

        userEscrows[msg.sender].push(address(escrow));
        allEscrows.push(address(escrow));

        return address(escrow);
    }

    /// @notice Returns all escrow contracts created by a specific user
    function getEscrowsByUser(address user) external view returns (address[] memory) {
        return userEscrows[user];
    }

    /// @notice Returns the full list of escrows
    function getAllEscrows() external view returns (address[] memory) {
        return allEscrows;
    }
}
