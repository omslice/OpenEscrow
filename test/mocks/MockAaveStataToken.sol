// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";

contract MockAavePool {}

contract MockATokenIdentity {
    address public immutable UNDERLYING_ASSET_ADDRESS;
    address public immutable POOL;

    constructor(address underlyingAsset, address pool) {
        UNDERLYING_ASSET_ADDRESS = underlyingAsset;
        POOL = pool;
    }
}

contract MockAaveStataToken is ERC4626 {
    address public immutable aToken;
    address public immutable POOL;

    uint256 public depositLimit = type(uint256).max;
    uint256 public redemptionLimit = type(uint256).max;

    constructor(address underlyingAsset, address aToken_, address pool)
        ERC20("Mock Aave Static USDC", "maUSDC")
        ERC4626(IERC20(underlyingAsset))
    {
        aToken = aToken_;
        POOL = pool;
    }

    function setDepositLimit(uint256 newLimit) external {
        depositLimit = newLimit;
    }

    function setRedemptionLimit(uint256 newLimit) external {
        redemptionLimit = newLimit;
    }

    function maxDeposit(address receiver) public view override returns (uint256) {
        uint256 vaultLimit = super.maxDeposit(receiver);
        return vaultLimit < depositLimit ? vaultLimit : depositLimit;
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        uint256 ownerLimit = super.maxRedeem(owner);
        return ownerLimit < redemptionLimit ? ownerLimit : redemptionLimit;
    }
}
