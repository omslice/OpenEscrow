// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {OpenEscrow} from "../contracts/OpenEscrow.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {Handler} from "./handlers/Handler.sol";

/// @notice Requirement #18: stateful invariant tests for accounting conservation and
///         solvency, run across long randomized sequences of every action on many
///         concurrently open agreements.
contract InvariantTest is Test {
    OpenEscrow public escrow;
    MockUSDC public usdc;
    Handler public handler;

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new OpenEscrow(address(usdc));
        handler = new Handler(escrow, usdc);
        targetContract(address(handler));
    }

    /// @dev depositAmount == tenantWithdrawable + landlordWithdrawable + locked + withdrawn,
    ///      for every agreement ever created, after every call in the sequence.
    function invariant_perAgreementConservation() public view {
        uint256 n = handler.agreementCount();
        for (uint256 i = 0; i < n; i++) {
            uint256 id = handler.agreementIds(i);
            OpenEscrow.Agreement memory a = escrow.getAgreement(id);
            assertEq(
                a.depositAmount,
                a.tenantWithdrawable + a.landlordWithdrawable + a.locked + a.withdrawn,
                "per-agreement conservation violated"
            );
        }
    }

    /// @dev The contract's actual token balance must exactly cover the sum of every
    ///      agreement's outstanding (not-yet-withdrawn) liabilities - no more, no less.
    function invariant_contractBalanceCoversAggregateLiabilities() public view {
        uint256 n = handler.agreementCount();
        uint256 total;
        for (uint256 i = 0; i < n; i++) {
            uint256 id = handler.agreementIds(i);
            OpenEscrow.Agreement memory a = escrow.getAgreement(id);
            total += a.tenantWithdrawable + a.landlordWithdrawable + a.locked;
        }
        assertEq(usdc.balanceOf(address(escrow)), total, "contract balance must exactly cover aggregate liabilities");
    }

    /// @dev No agreement's landlord is ever credited (across acceptance + arbiter award,
    ///      cumulatively) more than the amount originally claimed for it.
    function invariant_landlordNeverExceedsOriginalClaim() public view {
        uint256 n = handler.agreementCount();
        for (uint256 i = 0; i < n; i++) {
            uint256 id = handler.agreementIds(i);
            uint256 orig = handler.originalClaim(id);
            if (orig == 0) continue;
            assertLe(handler.landlordCredited(id), orig, "landlord credited more than originally claimed");
        }
    }
}
