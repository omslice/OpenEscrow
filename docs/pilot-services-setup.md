# OpenEscrow pilot services setup

This guide covers the external accounts and values that cannot be created safely from the
repository. Complete the email section first. Keep fiat funding in sandbox and keep evidence in
the private vault until each section passes its verification checklist.

## Morning owner checklist

The application code, private R2 binding, D1 records, account sign-in, embedded wallets, manual
email fallbacks, provider adapters, lifecycle state guards, transaction-receipt verification, and
deterministic lifecycle tests are already in place. The readiness check shows four owner actions
before a controlled pilot:

1. **Verify a sending domain in Resend** and create a sending-only API key.
2. **Add the three email runtime values** listed below to the existing Sites deployment.
3. **Activate the 15-minute Cron Trigger** and wait for its first successful run.
4. **Generate and back up the evidence master key**, then add it as
   `EVIDENCE_ENCRYPTION_KEY`.

Do email first, encryption second, and the optional fiat sandbox last. Do not send API keys or
the evidence master key in chat, screenshots, email, or Git. Enter them only in the provider and
hosting secret controls.

After the settings are saved and the site is redeployed, ask Codex to run the pilot readiness
check, or run:

```powershell
cd frontend
npm.cmd run pilot:check
```

The required rows should all report `PASS`. The decentralized-evidence row may remain `OPTIONAL`
for the pilot. Run this again after every deployment because the endpoint checks the deployed
runtime, not the developer machine.

### What the automated release gate now covers

The repository test gate includes 38 server/workflow scenarios and 173 contract tests. The
workflow suite exercises a landlord, two tenants, and an optional arbiter through proposal
revision, unanimous approval, finalization, each tenant's reserve and deposit contribution,
deduction claim, different tenant responses, dispute, ruling, withdrawal, no-claim refund,
claim retraction, email idempotency, evidence authorization, and report generation. It also
rejects duplicate funding, duplicate responses, premature rulings, premature withdrawals,
impossible timeout records, and spoofed evidence file types.

The deterministic suite does not replace a real browser test with separate Google accounts. Use
invented identities and Base Sepolia tokens only for that final operator test. Follow
[`testnet-pilot-runbook.md`](./testnet-pilot-runbook.md) and stop at its first failed safety
condition.

## 0. Verify onchain receipts recorded by the hosted workflow

The D1 agreement record is a readable secondary record; the contracts remain the source of truth.
When receipt verification is enabled, OpenEscrow asks a Base Sepolia JSON-RPC endpoint for every
transaction receipt before saving the related workflow event. It requires a successful receipt,
the current deployed contract address, the expected event signature, and the correct agreement
ID. This prevents a user from attaching an unrelated transaction hash to the agreement record.

Receipt verification is enabled by default and uses `https://sepolia.base.org`. No owner setting
or credential is required for a small controlled testnet pilot. If the public endpoint becomes
unreliable, configure a dedicated Base Sepolia endpoint without exposing its key to the browser:

```dotenv
BASE_SEPOLIA_RPC_URL=https://your-private-base-sepolia-rpc.example/
```

The deployed contract addresses are pinned in the server verifier. Override them only when the
contracts have intentionally been redeployed and the frontend configuration was updated in the
same reviewed release:

```dotenv
OPEN_ESCROW_ADDRESS=0xF18BfDbFd3FF84c603CbDf895D2a96aC7260AE99
OPERATIONS_RESERVE_ADDRESS=0x5d2E9c429F9d117c7b028c8f0f67d37252aDceC0
# Copy ACTIVITY_REGISTRY_ADDRESS from the version-matched deployment manifest.
VERIFY_ACTIVITY_REGISTRY_BINDING=true
```

The retired `0xC004...1951` activity registry points to an earlier escrow and is
not a valid override. The public readiness response performs an `ESCROW()` call
against the configured registry and reports ready only when it matches the
configured OpenEscrow address.

After deployment, submit one invented Base Sepolia action and confirm its running record contains
`transaction_receipt_verified`. A temporary RPC failure must leave the onchain transaction
unchanged and show a retryable “save receipt” error.

`VERIFY_TRANSACTION_RECEIPTS=false` is an emergency local-diagnostics escape hatch. Do not use it
for the public deployment or a controlled pilot.

## 1. Free automatic email delivery

### What is already implemented

- Resend and provider-neutral webhook delivery
- Signed-in self-test that only emails the verified account
- Agreement-activity and deadline notification preferences
- Unsubscribe links
- Idempotent scheduled deliveries with failed-delivery retry
- Privacy-minimal email copy that omits addresses, amounts, evidence, and notes
- A scheduled Worker handler plus a safe opportunistic check during normal app visits

