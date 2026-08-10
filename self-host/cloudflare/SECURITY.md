# Self-host security boundary

- Base Sepolia and freely mintable test tokens only.
- No production custody, bank, escrow-provider, legal, or compliance guarantee.
- D1 stores account-scoped proposal and workflow metadata; R2 stores private evidence ciphertext.
- R2 must remain private and evidence must remain encrypted at the application layer.
- Privy, email, Cloudflare, RPC, DNS, and wallet settings are operator-controlled trust boundaries.
- `PUBLIC_APP_URL`, Privy allowed origins, and email links must identify one canonical HTTPS origin.
- Never disable transaction-receipt verification, activity-registry binding verification, address
  attestation, rate limits, lifecycle guards, or the compliance source gate to make readiness pass.
- Keep secrets out of source, build artifacts, logs, screenshots, chat, browser storage, and public
  object storage.
- Stop the pilot on a readiness failure, key mismatch, unexpected contract address, missing backup,
  cross-account data leak, unsigned package, or unreviewed migration.

Read the bundled privacy threat model, security review, and incident-response runbook for the
full boundary and known residual risks.
