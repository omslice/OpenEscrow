# Hosted-data continuity verification

OpenEscrow keeps ChatGPT Sites and Cloudflare storage independent. Matching application code does
not mean D1 rows or private R2 evidence were copied. This procedure creates private, keyed
fingerprints for complete exports and compares them without writing names, emails, agreement IDs,
R2 keys, evidence bytes, or other row values into the comparison manifest.

The tooling is verification-only. It never imports, overwrites, or deletes hosted data.

## What a passing comparison proves

A `match` result proves that both supplied D1 exports have the same schema and typed row content,
and that both complete R2 exports contain the same object identifiers, sizes, and encrypted bytes.
It also checks that every private-R2 object referenced by D1 evidence metadata is present in the
supplied R2 inventory.

A result cannot be accepted when either provider supplied only a partial R2 inventory. Known D1
object references are not proof that an R2 bucket has no unreferenced objects. The command returns
`incomplete` in that case. A provider timestamp, bucket name, row count, or spot check is not a
substitute for a complete export.

## Private working directory

Use a private directory outside the Git repository. Never commit the raw SQL export, R2 inventory,
object bytes, HMAC key, generated manifest, or comparison report. Keep the same one-time HMAC key
for source and destination, then remove the working copy under the approved retention policy.

In Windows PowerShell:

```powershell
$oeContinuityRoot = Join-Path $env:LOCALAPPDATA "OpenEscrow\continuity-review"
New-Item -ItemType Directory -Force -Path $oeContinuityRoot | Out-Null
$oeContinuityKey = New-Object byte[] 32
$oeContinuityRng = [Security.Cryptography.RandomNumberGenerator]::Create()
$oeContinuityRng.GetBytes($oeContinuityKey)
$oeContinuityRng.Dispose()
[IO.File]::WriteAllBytes((Join-Path $oeContinuityRoot "comparison-key.bin"), $oeContinuityKey)
```

The key is not an application secret and must not be uploaded to either host. It exists only to
prevent the sanitized fingerprints from becoming a guessing oracle for private record values.

## Capture a D1 export

For the current Cloudflare staging database, run from `frontend`:

```powershell
npx wrangler d1 export DB --remote --env staging --skip-confirmation --output "$oeContinuityRoot\cloudflare-d1.sql"
```

This command is read-only. Keep the SQL private. For ChatGPT Sites, obtain the complete managed D1
export through an owner-accessible Sites export or support path. If Sites cannot provide one, the
historical dataset cannot be proven migrated and must remain on Sites under the disclosed fresh-
Cloudflare-data option.

## Describe the complete R2 export

An R2 inventory is a private JSON file beside the exported object files:

```json
{
  "schemaVersion": "openescrow-r2-private-export/v1",
  "complete": true,
  "objects": [
    {
      "key": "private/provider/object-key",
      "file": "objects/opaque-local-filename.bin",
      "size": 12345
    }
  ]
}
```

`file` must be relative to the inventory file and cannot escape that directory. `complete: true`
may be used only when the provider export covers the whole bucket. Wrangler can report bucket
size/count and retrieve a known object, but its current CLI does not list/export every R2 object.
Therefore a non-empty bucket needs a complete provider inventory/API export or a separately audited
read-only binding procedure. A verified provider-reported zero-object bucket may use an empty
`objects` array with `complete: true`; preserve the private provider output alongside the review.

## Generate and compare manifests

From `frontend`, generate both manifests with the same key:

```powershell
npm run data:continuity -- manifest --d1-export "$oeContinuityRoot\sites-d1.sql" --r2-inventory "$oeContinuityRoot\sites-r2.json" --key-file "$oeContinuityRoot\comparison-key.bin" --label "ChatGPT Sites source" --output "$oeContinuityRoot\sites-manifest.json"
npm run data:continuity -- manifest --d1-export "$oeContinuityRoot\cloudflare-d1.sql" --r2-inventory "$oeContinuityRoot\cloudflare-r2.json" --key-file "$oeContinuityRoot\comparison-key.bin" --label "Cloudflare destination" --output "$oeContinuityRoot\cloudflare-manifest.json"
npm run data:continuity -- compare --source "$oeContinuityRoot\sites-manifest.json" --destination "$oeContinuityRoot\cloudflare-manifest.json" --output "$oeContinuityRoot\comparison.json"
```

The command refuses to place continuity material inside the repository and refuses to overwrite an
existing report. Exit code `0` means `match`, `1` means a verified mismatch, and `2` means the
evidence is incomplete. Only a `match` result from complete provider exports may support a data-
continuity claim.

## Decision gate

Before any import, the owner must choose one path:

1. Keep Sites as the historical synthetic-data record and operate Cloudflare with a clearly
   disclosed fresh synthetic dataset; or
2. obtain complete private exports, rehearse import into an isolated destination, create manifests
   before and after, require `match`, preserve a verified backup, and only then approve a cutover.

Neither option changes the Base Sepolia contract state. Existing immutable testnet agreements must
remain discoverable through their original deployment even if hosted metadata is not migrated.
