// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {YieldEscrowV2Prototype} from "../contracts/experimental/YieldEscrowV2Prototype.sol";
import {YieldEscrowV2Handler} from "./handlers/YieldEscrowV2Handler.sol";
import {MockFixedShareAdapter} from "./mocks/MockFixedShareAdapter.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract YieldEscrowV2InvariantTest is Test {
    MockUSDC public usdc;
    MockFixedShareAdapter public adapter;
    YieldEscrowV2Prototype public prototype;
    YieldEscrowV2Handler public handler;

    function setUp() public {
        usdc = new MockUSDC();
        adapter = new MockFixedShareAdapter(address(usdc));
        prototype = new YieldEscrowV2Prototype(address(adapter));
        handler = new YieldEscrowV2Handler(prototype, adapter, usdc);
        targetContract(address(handler));
    }

    function invariant_settlementBalanceCoversAggregateLiabilities() public view {
        uint256 agreementCount = handler.agreementCount();
        uint256 liabilities;
        for (uint256 i = 0; i < agreementCount; ++i) {
            uint256 id = handler.agreementIds(i);
            YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
            if (agreement.phase == YieldEscrowV2Prototype.Phase.Proposed) {
                liabilities += agreement.fundedPrincipal;
            } else if (agreement.phase == YieldEscrowV2Prototype.Phase.ClaimWindow) {
                liabilities += agreement.redeemedAssets;
            } else if (
                (agreement.phase == YieldEscrowV2Prototype.Phase.ClaimOpen
                        || agreement.phase == YieldEscrowV2Prototype.Phase.Disputed) && agreement.strategySettled
            ) {
                liabilities += agreement.redeemedAssets;
            } else if (
                agreement.phase == YieldEscrowV2Prototype.Phase.Distributed
                    || agreement.phase == YieldEscrowV2Prototype.Phase.Cancelled
            ) {
                liabilities += agreement.landlordWithdrawable + agreement.tenantWithdrawable;
            }
        }

        assertGe(usdc.balanceOf(address(prototype)), liabilities, "settlement balance must cover aggregate liabilities");
    }

    function invariant_receiptBalanceEqualsAttributedAgreementShares() public view {
        uint256 agreementCount = handler.agreementCount();
        uint256 attributedShares;
        for (uint256 i = 0; i < agreementCount; ++i) {
            attributedShares += prototype.getAgreement(handler.agreementIds(i)).receiptShares;
        }
        assertEq(
            adapter.RECEIPT_ASSET().balanceOf(address(prototype)),
            attributedShares,
            "every fixed receipt share must belong to an agreement"
        );
    }

    function invariant_perAgreementAccountingAndClaimsStayBounded() public view {
        uint256 agreementCount = handler.agreementCount();
        for (uint256 i = 0; i < agreementCount; ++i) {
            uint256 id = handler.agreementIds(i);
            YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);

            assertLe(agreement.fundedPrincipal, agreement.principal);
            assertLe(agreement.claimedPrincipal, agreement.principal);
            assertLe(agreement.acceptedPrincipal, agreement.claimedPrincipal);
            assertLe(agreement.landlordPrincipal, agreement.claimedPrincipal);
            assertLe(agreement.landlordWithdrawable, agreement.landlordPrincipal);
            if (agreement.strategySettled) assertEq(agreement.receiptShares, 0);

            if (agreement.phase == YieldEscrowV2Prototype.Phase.Proposed) {
                assertEq(agreement.receiptShares, 0);
                assertEq(agreement.redeemedAssets, 0);
            } else if (agreement.phase == YieldEscrowV2Prototype.Phase.Funded) {
                assertEq(agreement.fundedPrincipal, agreement.principal);
                assertGt(agreement.receiptShares, 0);
                assertEq(agreement.redeemedAssets, 0);
            } else if (agreement.phase == YieldEscrowV2Prototype.Phase.ClaimWindow) {
                assertEq(agreement.receiptShares, 0);
                assertTrue(agreement.strategySettled);
            } else if (
                agreement.phase == YieldEscrowV2Prototype.Phase.ClaimOpen
                    || agreement.phase == YieldEscrowV2Prototype.Phase.Disputed
            ) {
                if (agreement.strategySettled) {
                    assertEq(agreement.receiptShares, 0);
                } else {
                    assertGt(agreement.receiptShares, 0);
                }
            } else if (agreement.phase == YieldEscrowV2Prototype.Phase.ResolvedPendingStrategy) {
                assertFalse(agreement.strategySettled);
                assertGt(agreement.receiptShares, 0);
            } else if (agreement.phase == YieldEscrowV2Prototype.Phase.Distributed) {
                assertTrue(agreement.strategySettled);
                assertEq(
                    agreement.redeemedAssets,
                    agreement.landlordWithdrawable + agreement.tenantWithdrawable + agreement.withdrawnAssets,
                    "distributed agreement must conserve redeemed assets"
                );
            } else if (agreement.phase == YieldEscrowV2Prototype.Phase.Cancelled) {
                assertEq(
                    agreement.fundedPrincipal,
                    agreement.tenantWithdrawable + agreement.withdrawnAssets,
                    "cancelled proposal must conserve contributed principal"
                );
            }
        }
    }
}
