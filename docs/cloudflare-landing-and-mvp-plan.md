# OpenEscrow Cloudflare landing and MVP deployment plan

## Goal

Publish a simple, branded OpenEscrow landing page and operate the existing testnet MVP from the
project owner's Cloudflare account without weakening the current testnet boundary or losing D1,
R2, secret, configuration, or hosted-record continuity.

The landing page and MVP will be separate deployables:

- the public landing site will be a small static Cloudflare Worker at the primary OpenEscrow
  domain, with a clear link to the testnet MVP;
- the MVP will remain a full Cloudflare Worker at an `app` subdomain, with the existing server,
  scheduled jobs, D1 `DB` binding, and private R2 `EVIDENCE` binding; and
- the current Sites deployment will remain unchanged as the rollback target until the Cloudflare
  deployment passes data, readiness, authentication, and supervised-pilot checks.

Production fiat, mainnet contracts, FRNT, USDY, and yield-bearing funding routes remain disabled.

## Proposed public structure

- Primary domain: the single-page project landing site.
- `app` subdomain: the OpenEscrow Base Sepolia MVP.
- Existing Sites URL: retained temporarily as the rollback and data-reference deployment.

The exact domain is an owner decision. Until it is selected, development and verification can use
separate `workers.dev` preview addresses.

## Landing-page scope

The page should reuse the current outlined OpenEscrow logo, purple `#8522CC`, near-black
`#08060D`, typography, spacing, dark-mode treatment, and restrained hover motion from the MVP.
It should remain short and consumer-friendly:

1. Hero: what OpenEscrow is and a primary **Try the testnet MVP** action.
2. Three-step explanation: agree, protect the deposit, and reach a documented outcome.
3. Trust section: open source, participant-controlled records, and Ethereum-backed receipts,
   without implying legal approval, insurance, guaranteed outcomes, or production readiness.
4. Testnet safety notice and a secondary link to the source repository when its public URL is
   confirmed.
5. Footer with project links and the optional `omslice.eth` donation message.

The landing site needs no database, object storage, account system, or runtime secret.

## Delivery sequence

### 1. Establish the Cloudflare deployment boundary

- Add a dedicated landing-page package and shared brand assets without coupling its release to the
  authenticated application bundle.
- Add a separate Wrangler configuration for each deployable so a landing-page release cannot
  mutate MVP bindings or data.
- Preserve the existing MVP binding names `DB` and `EVIDENCE` and keep all runtime secrets out of
  source control and client build variables.
- Add a staging environment and production-testnet environment before attaching custom domains.

### 2. Build and validate the landing page

- Implement the responsive single page using the existing logo and design tokens.
- Add accessible navigation, visible keyboard focus, reduced-motion support, mobile layouts,
  metadata, favicon, and a branded social preview.
- Link the primary action to the staging MVP first, then switch it to the verified `app` domain.
- Run build, accessibility, link, mobile-width, and performance checks.

### 3. Package the existing MVP for Cloudflare

- Reuse the current Worker-compatible `fetch` and `scheduled` handlers rather than rewriting the
  application.
- Add Cloudflare static-asset routing with the `ASSETS` binding and keep API requests routed
  through the Worker.
- Bind a Cloudflare D1 database as `DB`, a private R2 bucket as `EVIDENCE`, and the existing
  15-minute scheduled handler.
- Reuse the existing numbered D1 migrations and exact-commit release provenance.
- Add dry-run, configuration, bundle-size, secret-presence, migration, and rollback checks to the
  release envelope.

### 4. Provision private Cloudflare resources

- Authenticate Wrangler to the owner's Cloudflare account without storing an API token in Git or
  chat.
- Create separate staging and production-testnet D1 databases and R2 buckets.
- Apply all migrations to staging first and validate table, index, and trigger coverage.
- Enter notification, Privy, RPC, evidence-encryption, address-attestation, and other runtime
  secrets through Cloudflare's private controls.
- Configure the 15-minute Cron Trigger and conservative observability/usage alerts.

### 5. Decide and execute hosted-data continuity

- Inventory the current Sites D1 records and R2 objects using sanitized counts and key prefixes.
- Determine whether Sites can export the complete D1 database and private R2 objects. Never infer
  portability or overwrite either destination without a verified export.
- If export is available, rehearse import into staging, compare counts and content fingerprints,
  and retain both source and encrypted backup until the pilot is accepted.
- If export is not available, keep the Sites deployment as the historical testnet record and begin
  the owner-hosted Cloudflare pilot with a clearly disclosed fresh synthetic dataset. Do not
  silently present the new database as a continuation of the old one.

### 6. Deploy and verify staging

- Deploy both Workers to preview hostnames.
- Verify the landing page, MVP shell, `/api/system/readiness`, exact commit provenance, D1/R2
  bindings, Cron execution, source-monitor baseline, email, evidence encryption, and address
  attestation.
- Add the staging origin to Privy and any OAuth/provider allowlists.
- Run the automated release, pilot, incident, accessibility, and recovery suites against the
  Cloudflare candidate.

### 7. Attach domains and perform the reversible cutover

- Attach the primary domain to the landing Worker and the `app` subdomain to the MVP Worker.
- Configure the canonical hostname and one explicit `www` redirect rather than serving duplicate
  public origins.
- Update the landing-page MVP link, Privy allowed origins, OAuth redirects, email links, and
  application canonical URL.
- Run a separate-account landlord/tenant pilot and incident/privacy exercise.
- Keep the Sites deployment available until the owner records acceptance and a rollback drill
  succeeds.

### 8. Operate the free-account pilot safely

- Monitor Worker requests and CPU, D1 rows/storage, R2 storage/operations, Cron outcomes, and API
  abuse controls.
- Treat a free-tier limit as a fail-closed pilot outage, not permission to bypass safety checks.
- Establish upgrade thresholds before inviting additional pilot users.

## Acceptance criteria

- The landing page and MVP deploy independently and have separate rollback histories.
- The landing page visibly matches the MVP brand and links to the correct verified MVP origin.
- The MVP readiness endpoint returns HTTP 200 with the exact deployed commit.
- D1 is bound as `DB`, R2 is bound as `EVIDENCE`, the R2 bucket is not public, and all required
  runtime secrets are reported as configured without exposing their values.
- The scheduled notification, compliance-source, and rate-limit jobs run successfully.
- Data continuity is supported by a verified export/import comparison, or the deployment clearly
  starts with a new synthetic dataset while the old Sites deployment remains available.
- Separate-account pilot, incident, accessibility, recovery, and testnet-boundary checks pass.
- The existing Sites deployment can be restored or revisited without a data-destructive action.

## Owner-only inputs and actions

- Choose the primary domain and confirm whether the preferred pattern is the apex domain for the
  landing page and `app.<domain>` for the MVP.
- Confirm that the domain is an active zone in the intended Cloudflare account.
- Complete Cloudflare browser authorization when Wrangler requests it. Never paste the resulting
  token into chat or Git.
- Enter runtime secrets in Cloudflare's private controls and configure provider-side allowed
  origins or redirect URLs.
- Decide whether the existing synthetic Sites records must migrate or may remain in the rollback
  deployment while the Cloudflare pilot starts fresh.
- Run the supervised separate-account pilot and approve the final domain cutover.

## Material unknowns

- The exact OpenEscrow domain and current DNS ownership/configuration.
- Whether the Sites-managed D1 and R2 resources expose a complete owner-accessible export path.
- Whether current Cloudflare free-plan CPU limits accommodate the longest authenticated API and
  scheduled compliance-monitor operations under realistic pilot load.
- The final public source-repository URL and contact/legal links for the landing page.
