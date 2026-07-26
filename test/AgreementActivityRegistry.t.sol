// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "./Base.t.sol";
import {AgreementActivityRegistry} from "../contracts/AgreementActivityRegistry.sol";

contract AgreementActivityRegistryTest is Base {
    AgreementActivityRegistry internal registry;
    bytes32 internal constant SNAPSHOT = bytes32(uint256(1));
    bytes32 internal constant ACTIVITY = bytes32(uint256(2));

    function setUp() public override {
        super.setUp();
        registry = new AgreementActivityRegistry(address(escrow));
    }

    function test_constructorRejectsAddressWithoutEscrowCode() public {
        vm.expectRevert(AgreementActivityRegistry.InvalidEscrowContract.selector);
        new AgreementActivityRegistry(makeAddr("not-an-escrow-contract"));
    }

    function test_allAgreementPartiesCanIndependentlyAnchorTheSameSnapshot() public {
        uint256 id = _propose();

        vm.prank(landlord);
        registry.anchorSnapshot(id, SNAPSHOT);
        vm.prank(tenant);
        registry.anchorSnapshot(id, SNAPSHOT);
        vm.prank(arbiter);
        registry.anchorSnapshot(id, SNAPSHOT);

        assertTrue(registry.anchoredBy(id, SNAPSHOT, landlord));
        assertTrue(registry.anchoredBy(id, SNAPSHOT, tenant));
        assertTrue(registry.anchoredBy(id, SNAPSHOT, arbiter));
    }

    function test_nonPartyCannotAnchorOrPublish() public {
        uint256 id = _propose();
        uint8 activityNote = registry.ACTIVITY_NOTE();

        vm.startPrank(stranger);
        vm.expectRevert(AgreementActivityRegistry.NotAgreementParty.selector);
        registry.anchorSnapshot(id, SNAPSHOT);
        vm.expectRevert(AgreementActivityRegistry.NotAgreementParty.selector);
        registry.publishActivity(id, activityNote, ACTIVITY);
        vm.stopPrank();
    }

    function test_duplicateAnchorBySamePartyReverts() public {
        uint256 id = _propose();

        vm.startPrank(tenant);
        registry.anchorSnapshot(id, SNAPSHOT);
        vm.expectRevert(AgreementActivityRegistry.SnapshotAlreadyAnchored.selector);
        registry.anchorSnapshot(id, SNAPSHOT);
        vm.stopPrank();
    }

    function test_partyCanPublishTypedPrivacySafeActivityHash() public {
        uint256 id = _propose();
        uint8 activityDocument = registry.ACTIVITY_DOCUMENT();

        vm.expectEmit(true, true, true, true);
        emit AgreementActivityRegistry.ActivityPublished(
            id, activityDocument, tenant, ACTIVITY, uint64(block.timestamp)
        );
        vm.prank(tenant);
        registry.publishActivity(id, activityDocument, ACTIVITY);
    }

    function test_zeroHashesAndUnknownActivityTypesRevert() public {
        uint256 id = _propose();
        uint8 activityNote = registry.ACTIVITY_NOTE();

        vm.startPrank(landlord);
        vm.expectRevert(AgreementActivityRegistry.InvalidHash.selector);
        registry.anchorSnapshot(id, bytes32(0));
        vm.expectRevert(AgreementActivityRegistry.InvalidHash.selector);
        registry.publishActivity(id, activityNote, bytes32(0));
        vm.expectRevert(AgreementActivityRegistry.InvalidActivityType.selector);
        registry.publishActivity(id, 5, ACTIVITY);
        vm.stopPrank();
    }
}
