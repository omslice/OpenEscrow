// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {OpenEscrow} from "../contracts/OpenEscrow.sol";
import {OperationsReserve} from "../contracts/OperationsReserve.sol";
import {MockYieldUSDC} from "../contracts/MockYieldUSDC.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {ReentrantToken} from "./mocks/ReentrantToken.sol";

contract OperationsReserveTest is Test {
    MockUSDC internal usdc;
    MockYieldUSDC internal yieldToken;
    OpenEscrow internal escrow;
    OperationsReserve internal reserve;

    address internal tenant = makeAddr("tenant");
    address internal cotenant = makeAddr("cotenant");
    address internal recipient = makeAddr("recipient");

    function setUp() public {
        usdc = new MockUSDC();
        yieldToken = new MockYieldUSDC();
        reserve = new OperationsReserve(address(usdc), address(yieldToken));
        escrow = new OpenEscrow(address(usdc), address(yieldToken), address(reserve));
        reserve.configureEscrow(address(escrow));

        usdc.mint(tenant, 20e6);
        usdc.mint(cotenant, 20e6);
        yieldToken.mint(tenant, 20e6);
        yieldToken.mint(cotenant, 20e6);

        vm.prank(tenant);
        usdc.approve(address(reserve), type(uint256).max);
        vm.prank(cotenant);
        usdc.approve(address(reserve), type(uint256).max);
        vm.prank(tenant);
        yieldToken.approve(address(reserve), type(uint256).max);
        vm.prank(cotenant);
        yieldToken.approve(address(reserve), type(uint256).max);
    }

    function _createSingleTenantAgreement(address selectedToken) internal returns (uint256 id) {
        id = escrow.createAgreementWithToken(
            tenant, address(0), selectedToken, 1_000e6, uint64(block.timestamp + 30 days), 7 days, 7 days, 7 days
        );
    }

    function _createTwoTenantAgreement(address selectedToken) internal returns (uint256 id) {
        address[] memory tenants = new address[](2);
        tenants[0] = tenant;
        tenants[1] = cotenant;
        uint16[] memory shares = new uint16[](2);
        shares[0] = 5_000;
        shares[1] = 5_000;
        id = escrow.createMultiTenantAgreementWithToken(
            tenants,
            shares,
            address(0),
            selectedToken,
            1_000e6,
            uint64(block.timestamp + 30 days),
            7 days,
            7 days,
            7 days
        );
    }

    function _createReentrantReserveAgreement()
        internal
        returns (
            ReentrantToken reentrantToken,
            OperationsReserve reentrantReserve,
            OpenEscrow reentrantEscrow,
            uint256 id
        )
    {
        reentrantToken = new ReentrantToken();
        reentrantReserve = new OperationsReserve(address(reentrantToken), address(yieldToken));
        reentrantEscrow = new OpenEscrow(address(reentrantToken), address(yieldToken), address(reentrantReserve));
        reentrantReserve.configureEscrow(address(reentrantEscrow));
        id = reentrantEscrow.createAgreementWithToken(
            tenant,
            address(0),
            address(reentrantToken),
            1_000e6,
            uint64(block.timestamp + 30 days),
            7 days,
            7 days,
            7 days
        );
        reentrantToken.mint(tenant, 20e6);
        vm.prank(tenant);
        reentrantToken.approve(address(reentrantReserve), type(uint256).max);
    }

    function test_plainAgreementReserveUsesPlainToken() public {
        uint256 id = _createSingleTenantAgreement(address(usdc));

        vm.expectEmit(true, true, true, true);
        emit OperationsReserve.OperationsReservePaid(address(escrow), id, tenant, address(usdc), 5e6);
        vm.prank(tenant);
        reserve.payReserve(address(escrow), id);

        assertTrue(reserve.paid(address(escrow), id, tenant));
        assertEq(reserve.paymentToken(address(escrow), id), address(usdc));
        assertEq(usdc.balanceOf(address(reserve)), 5e6);
        assertEq(yieldToken.balanceOf(address(reserve)), 0);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_yieldAgreementReserveUsesYieldToken() public {
        uint256 id = _createSingleTenantAgreement(address(yieldToken));

        vm.expectEmit(true, true, true, true);
        emit OperationsReserve.OperationsReservePaid(address(escrow), id, tenant, address(yieldToken), 5e6);
        vm.prank(tenant);
        reserve.payReserve(address(escrow), id);

        assertEq(reserve.paymentToken(address(escrow), id), address(yieldToken));
        assertEq(yieldToken.balanceOf(address(reserve)), 5e6);
        assertEq(usdc.balanceOf(address(reserve)), 0);
    }

    function test_duplicatePaymentReverts() public {
        uint256 id = _createSingleTenantAgreement(address(usdc));
        vm.startPrank(tenant);
        reserve.payReserve(address(escrow), id);
        vm.expectRevert(OperationsReserve.AlreadyPaid.selector);
        reserve.payReserve(address(escrow), id);
        vm.stopPrank();
    }

    function test_tenantsCanSplitYieldAgreementReserve() public {
        uint256 id = _createTwoTenantAgreement(address(yieldToken));

        vm.prank(tenant);
        reserve.payReserveShare(address(escrow), id, 2_500_000);
        vm.prank(cotenant);
        reserve.payReserveShare(address(escrow), id, 2_500_000);

        assertEq(reserve.paidAmount(address(escrow), id, tenant), 2_500_000);
        assertEq(reserve.paidAmount(address(escrow), id, cotenant), 2_500_000);
        assertEq(reserve.totalPaid(address(escrow), id), 5_000_000);
        assertEq(reserve.paymentToken(address(escrow), id), address(yieldToken));
        assertEq(yieldToken.balanceOf(address(reserve)), 5_000_000);
        assertEq(usdc.balanceOf(address(reserve)), 0);
    }

    function test_splitPaymentMustMatchExactEqualShare() public {
        uint256 id = _createTwoTenantAgreement(address(usdc));

        vm.prank(tenant);
        vm.expectRevert(OperationsReserve.PaymentMismatch.selector);
        reserve.payReserveShare(address(escrow), id, 4_000_000);
    }

    function test_nonTenantCannotPrepayAndBlockAgreementReserve() public {
        uint256 id = _createSingleTenantAgreement(address(usdc));
        address stranger = makeAddr("stranger");
        usdc.mint(stranger, 20e6);
        vm.prank(stranger);
        usdc.approve(address(reserve), type(uint256).max);

        vm.prank(stranger);
        vm.expectRevert(OperationsReserve.PaymentMismatch.selector);
        reserve.payReserveShare(address(escrow), id, 5_000_000);
    }

    function test_reserveRejectsAnotherEscrow() public {
        OpenEscrow anotherEscrow = new OpenEscrow(address(usdc), address(yieldToken), address(0));

        vm.prank(tenant);
        vm.expectRevert(OperationsReserve.UnsupportedEscrow.selector);
        reserve.payReserve(address(anotherEscrow), 0);
    }

    function test_configurationRejectsTokenMismatch() public {
        MockUSDC otherToken = new MockUSDC();

        OperationsReserve mismatched = new OperationsReserve(address(otherToken), address(yieldToken));
        vm.expectRevert(OperationsReserve.TokenConfigurationMismatch.selector);
        mismatched.configureEscrow(address(escrow));

        vm.expectRevert(OpenEscrow.InvalidOperationsReserve.selector);
        new OpenEscrow(address(usdc), address(yieldToken), address(mismatched));
    }

    function test_configurationRejectsEscrowThatDoesNotLinkBack() public {
        OperationsReserve unlinked = new OperationsReserve(address(usdc), address(yieldToken));
        OpenEscrow linkedElsewhere = new OpenEscrow(address(usdc), address(yieldToken), address(reserve));

        vm.expectRevert(OperationsReserve.EscrowConfigurationMismatch.selector);
        unlinked.configureEscrow(address(linkedElsewhere));
    }

    function test_escrowConfigurationIsTreasuryOnlyAndOneTime() public {
        vm.expectRevert(OperationsReserve.AlreadyConfigured.selector);
        reserve.configureEscrow(address(escrow));

        OperationsReserve unconfigured = new OperationsReserve(address(usdc), address(yieldToken));
        vm.prank(tenant);
        vm.expectRevert(OperationsReserve.NotTreasury.selector);
        unconfigured.configureEscrow(address(escrow));
    }

    function test_reserveCannotBePaidBeforeArbiterAccepts() public {
        uint256 id = escrow.createAgreementWithToken(
            tenant,
            makeAddr("pendingArbiter"),
            address(usdc),
            1_000e6,
            uint64(block.timestamp + 30 days),
            7 days,
            7 days,
            7 days
        );

        vm.prank(tenant);
        vm.expectRevert(OperationsReserve.InvalidAgreementPhase.selector);
        reserve.payReserve(address(escrow), id);
    }

    function test_reserveCannotBePaidAfterProposalCancellation() public {
        uint256 id = _createSingleTenantAgreement(address(usdc));
        escrow.cancelProposal(id);

        vm.prank(tenant);
        vm.expectRevert(OperationsReserve.InvalidAgreementPhase.selector);
        reserve.payReserve(address(escrow), id);
    }

    function test_atomicReserveRecordRejectsCancelledAgreementEvenWithBalance() public {
        uint256 id = _createSingleTenantAgreement(address(usdc));
        escrow.cancelProposal(id);
        usdc.mint(address(reserve), 5e6);

        vm.prank(address(escrow));
        vm.expectRevert(OperationsReserve.InvalidAgreementPhase.selector);
        reserve.recordReservePayment(id, tenant, 5e6);
    }

    function test_atomicFundingUsesOneEscrowAllowanceAndOneFundingCall() public {
        uint256 id = _createSingleTenantAgreement(address(usdc));
        usdc.mint(tenant, 1_000e6);
        vm.startPrank(tenant);
        usdc.approve(address(reserve), 0);
        usdc.approve(address(escrow), 1_005e6);
        escrow.fundTenantShareWithReserve(id);
        vm.stopPrank();

        OpenEscrow.Agreement memory funded = escrow.getAgreement(id);
        assertEq(uint8(funded.phase), uint8(OpenEscrow.Phase.Active));
        assertEq(funded.depositAmount, 1_000e6);
        assertEq(funded.locked, 1_000e6);
        assertEq(usdc.balanceOf(address(escrow)), 1_000e6);
        assertEq(usdc.balanceOf(address(reserve)), 5e6);
        assertEq(usdc.allowance(tenant, address(reserve)), 0);
        assertEq(usdc.allowance(tenant, address(escrow)), 0);
        assertTrue(reserve.paid(address(escrow), id, tenant));
        assertEq(reserve.paidAmount(address(escrow), id, tenant), 5e6);
        assertEq(reserve.availableBalance(address(usdc)), 5e6);
    }

    function test_atomicFundingRevertsWithoutAllowanceForCombinedTotal() public {
        uint256 id = _createSingleTenantAgreement(address(usdc));
        usdc.mint(tenant, 1_000e6);
        vm.startPrank(tenant);
        usdc.approve(address(escrow), 1_000e6);
        vm.expectRevert();
        escrow.fundTenantShareWithReserve(id);
        vm.stopPrank();

        assertEq(escrow.getAgreement(id).depositAmount, 0);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(usdc.balanceOf(address(reserve)), 0);
        assertFalse(reserve.paid(address(escrow), id, tenant));
    }

    function test_multiTenantAtomicFundingSplitsReserveEvenly() public {
        uint256 id = _createTwoTenantAgreement(address(usdc));
        usdc.mint(tenant, 500e6);
        usdc.mint(cotenant, 500e6);

        vm.prank(tenant);
        usdc.approve(address(escrow), 502_500_000);
        vm.prank(cotenant);
        usdc.approve(address(escrow), 502_500_000);
        vm.prank(tenant);
        escrow.fundTenantShareWithReserve(id);
        vm.prank(cotenant);
        escrow.fundTenantShareWithReserve(id);

        assertEq(uint8(escrow.getAgreement(id).phase), uint8(OpenEscrow.Phase.Active));
        assertEq(escrow.tenantContribution(id, tenant), 500e6);
        assertEq(escrow.tenantContribution(id, cotenant), 500e6);
        assertEq(reserve.paidAmount(address(escrow), id, tenant), 2_500_000);
        assertEq(reserve.paidAmount(address(escrow), id, cotenant), 2_500_000);
        assertEq(reserve.totalPaid(address(escrow), id), 5e6);
    }

    function test_onlyTreasuryCanWithdrawPlainAndYieldReserves() public {
        uint256 plainId = _createSingleTenantAgreement(address(usdc));
        uint256 yieldId = _createSingleTenantAgreement(address(yieldToken));
        vm.prank(tenant);
        reserve.payReserve(address(escrow), plainId);
        vm.prank(tenant);
        reserve.payReserve(address(escrow), yieldId);

        vm.prank(tenant);
        vm.expectRevert(OperationsReserve.NotTreasury.selector);
        reserve.withdrawReserve(recipient, 5e6);

        reserve.withdrawReserve(recipient, 5e6);
        reserve.withdrawReserveToken(address(yieldToken), recipient, 5e6);
        assertEq(usdc.balanceOf(recipient), 5e6);
        assertEq(yieldToken.balanceOf(recipient), 5e6);
    }

    function test_reentrantReservePaymentRevertsWithoutRecordingFunds() public {
        (ReentrantToken reentrantToken, OperationsReserve reentrantReserve,, uint256 id) =
            _createReentrantReserveAgreement();
        address escrowAddress = address(reentrantReserve.ESCROW());
        reentrantToken.arm(address(reentrantReserve), abi.encodeCall(reentrantReserve.payReserve, (escrowAddress, id)));

        vm.prank(tenant);
        vm.expectRevert();
        reentrantReserve.payReserve(escrowAddress, id);

        assertFalse(reentrantReserve.paid(escrowAddress, id, tenant));
        assertEq(reentrantReserve.availableBalance(address(reentrantToken)), 0);
        assertEq(reentrantToken.balanceOf(address(reentrantReserve)), 0);
    }

    function test_reentrantReserveWithdrawalRevertsWithoutReducingAccounting() public {
        (ReentrantToken reentrantToken, OperationsReserve reentrantReserve,, uint256 id) =
            _createReentrantReserveAgreement();
        address escrowAddress = address(reentrantReserve.ESCROW());
        vm.prank(tenant);
        reentrantReserve.payReserve(escrowAddress, id);
        reentrantToken.arm(
            address(reentrantReserve), abi.encodeCall(reentrantReserve.withdrawReserve, (recipient, 5e6))
        );

        vm.expectRevert();
        reentrantReserve.withdrawReserve(recipient, 5e6);

        assertEq(reentrantReserve.availableBalance(address(reentrantToken)), 5e6);
        assertEq(reentrantToken.balanceOf(address(reentrantReserve)), 5e6);
        assertEq(reentrantToken.balanceOf(recipient), 0);
    }
}
