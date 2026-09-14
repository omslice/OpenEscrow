// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {OpenEscrow} from "../contracts/OpenEscrow.sol";
import {TestUSDC} from "../contracts/TestUSDC.sol";
import {TestAaveUSDC} from "../contracts/TestAaveUSDC.sol";

contract TestnetDepositTokensTest is Test {
    TestUSDC internal plain;
    TestAaveUSDC internal yieldShares;

    address internal landlord = makeAddr("landlord");
    address internal tenant = makeAddr("tenant");

    function setUp() public {
        plain = new TestUSDC();
        yieldShares = new TestAaveUSDC(address(plain));
    }

    function test_plainTokenIsFreelyMintableAndFixedValue() public {
        plain.mint(tenant, 1_000e6);

        assertEq(plain.name(), "OpenEscrow Test USDC");
        assertEq(plain.symbol(), "testUSDC");
        assertEq(plain.decimals(), 6);
        assertEq(plain.balanceOf(tenant), 1_000e6);

        vm.warp(block.timestamp + 365 days);
        assertEq(plain.balanceOf(tenant), 1_000e6);
    }

    function test_yieldPreviewStartsAtFundingAndCapsAtFivePercent() public {
        uint256 shares = 1_000e6;
        uint256 fundedAt = block.timestamp;
        yieldShares.mint(tenant, shares);

        assertEq(yieldShares.name(), "OpenEscrow Test Aave-Style USDC");
        assertEq(yieldShares.symbol(), "taUSDC");
        assertEq(yieldShares.decimals(), 6);
        assertEq(yieldShares.previewAssetsAt(shares, fundedAt, fundedAt), shares);
        assertEq(yieldShares.previewAssetsAt(shares, fundedAt, fundedAt + 1 hours), 1_010e6);
        assertEq(yieldShares.previewAssetsAt(shares, fundedAt, fundedAt + 5 hours), 1_050e6);
        assertEq(yieldShares.previewAssetsAt(shares, fundedAt, fundedAt + 365 days), 1_050e6);
        assertEq(yieldShares.balanceOf(tenant), shares, "share balance must remain fixed");
    }

    function test_yieldPreviewIsPositionRelativeInsteadOfDeploymentRelative() public {
        uint256 shares = 1_000e6;
        uint256 firstFunding = 1_000;
        uint256 laterFunding = firstFunding + 90 days;

        assertEq(yieldShares.previewAssetsAt(shares, firstFunding, laterFunding), 1_050e6);
        assertEq(yieldShares.previewAssetsAt(shares, laterFunding, laterFunding), shares);
        assertEq(yieldShares.previewAssetsAt(shares, 0, laterFunding), shares);
    }

    function test_yieldSharesRedeemToBoundedTestAssets() public {
        uint256 shares = 1_000e6;
        uint256 fundedAt = 1_000;
        vm.warp(fundedAt);
        yieldShares.mint(tenant, shares);
        vm.warp(fundedAt + 2 hours);

        vm.prank(tenant);
        uint256 assets = yieldShares.redeemAssetsSince(shares, fundedAt, tenant);

        assertEq(assets, 1_020e6);
        assertEq(yieldShares.balanceOf(tenant), 0);
        assertEq(plain.balanceOf(tenant), 1_020e6);
    }

    function test_bothTokensAreFunctionalEscrowSelections() public {
        OpenEscrow escrow = new OpenEscrow(address(plain), address(yieldShares), address(0));
        uint64 claimWindowStart = uint64(block.timestamp + 1 days);

        vm.startPrank(landlord);
        uint256 plainId = escrow.createAgreementWithToken(
            tenant, address(0), address(plain), 1_000e6, claimWindowStart, 1 days, 1 days, 1 days
        );
        uint256 yieldId = escrow.createAgreementWithToken(
            tenant, address(0), address(yieldShares), 1_000e6, claimWindowStart, 1 days, 1 days, 1 days
        );
        vm.stopPrank();

        plain.mint(tenant, 1_000e6);
        yieldShares.mint(tenant, 1_000e6);
        vm.startPrank(tenant);
        plain.approve(address(escrow), 1_000e6);
        escrow.tenantAcceptAndFund(plainId);
        yieldShares.approve(address(escrow), 1_000e6);
        escrow.tenantAcceptAndFund(yieldId);
        vm.stopPrank();

        OpenEscrow.Agreement memory plainAgreement = escrow.getAgreement(plainId);
        OpenEscrow.Agreement memory yieldAgreement = escrow.getAgreement(yieldId);
        assertEq(plainAgreement.token, address(plain));
        assertEq(yieldAgreement.token, address(yieldShares));
        assertEq(plain.balanceOf(address(escrow)), 1_000e6);
        assertEq(yieldShares.balanceOf(address(escrow)), 1_000e6);

        vm.warp(yieldAgreement.fundedAt + 1 hours);
        assertEq(yieldShares.previewAssetsSince(yieldAgreement.depositAmount, yieldAgreement.fundedAt), 1_010e6);
        assertEq(yieldShares.balanceOf(address(escrow)), 1_000e6);
    }
}
