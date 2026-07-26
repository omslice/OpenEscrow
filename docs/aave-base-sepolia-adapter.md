# Aave Base Sepolia adapter verification

## Scope

`BaseSepoliaAaveUSDCAdapter` connects the isolated `YieldEscrowV2Prototype` to
Aave V3's fixed-share USDC StataToken V2 vault on Base Sepolia. It is a testnet
integration milestone, not authorization for a production or real-funds release.
The live OpenEscrow MVP does not use this adapter.

## Pinned deployment

The adapter is deliberately chain- and identity-pinned:

| Component | Base Sepolia address |
| --- | --- |
| Chain ID | `84532` |
| Aave V3 Pool | `0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27` |
| Test USDC | `0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f` |
| aBasSepUSDC | `0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC` |
| StataToken V2 USDC | `0xf430cb6E2b85f99222fBFA6dFEa18Ff60FA6B32a` |

These values come from the official
[Aave V3 Base Sepolia address book](https://github.com/aave-dao/aave-address-book/blob/main/src/AaveV3BaseSepolia.sol).
The public RPC and chain ID come from the official
[Base RPC documentation](https://docs.base.org/base-chain/api-reference/rpc-overview).

On July 26, 2026, at Base Sepolia block `44669795`, read-only calls confirmed:

- each configured address contained contract code;
- `StataToken.asset()` returned the configured USDC;
- `StataToken.aToken()` returned the configured aToken;
- `StataToken.POOL()` returned the configured Pool;
- the aToken returned the same underlying USDC and Pool; and
- `StataToken.maxDeposit(...)` was nonzero.

The optional fork test also deposits locally dealt test USDC into the official
StataToken and redeems the resulting shares. Run it explicitly with:

```powershell
$env:BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org"
forge test --match-path test/fork/BaseSepoliaAaveUSDCAdapterFork.t.sol -vv
```

Without that environment variable, the network-dependent fork tests skip so
the deterministic unit suite remains offline-safe.

## Adapter safety boundary

The generic adapter verifies its configured chain, contract code, settlement
asset, aToken, Pool, and vault relationships at construction and rechecks the
identity relationships at runtime so an incompatible upgrade fails closed.
Every deposit and redemption:

- checks current ERC-4626 capacity before moving value;
- pulls an exact amount from the caller;
- uses a one-call allowance and clears it afterward;
- sends output directly to the requested receiver;
- compares the vault's return value to the receiver's actual balance delta; and
- rejects any new settlement-asset or receipt-share dust in the adapter.

The escrow separately checks `maxDeposit` and `maxRedeem`, so an Aave pause,
reserve cap, or liquidity shortage produces an explicit retryable error instead
of silently mutating agreement accounting.

Aave's official
[StataToken V2 documentation](https://github.com/aave-dao/aave-v3-origin/blob/main/src/contracts/extensions/stata-token/README.md)
describes the fixed-share ERC-4626 model. The implementation's current
[`maxDeposit` and `maxRedeem` behavior](https://github.com/aave-dao/aave-v3-origin/blob/main/src/contracts/extensions/stata-token/ERC4626StataTokenUpgradeable.sol)
is why these capacity checks are part of the adapter boundary.

## Residual risk before any real-funds pilot

- The prototype and adapter require an independent smart-contract audit.
- Aave governance can upgrade the StataToken implementation, and emergency
  administrators can pause it.
- Available redemption liquidity can be lower than owned shares.
- A production design needs exposure caps, adapter governance, emergency
  migration, monitoring, and a tested incident runbook.
- The permissionless `minAssetsOut` rule needs a production policy that prevents
  griefing without delaying statutory settlement.
- Test USDC and testnet market behavior do not establish mainnet readiness.

## Deployment

`DeployYieldEscrowV2BaseSepolia.s.sol` deploys a fresh identity-pinned adapter
and V2 prototype using Foundry's keystore/account flow. It does not read a raw
private key. The script has not been broadcast as part of this milestone.
