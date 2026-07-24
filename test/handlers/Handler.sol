// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {OpenEscrow} from "../../contracts/OpenEscrow.sol";
import {MockUSDC} from "../mocks/MockUSDC.sol";

/// @notice Drives randomized, bounded-but-otherwise-arbitrary sequences of every
///         OpenEscrow action across a small pool of actors and many agreements, for
///         Foundry's stateful invariant fuzzer. Invalid preconditions are allowed to
///         revert (foundry.toml sets `fail_on_revert = false`); this handler bounds
///         inputs where cheap to do so purely to increase the density of *successful*
///         state transitions per run, not for correctness - correctness is entirely
///         the contract's responsibility, never the handler's.
contract Handler is Test {
    OpenEscrow public escrow;
    MockUSDC public usdc;

    address[3] public landlords;
    address[3] public tenants;
    address[3] public arbiters;

    uint256[] public agreementIds;

    // Ghost accounting, used only to strengthen invariant assertions in the test file.
    mapping(uint256 => uint256) public originalClaim; // first-ever submitted claim amount
    mapping(uint256 => uint256) public landlordCredited; // cumulative amount ever credited to landlordWithdrawable

    uint256 public constant MAX_DEPOSIT = 10_000e6;
    uint64 public constant PERIOD = 7 days;

    constructor(OpenEscrow _escrow, MockUSDC _usdc) {
        escrow = _escrow;
        usdc = _usdc;
        for (uint256 i = 0; i < 3; i++) {
            landlords[i] = address(uint160(uint256(keccak256(abi.encode("landlord", i)))));
            tenants[i] = address(uint160(uint256(keccak256(abi.encode("tenant", i)))));
            arbiters[i] = address(uint160(uint256(keccak256(abi.encode("arbiter", i)))));
            usdc.mint(tenants[i], 100_000_000e6);
            vm.prank(tenants[i]);
            usdc.approve(address(escrow), type(uint256).max);
        }
    }

    function agreementCount() external view returns (uint256) {
        return agreementIds.length;
    }

    function _agreementAt(uint256 seed) internal view returns (uint256 id, OpenEscrow.Agreement memory a) {
        id = agreementIds[seed % agreementIds.length];
        a = escrow.getAgreement(id);
    }

    // ---- fuzzable actions -----------------------------------------------

    function propose(uint256 lSeed, uint256 tSeed, uint256 aSeed, uint256 amount) external {
        address l = landlords[lSeed % 3];
        address t = tenants[tSeed % 3];
        address ar = arbiters[aSeed % 3];
        if (t == l || ar == l || ar == t) return;
        amount = bound(amount, 1, MAX_DEPOSIT);

        vm.prank(l);
        try escrow.createAgreement(t, ar, amount, uint64(block.timestamp), PERIOD, PERIOD, PERIOD) returns (
            uint256 id
        ) {
            agreementIds.push(id);
        } catch {}
    }

    function acceptArbiter(uint256 idSeed) external {
        if (agreementIds.length == 0) return;
        (uint256 id, OpenEscrow.Agreement memory a) = _agreementAt(idSeed);
        vm.prank(a.arbiter);
        try escrow.acceptArbiterRole(id) {} catch {}
    }

    function declineArbiter(uint256 idSeed) external {
        if (agreementIds.length == 0) return;
        (uint256 id, OpenEscrow.Agreement memory a) = _agreementAt(idSeed);
        vm.prank(a.arbiter);
        try escrow.declineArbiterRole(id) {} catch {}
    }

    function renominateArbiter(uint256 idSeed, uint256 candidateSeed) external {
        if (agreementIds.length == 0) return;
        (uint256 id, OpenEscrow.Agreement memory a) = _agreementAt(idSeed);
        address candidate = arbiters[candidateSeed % 3];
        vm.prank(a.landlord);
        try escrow.renominateArbiter(id, candidate) {} catch {}
    }

    function cancelProposal(uint256 idSeed) external {
        if (agreementIds.length == 0) return;
        (uint256 id, OpenEscrow.Agreement memory a) = _agreementAt(idSeed);
        vm.prank(a.landlord);
        try escrow.cancelProposal(id) {} catch {}
    }

    function fund(uint256 idSeed) external {
        if (agreementIds.length == 0) return;
        (uint256 id, OpenEscrow.Agreement memory a) = _agreementAt(idSeed);
        vm.prank(a.tenant);
        try escrow.tenantAcceptAndFund(id) {} catch {}
    }

    function submitClaim(uint256 idSeed, uint256 amount) external {
        if (agreementIds.length == 0) return;
        (uint256 id, OpenEscrow.Agreement memory a) = _agreementAt(idSeed);
        if (a.depositAmount == 0) return;
        amount = bound(amount, 1, a.depositAmount);

        vm.prank(a.landlord);
        try escrow.submitClaim(id, amount, keccak256(abi.encode(id, amount, block.timestamp)), "ipfs://x", 0) {
            if (originalClaim[id] == 0) originalClaim[id] = amount;
        } catch {}
    }

    function amendClaim(uint256 idSeed, uint256 newAmount) external {
        if (agreementIds.length == 0) return;
        (uint256 id, OpenEscrow.Agreement memory a) = _agreementAt(idSeed);
        newAmount = bound(newAmount, 0, a.claimedAmount);

        vm.prank(a.landlord);
        try escrow.amendClaim(id, newAmount, keccak256(abi.encode(id, newAmount, "amend")), "ipfs://y", 1) {} catch {}
    }

    function submitEvidence(uint256 idSeed, bool asTenant) external {
        if (agreementIds.length == 0) return;
        (uint256 id, OpenEscrow.Agreement memory a) = _agreementAt(idSeed);
        address caller = asTenant ? a.tenant : a.landlord;
        vm.prank(caller);
        try escrow.submitEvidence(id, keccak256(abi.encode(id, "ev", block.timestamp)), "ipfs://z", 2) {} catch {}
    }

    function respond(uint256 idSeed, uint256 acceptedAmt) external {
        if (agreementIds.length == 0) return;
        (uint256 id, OpenEscrow.Agreement memory a) = _agreementAt(idSeed);
        acceptedAmt = bound(acceptedAmt, 0, a.claimedAmount);

        vm.prank(a.tenant);
        try escrow.respondToClaim(id, acceptedAmt) {
            landlordCredited[id] += acceptedAmt;
        } catch {}
    }

    function finalizeNoResponse(uint256 idSeed) external {
        if (agreementIds.length == 0) return;
        (uint256 id,) = _agreementAt(idSeed);
        try escrow.finalizeNoResponse(id) {} catch {}
    }

    function resolveDispute(uint256 idSeed, uint256 award) external {
        if (agreementIds.length == 0) return;
        (uint256 id, OpenEscrow.Agreement memory a) = _agreementAt(idSeed);
        award = bound(award, 0, a.locked);

        vm.prank(a.arbiter);
        try escrow.resolveDispute(id, award) {
            landlordCredited[id] += award;
        } catch {}
    }

    function claimArbiterTimeout(uint256 idSeed) external {
        if (agreementIds.length == 0) return;
        (uint256 id,) = _agreementAt(idSeed);
        try escrow.claimArbiterTimeout(id) {} catch {}
    }

    function withdrawNoClaim(uint256 idSeed) external {
        if (agreementIds.length == 0) return;
        (uint256 id, OpenEscrow.Agreement memory a) = _agreementAt(idSeed);
        vm.prank(a.tenant);
        try escrow.withdrawNoClaim(id) {} catch {}
    }

    function withdraw(uint256 idSeed, bool asTenant) external {
        if (agreementIds.length == 0) return;
        (uint256 id, OpenEscrow.Agreement memory a) = _agreementAt(idSeed);
        address caller = asTenant ? a.tenant : a.landlord;
        vm.prank(caller);
        try escrow.withdraw(id) {} catch {}
    }

    function proposeReplacement(uint256 idSeed, uint256 whoSeed) external {
        if (agreementIds.length == 0) return;
        (uint256 id, OpenEscrow.Agreement memory a) = _agreementAt(idSeed);
        address proposer = whoSeed % 2 == 0 ? a.landlord : a.tenant;
        address candidate = arbiters[(whoSeed / 2) % 3];
        vm.prank(proposer);
        try escrow.proposeArbiterReplacement(id, candidate) {} catch {}
    }

    function confirmReplacement(uint256 idSeed, bool asLandlord) external {
        if (agreementIds.length == 0) return;
        (uint256 id, OpenEscrow.Agreement memory a) = _agreementAt(idSeed);
        address caller = asLandlord ? a.landlord : a.tenant;
        vm.prank(caller);
        try escrow.confirmArbiterReplacement(id) {} catch {}
    }

    function acceptReplacement(uint256 idSeed) external {
        if (agreementIds.length == 0) return;
        (uint256 id, OpenEscrow.Agreement memory a) = _agreementAt(idSeed);
        vm.prank(a.pendingArbiter);
        try escrow.acceptArbiterRole(id) {} catch {}
    }

    function cancelReplacement(uint256 idSeed) external {
        if (agreementIds.length == 0) return;
        (uint256 id, OpenEscrow.Agreement memory a) = _agreementAt(idSeed);
        vm.prank(a.pendingArbiterProposer);
        try escrow.cancelArbiterReplacementProposal(id) {} catch {}
    }

    function resign(uint256 idSeed) external {
        if (agreementIds.length == 0) return;
        (uint256 id, OpenEscrow.Agreement memory a) = _agreementAt(idSeed);
        vm.prank(a.arbiter);
        try escrow.resignAsArbiter(id) {} catch {}
    }

    function warp(uint256 secs) external {
        secs = bound(secs, 0, 30 days);
        vm.warp(block.timestamp + secs);
    }

    function donate(uint256 amount) external {
        amount = bound(amount, 1, MAX_DEPOSIT);
        usdc.mint(address(this), amount);
        require(usdc.transfer(address(escrow), amount), "donation transfer failed");
    }
}
