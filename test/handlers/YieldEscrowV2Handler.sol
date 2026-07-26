// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {YieldEscrowV2Prototype} from "../../contracts/experimental/YieldEscrowV2Prototype.sol";
import {MockFixedShareAdapter} from "../mocks/MockFixedShareAdapter.sol";
import {MockUSDC} from "../mocks/MockUSDC.sol";

/// @notice Stateful action driver for the experimental V2 accounting invariants.
contract YieldEscrowV2Handler is Test {
    YieldEscrowV2Prototype public prototype;
    MockFixedShareAdapter public adapter;
    MockUSDC public usdc;

    address public landlord = makeAddr("v2-landlord");
    address public tenant = makeAddr("v2-tenant");
    address public tenantTwo = makeAddr("v2-tenant-two");
    address public arbiter = makeAddr("v2-arbiter");

    uint256[] public agreementIds;

    uint256 public constant MIN_PRINCIPAL = 100e6;
    uint256 public constant MAX_PRINCIPAL = 10_000e6;
    uint64 public constant FUNDING_PERIOD = 7 days;
    uint64 public constant SETTLEMENT_DELAY = 30 days;
    uint64 public constant CLAIM_PERIOD = 7 days;
    uint64 public constant RESPONSE_PERIOD = 2 days;
    uint64 public constant ARBITER_PERIOD = 3 days;

    constructor(YieldEscrowV2Prototype prototype_, MockFixedShareAdapter adapter_, MockUSDC usdc_) {
        prototype = prototype_;
        adapter = adapter_;
        usdc = usdc_;

        _fundWallet(tenant);
        _fundWallet(tenantTwo);
        _proposeSingle(1_000e6);
        _proposeMulti(1_000e6);
    }

    function agreementCount() external view returns (uint256) {
        return agreementIds.length;
    }

    function propose(uint256 principalSeed, bool multiTenant) external {
        if (agreementIds.length >= 8) return;
        uint256 principal = bound(principalSeed, MIN_PRINCIPAL, MAX_PRINCIPAL);
        if (multiTenant) {
            _proposeMulti(principal);
        } else {
            _proposeSingle(principal);
        }
    }

    function fund(uint256 idSeed, uint256 tenantSeed) external {
        if (agreementIds.length == 0) return;
        uint256 id = _id(idSeed);
        (address[] memory tenants,,,) = prototype.getTenantParticipants(id);
        address funder = tenants[tenantSeed % tenants.length];
        vm.prank(funder);
        try prototype.fundTenantShare(id) {} catch {}
    }

    function cancel(uint256 idSeed) external {
        if (agreementIds.length == 0) return;
        uint256 id = _id(idSeed);
        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        vm.prank(agreement.landlord);
        try prototype.cancelProposal(id) {} catch {}
    }

    function setStrategyIndex(uint64 indexSeed) external {
        uint256 index = bound(uint256(indexSeed), 0.5e18, 2e18);
        adapter.setAssetsPerShare(index);

        uint256 outstandingShares = adapter.RECEIPT_ASSET().totalSupply();
        uint256 requiredAssets = adapter.previewRedeem(outstandingShares);
        uint256 adapterBalance = usdc.balanceOf(address(adapter));
        if (requiredAssets > adapterBalance) {
            usdc.mint(address(adapter), requiredAssets - adapterBalance);
        }
    }

    function settle(uint256 idSeed) external {
        if (agreementIds.length == 0) return;
        try prototype.settleStrategy(_id(idSeed), 0) {} catch {}
    }

    function submitClaim(uint256 idSeed, uint256 claimSeed) external {
        if (agreementIds.length == 0) return;
        uint256 id = _id(idSeed);
        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        uint256 claim = bound(claimSeed, 1, agreement.principal);
        vm.prank(agreement.landlord);
        try prototype.submitClaim(id, claim) {} catch {}
    }

    function amendClaim(uint256 idSeed, uint256 claimSeed) external {
        if (agreementIds.length == 0) return;
        uint256 id = _id(idSeed);
        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        uint256 claim = bound(claimSeed, 0, agreement.claimedPrincipal);
        vm.prank(agreement.landlord);
        try prototype.amendClaim(id, claim) {} catch {}
    }

    function respond(uint256 idSeed, uint256 tenantSeed, uint256 acceptedSeed) external {
        if (agreementIds.length == 0) return;
        uint256 id = _id(idSeed);
        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        (address[] memory tenants,,,) = prototype.getTenantParticipants(id);
        address responder = tenants[tenantSeed % tenants.length];
        uint256 accepted = bound(acceptedSeed, 0, agreement.claimedPrincipal);
        vm.prank(responder);
        try prototype.respondToClaim(id, accepted) {} catch {}
    }

    function finalizeNoResponse(uint256 idSeed) external {
        if (agreementIds.length == 0) return;
        try prototype.finalizeNoResponse(_id(idSeed)) {} catch {}
    }

    function finalizeNoClaim(uint256 idSeed) external {
        if (agreementIds.length == 0) return;
        try prototype.finalizeNoClaim(_id(idSeed)) {} catch {}
    }

    function resolveDispute(uint256 idSeed, uint256 awardSeed) external {
        if (agreementIds.length == 0) return;
        uint256 id = _id(idSeed);
        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        uint256 disputed = agreement.claimedPrincipal - agreement.acceptedPrincipal;
        uint256 award = bound(awardSeed, 0, disputed);
        vm.prank(agreement.arbiter);
        try prototype.resolveDispute(id, award) {} catch {}
    }

    function claimArbiterTimeout(uint256 idSeed) external {
        if (agreementIds.length == 0) return;
        try prototype.claimArbiterTimeout(_id(idSeed)) {} catch {}
    }

    function withdraw(uint256 idSeed, uint256 partySeed) external {
        if (agreementIds.length == 0) return;
        uint256 id = _id(idSeed);
        YieldEscrowV2Prototype.Agreement memory agreement = prototype.getAgreement(id);
        (address[] memory tenants,,,) = prototype.getTenantParticipants(id);
        address caller = partySeed % (tenants.length + 1) == tenants.length
            ? agreement.landlord
            : tenants[partySeed % tenants.length];
        vm.prank(caller);
        try prototype.withdraw(id) {} catch {}
    }

    function warp(uint256 secondsSeed) external {
        uint256 elapsed = bound(secondsSeed, 0, 30 days);
        vm.warp(block.timestamp + elapsed);
    }

    function _proposeSingle(uint256 principal) internal {
        vm.prank(landlord);
        uint256 id = prototype.createAgreement(
            tenant,
            arbiter,
            principal,
            uint64(block.timestamp + FUNDING_PERIOD),
            uint64(block.timestamp + SETTLEMENT_DELAY),
            CLAIM_PERIOD,
            RESPONSE_PERIOD,
            ARBITER_PERIOD
        );
        agreementIds.push(id);
    }

    function _proposeMulti(uint256 principal) internal {
        address[] memory tenants = new address[](2);
        tenants[0] = tenant;
        tenants[1] = tenantTwo;
        uint16[] memory shares = new uint16[](2);
        shares[0] = 6_000;
        shares[1] = 4_000;

        vm.prank(landlord);
        uint256 id = prototype.createMultiTenantAgreement(
            tenants,
            shares,
            arbiter,
            principal,
            uint64(block.timestamp + FUNDING_PERIOD),
            uint64(block.timestamp + SETTLEMENT_DELAY),
            CLAIM_PERIOD,
            RESPONSE_PERIOD,
            ARBITER_PERIOD
        );
        agreementIds.push(id);
    }

    function _fundWallet(address wallet) internal {
        usdc.mint(wallet, 100_000_000e6);
        vm.prank(wallet);
        usdc.approve(address(prototype), type(uint256).max);
    }

    function _id(uint256 seed) internal view returns (uint256) {
        return agreementIds[seed % agreementIds.length];
    }
}
