// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal ERC20 whose transfer/transferFrom can be armed to call back into an
///         arbitrary target before moving balances, used to prove OpenEscrow's
///         nonReentrant guards actually block reentrant calls. Real ERC20 tokens (and
///         the pinned test USDC) have no such hook - this exists purely to simulate one.
contract ReentrantToken is IERC20 {
    string public constant name = "Reentrant Test Token";
    string public constant symbol = "RTT";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public attackTarget;
    bytes public attackData;
    bool public armed;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function selfApprove(address spender, uint256 amount) external {
        allowance[address(this)][spender] = amount;
        emit Approval(address(this), spender, amount);
    }

    function arm(address target, bytes calldata data) external {
        attackTarget = target;
        attackData = data;
        armed = true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _maybeReenter();
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        _maybeReenter();
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function _maybeReenter() internal {
        if (armed) {
            armed = false;
            (bool ok, bytes memory ret) = attackTarget.call(attackData);
            if (!ok) {
                assembly {
                    revert(add(ret, 32), mload(ret))
                }
            }
        }
    }
}
