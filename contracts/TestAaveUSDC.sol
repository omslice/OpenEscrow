// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {TestUSDC} from "./TestUSDC.sol";

/// @title OpenEscrow Test Aave-Style USDC
/// @notice Test-only fixed shares with bounded, position-relative demo yield.
/// @dev The accelerated display rate is 1% per hour and stops at 5% for each
///      funded position. Redemption mints equally valueless testUSDC so the MVP can
///      demonstrate a principal-denominated settlement without implying that a real
///      Aave position or reserve exists. This contract has no monetary value and is
///      not issued, sponsored, or endorsed by Aave.
contract TestAaveUSDC is ERC20 {
    uint256 public constant ONE = 1e18;
    uint256 public constant DEMO_YIELD_PER_HOUR = 0.01e18;
    uint256 public constant MAX_DEMO_YIELD = 0.05e18;
    TestUSDC public immutable SETTLEMENT_ASSET;

    event DemoPositionRedeemed(
        address indexed account, address indexed receiver, uint256 sharesBurned, uint256 testAssetsMinted
    );

    constructor(address settlementAsset) ERC20("OpenEscrow Test Aave-Style USDC", "taUSDC") {
        require(settlementAsset != address(0) && settlementAsset.code.length > 0, "invalid settlement asset");
        SETTLEMENT_ASSET = TestUSDC(settlementAsset);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Freely mints fixed test shares. These tokens have no monetary value.
    function mint(address to, uint256 shares) external {
        _mint(to, shares);
    }

    /// @notice Returns the bounded demo value of shares since a position was funded.
    function previewAssetsSince(uint256 shares, uint256 fundedAt) public view returns (uint256) {
        return previewAssetsAt(shares, fundedAt, block.timestamp);
    }

    /// @notice Burns the caller's fixed demo shares and mints their bounded testUSDC
    ///         value to `receiver`. OpenEscrow supplies its recorded funding time.
    /// @dev Both assets are permissionlessly mintable Base Sepolia test tokens. This
    ///      method is a deterministic demonstration mechanism, not a real redemption.
    function redeemAssetsSince(uint256 shares, uint256 fundedAt, address receiver) external returns (uint256 assets) {
        require(receiver != address(0), "zero receiver");
        assets = previewAssetsSince(shares, fundedAt);
        _burn(msg.sender, shares);
        SETTLEMENT_ASSET.mint(receiver, assets);
        emit DemoPositionRedeemed(msg.sender, receiver, shares, assets);
    }

    /// @notice Returns the bounded demo value at a supplied timestamp.
    function previewAssetsAt(uint256 shares, uint256 fundedAt, uint256 timestamp) public pure returns (uint256) {
        if (shares == 0 || fundedAt == 0 || timestamp <= fundedAt) return shares;

        uint256 elapsed = timestamp - fundedAt;
        uint256 accruedRate = Math.mulDiv(elapsed, DEMO_YIELD_PER_HOUR, 1 hours);
        if (accruedRate > MAX_DEMO_YIELD) accruedRate = MAX_DEMO_YIELD;

        return shares + Math.mulDiv(shares, accruedRate, ONE);
    }
}