### Resend setup

1. Create a free Resend account.
2. Add a domain you own. Prefer a sending subdomain such as `notify.openescrow.org`.
3. Add the SPF and DKIM records shown by Resend to the domain's DNS settings.
4. Wait until Resend shows the domain as verified.
5. Create a sending-only API key.
6. Add these hosted runtime values to the OpenEscrow Sites deployment:

```dotenv
RESEND_API_KEY=re_replace_with_your_key
NOTIFICATION_FROM_EMAIL=OpenEscrow <notifications@notify.your-domain.example>
PUBLIC_APP_URL=https://openescrow-demo.omrigross.chatgpt.site/
COMPLIANCE_SOURCE_MONITOR_ENABLED=true
ADDRESS_ATTESTATION_SECRET=replace_with_at_least_32_random_bytes
```

Do not put `RESEND_API_KEY` or `ADDRESS_ATTESTATION_SECRET` in a `VITE_`
variable, in Git, or in a browser-visible settings file. The address secret is
used only by the Worker to sign normalized geocoder results. Generate it from
at least 32 random bytes and keep the same value for the lifetime of agreements
created under that deployment so their address attestations remain verifiable.

### Scheduler setup

The Worker already exports its scheduled notification job. Add one hosted Cron Trigger:

```cron
*/15 * * * *
```

This checks every fifteen minutes. The job refuses to run more than once every ten minutes, and
each logical notice has an idempotency key, so repeated checks do not create duplicate email.
When the compliance monitor is enabled, the same trigger starts at most one rotating
official-source batch per day. Source monitoring stores signatures and status metadata in D1;
it does not change an agreement or compliance profile automatically.

If the Sites dashboard does not expose Cron Triggers, add the trigger from the underlying
Cloudflare Worker dashboard after deployment. Normal homepage traffic also performs a safe
fallback check, but that fallback should not be the only scheduler for a real pilot.

### Verify

1. Sign in to OpenEscrow with a Google account.
2. Expand **Account and workspace**.
3. Enable the desired email preferences.
4. Confirm the panel says **Automatic delivery ready**.
5. Click **Send test email**.
6. Check inbox and spam.
7. Open the unsubscribe link from a test account and confirm both optional preferences turn off.

### Self-hosted provider alternative

Set these values instead of `RESEND_API_KEY`:

```dotenv
EMAIL_WEBHOOK_URL=https://your-mail-adapter.example/send
EMAIL_WEBHOOK_TOKEN=replace_with_a_long_random_secret
NOTIFICATION_FROM_EMAIL=OpenEscrow <notifications@your-domain.example>
```

OpenEscrow sends the webhook a JSON envelope containing `from`, `to`, `subject`, `text`, and
`idempotencyKey`. The adapter must return `{"id":"provider-message-id"}` on success. This keeps the
open-source application portable across mail services.

## 2. Debit card and bank onboarding

### Safety boundary

The current escrow and tokens are on Base Sepolia. A real card or bank payment cannot buy the
test tokens. Keep the current faucet for the public demo. Only activate real fiat funding after:

- Base mainnet contracts use supported real USDC;
- the contracts and deployment have passed an independent security review;
- legal and regulatory review approves the pilot flow; and
- the on-ramp provider has approved the application and required KYC flow.

### What is already implemented

- Google/email sign-in with an automatically created Privy embedded wallet
- A card/bank checkout component at the point where a tenant needs funds
- Exact prefilled amount including the tenant's deposit and operations-reserve share
- Sandbox versus production configuration
- Automatic balance refresh after the provider flow
- Existing gas-sponsored approval and agreement funding after funds arrive
- Free test-token fallback on Base Sepolia

### Privy sandbox setup

1. Open the existing Privy application.
2. Enable fiat funding/on-ramp providers.
3. Enable Coinbase Onramp or another supported card provider.
4. Add the OpenEscrow production and local development domains to the allowed origins.
5. Confirm Google login and embedded Ethereum wallets remain enabled.
6. Configure these public build values in `frontend/.env.local` before creating a sandbox build:

```dotenv
VITE_FIAT_ONRAMP_ENABLED=true
VITE_FIAT_ONRAMP_ENVIRONMENT=sandbox
VITE_FIAT_ONRAMP_CHAIN=eip155:8453
VITE_FIAT_ONRAMP_ASSET=0x833589fCD6EDB6E08f4c7C32D4f71b54bdA02913
```

The chain and asset above are Base mainnet USDC identifiers. Sandbox mode simulates the provider
checkout; it must not be confused with funding the Base Sepolia escrow.

