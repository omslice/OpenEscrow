# Yield-test MVP

The Base Sepolia candidate uses two OpenEscrow-specific, freely mintable test tokens:

- `TestUSDC` (`testUSDC`) is the fixed-value, non-yield option.
- `TestAaveUSDC` (`taUSDC`) is a simulated Aave-style fixed-share option used to show how a
  yield-bearing security deposit could appear and move through the escrow lifecycle.

## Accounting model

- Wallets and OpenEscrow hold fixed ERC-20 shares with 6 decimals.
- `previewAssetsSince(shares, fundedAt)` reports a hypothetical testUSDC value that starts at the
  agreement's funding time, grows at an accelerated 1% per hour, and stops at 5%.
- Escrow claims, disputes, awards, and withdrawals all use shares. This preserves the existing
  conservation and solvency invariants: the contract never invents or reallocates shares merely
  because the displayed value changes.
- The tenant dashboard uses the funded principal as its starting value and shows only the bounded
  demo yield accrued since `fundedAt`.

## Hard boundary

There is no underlying USDC, Aave position, vault, lending protocol, reserve, oracle, redemption
mechanism, or promise of return. Anyone can mint test shares. The accelerated rate is intentionally
unrealistic, is not an APY, and exists only to make value changes visible during short usability
tests without allowing the displayed value to grow forever.

A production yield-bearing deposit needs a separate legal, custody, liquidity, risk, and protocol
design. These test tokens must not be presented as that design. The legacy `MockYieldUSDC`
deployment remains referenced only for historical testnet agreement verification.
