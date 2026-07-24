// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice ERC20 whose transferFrom silently delivers less than requested (simulating a
///         fee-on-transfer token), used to prove OpenEscrow's balance-delta check on
///         funding rejects a short transfer instead of silently under-crediting the
///         agreement.
contract ShortTransferToken is IERC20 {
    string public constant name = "Short Transfer Test Token";
    string public constant symbol = "STT";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    uint256 public shortfall;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function setShortfall(uint256 amount) external {
        shortfall = amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        uint256 delivered = amount > shortfall ? amount - shortfall : 0;
        balanceOf[from] -= amount;
        balanceOf[to] += delivered;
        emit Transfer(from, to, delivered);
        return true;
    }
}
