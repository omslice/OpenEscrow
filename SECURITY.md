# OpenEscrow security policy

OpenEscrow is a Base Sepolia public-interest prototype. It is not audited or authorized for
production custody, real rental deposits, real participant evidence, or mainnet use.

## Supported versions

| Version | Security support |
|---|---|
| Current `main` source | Receives source-level security fixes after review |
| Current public Base Sepolia application | Best-effort testnet containment and remediation; its immutable contract addresses may differ from newer source |
| Older commits and retired deployment cohorts | Not supported; preserved only for history and exact-record verification |
| Mainnet or production-money deployment | None exists or is supported |

Always identify both the source commit and affected deployed address or public URL. A fix on `main`
does not change an immutable deployed contract.

## Report a vulnerability privately

Do not open a public issue, discussion, pull request, social post, or onchain message for an
unresolved vulnerability.

Preferred channels, in order:

1. Use GitHub's private vulnerability-reporting flow from this repository's **Security** tab when
   it is available.
2. Email `privacy@openescrow.io` with the subject `[SECURITY] OpenEscrow vulnerability report`.
   If ordinary email is inappropriate for the sensitivity, first request a safer exchange channel
   without including exploit details.

Include, when available:

- affected commit, component, URL, chain ID, contract address, and function or route;
- impact and who could be harmed;
- minimal reproduction using Base Sepolia, synthetic data, and accounts you control;
- prerequisites, observed and expected behavior, and whether exploitation was attempted;
- suggested mitigation, disclosure constraints, and a safe contact method.

Never send private keys, recovery phrases, live access/invitation tokens, real leases, identity
documents, unredacted evidence, or other people's personal data. Redact logs and screenshots.

## Response targets

The project is currently maintained by one person. After the published email route passes external
acceptance testing and a monitoring operator is confirmed, the intended targets below are
best-effort goals rather than a service-level guarantee. Until then, prefer GitHub's private
vulnerability-reporting flow when it is available and do not rely on a guaranteed email response:

- acknowledge a complete report within three business days;
- provide an initial severity/next-step assessment within seven business days; and
- send a status update at least every fourteen days while an accepted report remains unresolved.

Reports may require confidential reproduction, a source fix, a new immutable testnet deployment,
hosted containment, dependency coordination, user notice, or legal/privacy review. The reporter and
maintainer should agree on a disclosure date based on participant risk and remediation readiness.

## Safe research boundaries

- Use Base Sepolia, worthless test assets, synthetic data, and accounts/wallets you control.
- Stop if testing could access, change, delete, enumerate, or disclose another person's data,
  evidence, account, proposal, agreement, notification, or funds.
- Do not use denial of service, spam, phishing, social engineering, credential stuffing, malware,
  physical attacks, third-party account compromise, or high-volume automated scanning.
- Do not interact with mainnet or real rental funds under the OpenEscrow name.
- Do not make privacy, legal, financial, or public-safety claims from test data alone.
- Preserve enough evidence for reproduction without retaining unnecessary personal data.

Good-faith research that follows these boundaries is appreciated, but this policy is not a promise
of legal safe harbor and cannot bind infrastructure providers or other third parties. Ask before
performing any test whose authorization is uncertain.

## Scope

Relevant reports include vulnerabilities in OpenEscrow's contracts, registry/reserve bindings,
frontend, hosted Worker/API, authentication and authorization, private evidence, record integrity,
notifications, compliance-source gates, build/release tooling, self-host package, and official
OpenEscrow deployment configuration.

Third-party services and dependencies should normally be reported to their maintainers. Report an
OpenEscrow integration failure privately when OpenEscrow's use of a third party creates the impact.

## Rewards and disclosure

OpenEscrow does not currently operate a funded bug-bounty program and cannot promise payment. Do
not make reward eligibility a condition for giving the project enough information to contain an
active risk.

The project will credit a reporter in a public advisory when requested and appropriate, subject to
privacy, legal, participant-safety, and coordinated-disclosure constraints. Security fixes should
eventually include a public advisory or remediation summary detailed enough for users and
self-hosters to act without exposing private participant information.
