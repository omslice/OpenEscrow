# Self-host OpenEscrow on Cloudflare

This is the supported first self-host path for the complete OpenEscrow **Base Sepolia testnet**
application. It deploys one Cloudflare Worker with static assets, one D1 database, one private R2
bucket, and one 15-minute scheduled trigger. It does not enable mainnet, real deposits, a fiat
on-ramp, or production yield assets.

The package is for operators who can manage their own Cloudflare and Privy accounts, DNS,
secrets, backups, email provider, privacy notices, and pilot users. OpenEscrow remains free and
open source; a self-hosted operator becomes responsible for their own deployment and data.

## Before you begin

You need:

- Node.js 22 or newer;
- a Cloudflare account with Workers, D1, and R2 available;
- a Privy application configured for Base Sepolia with your eventual HTTPS origin allowed;
- an Ethereum wallet only for testnet activity; and
- optionally, a verified Resend sending domain for participant email.

Keep all testing synthetic. The package shares OpenEscrow's public Base Sepolia contracts, so its
custody state is independently readable onchain, but proposals, account associations, notification
preferences, private evidence, and archives live only in your D1/R2 resources.

## 1. Verify the download

The release contains `SHA256SUMS`, `SBOM.cdx.json`, `release-manifest.json`, and an adjacent
archive checksum. From the extracted package root:

```powershell
Get-FileHash -Algorithm SHA256 .\frontend\package-lock.json
```

Compare important files with `SHA256SUMS`. For a GitHub-built release, also verify its signed
provenance:

```bash
gh attestation verify openescrow-cloudflare-self-host-*.tar.gz --repo omslice/OpenEscrow
```

Do not continue if the source commit, archive checksum, or attestation is unexpected.

## 2. Install and authenticate

```bash
cd frontend
npm ci
npx wrangler login
npx wrangler whoami
```

Confirm Wrangler shows the Cloudflare account you intend to use. Never use another person's
account or OpenEscrow's project account.

## 3. Create isolated storage

Choose unique names and create an empty D1 database and private R2 bucket:

```bash
npx wrangler d1 create your-openescrow-db
npx wrangler r2 bucket create your-openescrow-evidence
```

Record the 32-character Cloudflare account ID, D1 UUID, database name, and bucket name. Do not
enable an `r2.dev` public URL or R2 custom domain for evidence.

## 4. Generate the reviewed configuration

Run this with your own values. The public URL must be the final HTTPS Worker/custom-domain origin
and end in `/`.

```bash
npm run selfhost:configure -- \
  --worker-name your-openescrow-testnet \
  --account-id 11111111111111111111111111111111 \
  --database-name your-openescrow-db \
  --database-id 11111111-1111-4111-8111-111111111111 \
  --bucket-name your-openescrow-evidence \
  --public-url https://your-openescrow.your-subdomain.workers.dev/ \
  --privy-app-id your-privy-public-app-id
```

If you have verified email, add:

```bash
--notification-from "OpenEscrow <updates@your-domain.example>"
```

The command creates `wrangler.selfhost.jsonc` and `.env.production.local`. It refuses OpenEscrow's
project-owned account/resources and keeps receipt checks, the activity registry, private R2,
rate limiting, the scheduler, and all real-money gates in their reviewed testnet state.

```bash
npm run selfhost:check
```

## 5. Create and preserve runtime secrets

Generate a recovery file **outside the extracted app folder**:

```bash
npm run selfhost:secrets -- --output=/absolute/private/path/openescrow-secrets.json
```

The file contains plaintext key material with restrictive permissions where the operating system
supports them. Put an encrypted offline copy in your password manager or secure backup before
uploading it. Never put it in Git, chat, screenshots, support tickets, the release archive, or R2.

Upload the three core secrets:

```bash
npx wrangler secret bulk /absolute/private/path/openescrow-secrets.json --config wrangler.selfhost.jsonc
```

For email, set `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` with `wrangler secret put`. Configure
the Resend webhook for `https://your-origin/api/notifications/delivery-webhook`. Without a verified
sending domain, Resend may restrict recipients and deliverability.

## 6. Build, migrate, dry-run, and deploy

Before deployment, review the bundled Privacy Policy and Terms of Use in the app. They identify
the upstream public project and `openescrow.io`; they do not automatically become legal notices
for a third-party operator. If anyone beyond you will use the instance, replace the operator,
contact, retention, and jurisdiction-specific language with terms appropriate to your deployment
and obtain qualified review where needed. Do not imply that the OpenEscrow project operates or
endorses your instance.

```bash
npm run build:selfhost
npm run selfhost:check -- --require-build
npx wrangler deploy --dry-run --config wrangler.selfhost.jsonc
npx wrangler d1 migrations apply DB --remote --config wrangler.selfhost.jsonc
npx wrangler deploy --config wrangler.selfhost.jsonc
```

Then add the final origin to Privy's allowed origins and Google/OAuth settings. Confirm:

- `/` and `/demo` load over HTTPS;
- `/api/system/readiness` returns HTTP 200;
- the readiness response identifies private R2, encryption/keyring readiness, address
  attestation, receipt verification, and a registry bound to the active escrow;
- a scheduled invocation appears after the 15-minute trigger;
- separate synthetic landlord and tenant accounts see only their own records; and
- evidence upload/download works with an invented test file.

Do not invite real users or upload real tenancy data until those checks pass.

## What this package does not promise

This package is not a legal-compliance guarantee, licensed escrow service, production custody
system, managed email service, managed backup service, or mainnet release. Jurisdiction profiles
remain research aids that fail closed when their source gate is not current. See `SECURITY.md`,
`BACKUP-AND-RESTORE.md`, and `UPGRADE.md` before operating a pilot.