These are Vite build-time values, not hosted Worker secrets. Changing them requires a new
validated build and deployment. The enabled UI labels the experience as a sandbox, states that
no real money moves, and continues to direct the tenant to the free Base Sepolia faucet.

### Production design

The intended production experience is:

1. The tenant signs in with Google.
2. OpenEscrow creates and selects the embedded wallet without showing blockchain terminology.
3. The tenant chooses card, Apple Pay, Google Pay, or ACH.
4. The regulated provider performs KYC and delivers USDC to the embedded wallet.
5. OpenEscrow refreshes the balance.
6. The tenant gives one app-level confirmation to approve and fund the escrow.

Use ACH as the recommended option for a full deposit. Card and provider fees must be displayed
separately and must not be taken from the $5 operations reserve.

### Off-ramp design

Do not activate off-ramping on testnet. The eventual tenant action should be labelled **Transfer
refund to my bank**, not **Bridge** or **Send from wallet**. A regulated provider must create the
bank off-ramp session after the escrow has made the tenant's allocation withdrawable. The
production implementation needs provider credentials, webhook verification, KYC status handling,
and a recovery path before it can safely be enabled.

## 3. Private and decentralized evidence

### What is already implemented

- Agreement-party authorization on every upload and retrieval
- Private R2 vault as the default
- SHA-256 integrity receipt for every document
- File-signature validation for PDF, JPEG, PNG, and WebP uploads instead of trusting the
  browser-declared content type
- Optional application-layer AES-256-GCM encryption
- Per-file keys derived with HKDF from a deployment master key
- Encrypted-IPFS mode that refuses to publish evidence unless encryption is configured
- Authorized retrieval, decryption, and integrity verification
- CID and storage method recorded in the private timestamped agreement record

### Generate the evidence master key

Run this once in PowerShell:

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Save the output in a password manager and add it to the hosted runtime as:

```dotenv
EVIDENCE_ENCRYPTION_KEY=replace_with_the_generated_base64_value
```

Losing this value makes encrypted evidence unrecoverable. Changing it after uploads exist also
prevents those existing files from being decrypted. Key rotation and participant-controlled
recovery are not implemented yet.

### Recommended pilot mode: encrypted private R2

```dotenv
EVIDENCE_STORAGE_MODE=private-r2
EVIDENCE_ENCRYPTION_KEY=replace_with_the_generated_base64_value
```

The application encrypts the document before persistent storage and verifies the original
SHA-256 hash after decryption. This is private and inexpensive, but R2 is not decentralized.

Keep this as the pilot default. Do not enable the decentralized mode merely to complete a
checklist; participant-controlled key recovery should be designed before decentralized storage
becomes the only copy of evidence.

### Experimental decentralized mode: encrypted IPFS

1. Create a free Pinata account.
2. Create a JWT that can upload files.
3. Configure:

```dotenv
PINATA_JWT=replace_with_the_server_side_jwt
EVIDENCE_STORAGE_MODE=encrypted-ipfs
EVIDENCE_ENCRYPTION_KEY=replace_with_the_generated_base64_value
IPFS_GATEWAY_URL=https://gateway.pinata.cloud/ipfs
```

Only ciphertext is uploaded to IPFS. Agreement parties open the document through OpenEscrow,
which authorizes them, retrieves the ciphertext by CID, decrypts it, and checks the integrity
receipt. Never paste an unencrypted public `ipfs://` URI containing tenancy evidence.

Storacha can replace Pinata as the decentralized pinning layer later. The encryption and
authorized-retrieval design should remain the same; only the upload and gateway adapter changes.

### Verify

1. Use a proposal containing only invented test identities.
2. Upload a small test PDF or image.
3. Confirm the UI reports private or encrypted decentralized storage.
4. Open the evidence as the landlord and every tenant.
5. Confirm an invalid invitation token receives an access error.
6. Confirm the downloaded response includes the same SHA-256 receipt recorded by OpenEscrow.
7. Never test with a real lease, invoice, address, or damage photograph.

## Pilot go/no-go checklist

- [ ] Resend domain is verified.
- [ ] Signed-in test email arrives.
- [ ] Cron Trigger has a recent successful run.
- [ ] Duplicate scheduled checks send only one message.
- [ ] Base Sepolia receipt verification reports `PASS`.
- [ ] An unrelated transaction hash is rejected from the running record.
- [ ] Base Sepolia still uses only free test tokens.
- [ ] Fiat checkout remains sandbox-only.
- [ ] Evidence master key is backed up.
- [ ] R2 evidence is encrypted and party-authorized.
- [ ] Encrypted-IPFS mode has been tested only with invented documents.
- [ ] No real-money pilot begins before legal review and an independent contract audit.
