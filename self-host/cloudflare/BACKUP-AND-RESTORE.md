# Backup and restore

OpenEscrow's hosted record spans **D1, private R2, runtime secrets, and immutable Base Sepolia
contracts**. A D1 export alone is not a complete backup. Never claim recovery readiness until all
four boundaries have been tested with synthetic data.

## Back up D1

Create a full schema-and-data SQL export using the binding in your reviewed config:

```bash
npx wrangler d1 export DB --remote --config frontend/wrangler.selfhost.jsonc \
  --output ./private-backups/openescrow-d1-YYYYMMDD.sql
```

D1 Time Travel is also automatically available for a limited retention window. Treat it as an
additional rollback control, not your only long-term backup.

## Back up private R2

Wrangler can fetch known objects but is not the supported full-bucket backup in this package.
Create a least-privilege R2 S3 API token, configure rclone 1.59 or newer for Cloudflare R2, and copy
the complete private bucket to encrypted storage:

```bash
rclone sync r2:your-openescrow-evidence ./private-backups/r2-evidence-YYYYMMDD \
  --checksum --immutable
rclone check r2:your-openescrow-evidence ./private-backups/r2-evidence-YYYYMMDD \
  --download
```

Keep the R2 API credentials out of the repository and remove them when the backup job no longer
needs access. Do not expose the bucket through `r2.dev` or a public custom domain.

## Preserve keys and deployment identity

Back up, separately:

- every active and retired evidence encryption key, with its exact key ID;
- the address-attestation secret;
- email webhook secrets;
- `wrangler.selfhost.jsonc`, the release manifest, and the deployed commit;
- D1/R2 inventory counts and the time of the backup; and
- the Base Sepolia escrow and activity-registry addresses.

Losing an evidence key can make encrypted files unrecoverable. Relabeling the wrong bytes with an
old key ID can be worse: readiness must remain failed until the exact approved key is restored.

## Rehearse restore without overwriting live data

1. Freeze writes or record a precise cutover time.
2. Create a **new** isolated D1 database and R2 bucket.
3. Import the SQL backup into the new D1 database with `wrangler d1 execute --remote --file`.
4. Copy the complete R2 backup into the new private bucket with rclone and run `rclone check`.
5. Point a separate Worker/config at the rehearsal resources.
6. Restore the exact secrets privately.
7. Verify readiness, row/object counts, D1-to-R2 evidence references, and authorized evidence
   decryption/receipt checks with synthetic accounts.
8. Only after a successful rehearsal, approve a controlled binding switch. Retain the old
   resources until rollback is no longer needed.

An in-place D1 Time Travel restore overwrites the database and cancels in-flight queries. Use it
only as an incident action after recording the current bookmark and stop conditions. Never merge
records by email address, guess wallet relationships, overwrite conflicting object keys, or delete
the last verified backup.

Onchain agreements are not copied by D1/R2 restoration. They remain on Base Sepolia and must be
rediscovered through their original contract, wallet membership, or retained private metadata.
