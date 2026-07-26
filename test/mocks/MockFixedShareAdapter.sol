// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IDepositAssetAdapter} from "../../contracts/interfaces/IDepositAssetAdapter.sol";

contract MockFixedShareToken is ERC20 {
    address public immutable ADAPTER;

    constructor(address adapter) ERC20("Mock Fixed Yield Share", "mfYS") {
        ADAPTER = adapter;
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 shares) external {
        require(msg.sender == ADAPTER, "only adapter");
        _mint(to, shares);
    }

    function burn(uint256 shares) external {
        require(msg.sender == ADAPTER, "only adapter");
        _burn(msg.sender, shares);
    }
}

/// @notice Test-only fixed-share adapter with a configurable asset/share index.
contract MockFixedShareAdapter is IDepositAssetAdapter {
    using SafeERC20 for IERC20;

    uint256 public constant ONE = 1e18;

    IERC20 public immutable SETTLEMENT_ASSET;
    MockFixedShareToken public immutable RECEIPT_ASSET;
    uint256 public assetsPerShare = ONE;
    bool public misreportDeposit;
    bool public misreportRedemption;

    constructor(address settlementAsset_) {
        SETTLEMENT_ASSET = IERC20(settlementAsset_);
        RECEIPT_ASSET = new MockFixedShareToken(address(this));
    }

    function settlementAsset() external view returns (address) {
        return address(SETTLEMENT_ASSET);
    }

    function receiptAsset() external view returns (address) {
        return address(RECEIPT_ASSET);
    }

    function setAssetsPerShare(uint256 newAssetsPerShare) external {
        require(newAssetsPerShare > 0, "zero index");
        assetsPerShare = newAssetsPerShare;
    }

    function setMisreportDeposit(bool enabled) external {
        misreportDeposit = enabled;
    }

    function setMisreportRedemption(bool enabled) external {
        misreportRedemption = enabled;
    }

    function deposit(uint256 assets, address receiver) external returns (uint256 receiptShares) {
        SETTLEMENT_ASSET.safeTransferFrom(msg.sender, address(this), assets);
        receiptShares = Math.mulDiv(assets, ONE, assetsPerShare);
        RECEIPT_ASSET.mint(receiver, receiptShares);
        if (misreportDeposit) ++receiptShares;
    }

    function redeem(uint256 receiptShares, address receiver) external returns (uint256 settlementAssets) {
        IERC20(address(RECEIPT_ASSET)).safeTransferFrom(msg.sender, address(this), receiptShares);
        RECEIPT_ASSET.burn(receiptShares);
        settlementAssets = previewRedeem(receiptShares);
        SETTLEMENT_ASSET.safeTransfer(receiver, settlementAssets);
        if (misreportRedemption) ++settlementAssets;
    }

    function previewRedeem(uint256 receiptShares) public view returns (uint256 settlementAssets) {
        return Math.mulDiv(receiptShares, assetsPerShare, ONE);
    }
}
