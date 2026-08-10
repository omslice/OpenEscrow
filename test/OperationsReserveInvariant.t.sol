// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {OpenEscrow} from "../contracts/OpenEscrow.sol";
import {OperationsReserve} from "../contracts/OperationsReserve.sol";
import {OperationsReserveHandler} from "./handlers/OperationsReserveHandler.sol";

contract OperationsReserveInvariantTest is Test {
    uint256 internal constant RESERVE_AMOUNT = 5e6;
    uint256 internal constant TENANT_SHARE = RESERVE_AMOUNT / 2;

    OperationsReserveHandler internal handler;
    OpenEscrow internal escrow;
    OperationsReserve internal reserve;

    function setUp() public {
        handler = new OperationsReserveHandler();
        escrow = handler.escrow();
        reserve = handler.reserve();
        targetContract(address(handler));
    }

    function invariant_reserveBalancesEqualNetRecordedPayments() public view {
        address plainToken = address(handler.usdc());
        address yieldToken = address(handler.yieldToken());
        assertEq(
            reserve.availableBalance(plainToken),
            handler.cumulativePaid(plainToken) - handler.cumulativeWithdrawn(plainToken)
        );
        assertEq(
            reserve.availableBalance(yieldToken),
            handler.cumulativePaid(yieldToken) - handler.cumulativeWithdrawn(yieldToken)
        );
    }

    function invariant_eachPaymentIsExactUniqueAndTokenBound() public view {
        uint256 count = handler.agreementCount();
        for (uint256 i = 0; i < count; ++i) {
            uint256 id = handler.agreementIdAt(i);
            uint256 paidA = reserve.paidAmount(address(escrow), id, handler.tenantA());
            uint256 paidB = reserve.paidAmount(address(escrow), id, handler.tenantB());
            assertTrue(paidA == 0 || paidA == TENANT_SHARE);
            assertTrue(paidB == 0 || paidB == TENANT_SHARE);
            assertEq(reserve.paid(address(escrow), id, handler.tenantA()), paidA == TENANT_SHARE);
            assertEq(reserve.paid(address(escrow), id, handler.tenantB()), paidB == TENANT_SHARE);
            assertEq(reserve.totalPaid(address(escrow), id), paidA + paidB);
            assertLe(reserve.totalPaid(address(escrow), id), RESERVE_AMOUNT);
            if (paidA + paidB == 0) {
                assertEq(reserve.paymentToken(address(escrow), id), address(0));
            } else {
                assertEq(reserve.paymentToken(address(escrow), id), handler.agreementToken(id));
            }
        }
    }

    function invariant_immutableBindingsNeverDrift() public view {
        assertEq(address(reserve.ESCROW()), address(escrow));
        assertEq(escrow.OPERATIONS_RESERVE(), address(reserve));
        assertEq(reserve.TREASURY(), address(handler));
        assertEq(address(reserve.TOKEN()), address(handler.usdc()));
        assertEq(address(reserve.YIELD_TOKEN()), address(handler.yieldToken()));
    }
}
