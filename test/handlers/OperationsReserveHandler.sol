// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {OpenEscrow} from "../../contracts/OpenEscrow.sol";
import {OperationsReserve} from "../../contracts/OperationsReserve.sol";
import {MockYieldUSDC} from "../../contracts/MockYieldUSDC.sol";
import {MockUSDC} from "../mocks/MockUSDC.sol";

/// @notice Stateful actor for reserve accounting and withdrawal invariants.
///         It is deliberately the immutable treasury so fuzzed withdrawals use
///         the production authorization path instead of a test-only shortcut.
contract OperationsReserveHandler is Test {
    uint256 internal constant RESERVE_AMOUNT = 5e6;
    uint256 internal constant TENANT_SHARE = RESERVE_AMOUNT / 2;

    MockUSDC public immutable usdc;
    MockYieldUSDC public immutable yieldToken;
    OpenEscrow public immutable escrow;
    OperationsReserve public immutable reserve;

    address public immutable tenantA = address(0xA11CE);
    address public immutable tenantB = address(0xB0B);

    uint256[] internal _agreementIds;
    mapping(uint256 => address) public agreementToken;
    mapping(address => uint256) public cumulativePaid;
    mapping(address => uint256) public cumulativeWithdrawn;

    constructor() {
        usdc = new MockUSDC();
        yieldToken = new MockYieldUSDC();
        reserve = new OperationsReserve(address(usdc), address(yieldToken));
        escrow = new OpenEscrow(address(usdc), address(yieldToken), address(reserve));
        reserve.configureEscrow(address(escrow));

        usdc.mint(tenantA, 100e6);
        usdc.mint(tenantB, 100e6);
        yieldToken.mint(tenantA, 100e6);
        yieldToken.mint(tenantB, 100e6);
        vm.prank(tenantA);
        usdc.approve(address(reserve), type(uint256).max);
        vm.prank(tenantB);
        usdc.approve(address(reserve), type(uint256).max);
        vm.prank(tenantA);
        yieldToken.approve(address(reserve), type(uint256).max);
        vm.prank(tenantB);
        yieldToken.approve(address(reserve), type(uint256).max);

        for (uint256 i = 0; i < 4; ++i) {
            address selectedToken = i % 2 == 0 ? address(usdc) : address(yieldToken);
            address[] memory tenants = new address[](2);
            tenants[0] = tenantA;
            tenants[1] = tenantB;
            uint16[] memory shares = new uint16[](2);
            shares[0] = 5_000;
            shares[1] = 5_000;
            uint256 id = escrow.createMultiTenantAgreementWithToken(
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
            _agreementIds.push(id);
            agreementToken[id] = selectedToken;
        }
    }

    function agreementCount() external view returns (uint256) {
        return _agreementIds.length;
    }

    function agreementIdAt(uint256 index) external view returns (uint256) {
        return _agreementIds[index];
    }

    function payReserveShare(uint256 agreementSeed, uint256 payerSeed) external {
        uint256 id = _agreementIds[agreementSeed % _agreementIds.length];
        address payer = payerSeed % 2 == 0 ? tenantA : tenantB;
        if (reserve.paidAmount(address(escrow), id, payer) != 0) return;

        vm.prank(payer);
        reserve.payReserveShare(address(escrow), id, TENANT_SHARE);
        cumulativePaid[agreementToken[id]] += TENANT_SHARE;
    }

    function withdraw(uint256 tokenSeed, uint256 amountSeed) external {
        address token = tokenSeed % 2 == 0 ? address(usdc) : address(yieldToken);
        uint256 available = reserve.availableBalance(token);
        if (available == 0) return;
        uint256 amount = (amountSeed % available) + 1;
        reserve.withdrawReserveToken(token, address(this), amount);
        cumulativeWithdrawn[token] += amount;
    }
}
