# Yield-test MVP

The Base Sepolia demo uses `MockYieldUSDC` (`ytUSDC`) to test how a yield-bearing security deposit
would appear and move through the escrow lifecycle.

## Accounting model

- Wallets and OpenEscrow hold fixed ERC-20 shares with 6 decimals.
- `convertToAssets(shares)` reports a hypothetical testUSDC value using a linear index that grows
  20% per 24 hours from token deployment.
- Escrow claims, disputes, awards, and withdrawals all use shares. This preserves the existing
  conservation and solvency invariants: the contract never invents or reallocates shares merely
  because the displayed value changes.
- The tenant dashboard compares the current value with the value at `fundedAt` to show accrued demo
  yield.

## Hard boundary

There is no underlying USDC, vault, lending protocol, reserve, oracle, redemption mechanism, or
promise of return. Anyone can mint test shares. The accelerated rate is intentionally unrealistic
and exists only to make value changes visible during short usability tests.

A production yield-bearing deposit needs a separate legal, custody, liquidity, risk, and protocol
design. This contract must not be presented as that design.
