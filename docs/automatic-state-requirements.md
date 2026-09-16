# Automatic state requirements

OpenEscrow's official-source check can rewrite requirements for all 50 U.S.
states and the District of Columbia. It uses the state's registered official
source, retains the source text, and publishes an immutable requirements version.
This is automated software research, not an attorney review or a certification
that a property complies with every applicable law.

## What a source check does

1. Fetch the complete registered HTTPS document. HTML, PDF, and plain text are
   supported. A partial response, challenge page, unexpected host, missing
   document, or oversized document cannot become a new requirements version.
2. Convert the document to text. HTTP validators and page metadata do not define
   a legal change. Arizona's complete § 33-1321 text has an additional deterministic
   parser for recognized wording and numeric amendments.
3. For the general state path, extract a structured profile with supporting
   quotations and subsection citations using Workers AI. The previous profile
   is a reference, not legal authority. Model requests contain public sources and
   public rule profiles; they do not contain proposal participants or addresses.
4. Validate the structure, exact source quotations, supported conditions, caps,
   and deadline paths. Generated checklist and exception entries use source
   quotations, preserving the wording of calculations and conditions instead of
   shortening them into potentially misleading paraphrases. Run a separate AI verification request against only the
   candidate and its official text. One correction attempt is allowed; it must
   pass the same validation and verification. Neither pass is a human legal review.
5. Retain the existing version when the applied requirements are identical.
   Otherwise save a new version with change details and a requirements comparison.

The updater does not infer that a law changed merely because a webpage fingerprint
changed. A first rewrite can expand or clarify OE's existing checklist without
reflecting a legislative amendment. Future-effective, ambiguous, unsupported, or
incompletely sourced requirements stay flagged for review.

## Proposal behavior

The source-check button applies an available version to an editable proposal and
shows what changed. Saving also checks sources. If saving finds a new version,
the form returns to the terms step for review before a subsequent save publishes
the proposal. This prevents a save click from silently publishing changed terms.

Locked proposals retain their approved terms. They must be unlocked, revised,
saved, and approved again to adopt a new version. Server validation binds the
submitted terms to the stored profile and blocks finalization against an obsolete
version. Finalized agreements and their recorded snapshots are never rewritten.

The comparison panel includes recent generated versions and the packaged starting
profile. Source text, supporting quotes, generation time, model identifiers, and
the base profile version remain available in the stored evidence.

## Runtime and operations

- Enable `COMPLIANCE_AUTO_UPDATE_ENABLED=true` and the Workers AI binding named
  `AI`, alongside the existing source monitor and D1 binding. The official and
  generated self-host configurations include these settings.
- Apply migration `0026_automatic_compliance_profiles.sql`. The new source texts,
  generated profiles, and update locks are additive; participant records are not
  migrated or replaced.
- The current general extractor and verifier use
  `@cf/openai/gpt-oss-120b` and structured Chat Completions output, with medium
  reasoning effort for extraction and verification. These are
  separate requests. Inference uses the hosting account's
  Workers AI quota and billing.
- Identical verified text reuses its saved profile. D1 locks prevent duplicate
  analyses across Worker instances. Failed verification is cached for the same
  source digest for 24 hours; a different source digest can be evaluated sooner.
- The first analysis of a document may take several minutes. Cached checks are
  much faster. The source monitor also runs the update path on its scheduled cycle.
- Sources fetched by the GitHub monitor include a content-addressed `.source`
  document alongside the existing small attestation. The Worker verifies its full
  hash, official URL, required markers, and attestation freshness before reading
  it. A source hash change queues analysis rather than claiming a new law.

All jurisdictions have an update path; this does not imply that every government
website is reachable or that every existing registry URL provides adequate legal
coverage. Those failures produce a source-specific explanation. Federal/program
and local overlays continue to use their existing versioned source-review paths.
Deadlines that require unsupported operational facts remain review issues;
procedural periods without a supported event clock remain explicit checklist
requirements instead of being mapped to an incorrect date.

## Arizona incident, September 16, 2026

The legacy monitor compared a hash of HTTP metadata and a bounded body sample.
Its Arizona hash differed from the last matching observation on September 7.
Only those hashes were retained, so the exact historic difference cannot be
recovered. The current official HTML includes a September 9 creation-date comment,
which is page metadata, not proof of a statutory amendment.

The official text reviewed on September 16 still contains the 1.5-month cap and
14-day return/accounting period excluding Saturdays, Sundays, and legal holidays,
after termination, delivery of possession, and tenant demand. Those match OE's
previous core settings. The automatic checklist adds fuller subsection coverage;
it does not claim that those additions represent a new law.

Sources: [Arizona § 33-1321](https://www.azleg.gov/ars/33/01321.htm),
[Workers AI bindings](https://developers.cloudflare.com/workers-ai/configuration/bindings/),
[document conversion](https://developers.cloudflare.com/workers-ai/features/markdown-conversion/usage/binding/).
