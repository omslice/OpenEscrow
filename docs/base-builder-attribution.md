# Base Builder Code attribution

OpenEscrow can append an ERC-8021 attribution suffix to user-initiated Base transactions after the
owner registers and verifies the app on Base.dev. Attribution is disabled by default and no Builder
Code is hardcoded in source.

## Configuration

1. Register and verify `https://openescrow.io` on <https://base.dev>.
2. Review Base's current terms, select the real payout address and copy the Builder Code from
   **Settings → Builder Code**.
3. Set the public build-time environment variable:

   ```dotenv
   VITE_BASE_BUILDER_CODE=bc_owner_issued_value
   ```

4. Build and deploy through the normal reviewed release process.

The value is a public attribution identifier, not a private key or secret. It must still come from
the owner-controlled Base.dev project and must not be guessed or fabricated.

## Transaction coverage

- Direct Privy transactions receive the suffix through Privy's `dataSuffix` plugin.
- Wagmi contract writes receive the same suffix through viem's per-transaction `dataSuffix`
  parameter. This explicit path is required because Privy's plugin is not currently applied to
  transactions sent through the `@privy-io/wagmi` adapter.
- When the environment variable is blank, both paths behave exactly as before and append nothing.

No contract upgrade or redeployment is required. ERC-8021 data is appended to calldata and ignored
by the called contract while Base's offchain indexer records the app attribution.

## Verification

After deployment, submit one authentic Base Sepolia lifecycle transaction—never synthetic volume
for rewards—and preserve its transaction hash. Verify it in both places:

1. Base's Builder Code validation tool confirms the expected code and ERC-8021 marker.
2. Base.dev shows the attributed transaction in OpenEscrow's onchain analytics after indexing.

The testnet/mainnet distinction remains explicit. Attribution evidence is not proof of production
adoption, a grant, or a reward, and no reward should be recorded until an attributable payment is
received.

## Local checks

```powershell
cd frontend
npm run test:client-logic
npm run build
```

The client-logic suite verifies that an unset or whitespace-only value disables attribution and
that an owner-supplied code is trimmed and encoded with the official `ox/erc8021` utility.
