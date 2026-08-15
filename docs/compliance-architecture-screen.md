# OpenEscrow compliance architecture screen

This is a preliminary product-risk screen for the public Base Sepolia demonstration. It is not
legal advice, a legal opinion, or authorization to accept real rental deposits. The purpose is to
identify product behavior that must remain disabled, be redesigned, or receive qualified review
before a real-money pilot.

## Current release boundary

The reviewed application uses valueless test tokens on Base Sepolia. Users are told to use invented
information and test files. Production fiat, mainnet assets, real yield, and real rental deposits
remain disabled. That boundary is material: several issues below would be release blockers for real
funds even though they do not prevent a clearly labeled testnet demonstration.

## Claim-period withdrawal rule

The candidate prevents both landlord and tenant withdrawals from a normally closed agreement until
the agreement's claim-submission deadline has passed. A cancelled agreement remains immediately
refundable so a cancelled or partially funded proposal cannot strand tenant funds.

This is a useful **contract safety invariant**, but it is not by itself a nationally compliant
deadline model:

- California generally requires the itemized statement and remaining security within 21 calendar
  days after the tenant vacates. The deduction categories and documentation requirements remain
  independently controlling. [Cal. Civ. Code § 1950.5](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1950.5.)
- New York generally requires an itemized statement and remaining deposit within 14 days after the
  tenant vacates; failure to provide the statement within that period forfeits the right to retain
  any portion. [N.Y. Gen. Oblig. Law § 7-108](https://www.nysenate.gov/legislation/laws/GOB/7-108)
- Massachusetts generally requires the balance to be returned within 30 days after termination,
  subject to its itemization, evidence, account, and interest rules.
  [Mass. Gen. Laws ch. 186, § 15B](https://malegislature.gov/Laws/GeneralLaws/PartII/TitleI/Chapter186/Section15b)
- Washington generally requires the refund and a full, specific statement with supporting
  documentation within 30 days after termination and vacating.
  [RCW 59.18.280](https://app.leg.wa.gov/RCW/default.aspx?cite=59.18.280)
- Florida exposes the structural limitation of a single deadline: absent a claim, the deposit is
  generally due within 15 days; if the landlord intends to claim, notice is due within 30 days and
  the tenant then has 15 days after receipt to object.
  [Fla. Stat. § 83.49](https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0000-0099/0083/Sections/0083.49.html)

Accordingly, the production rule must be: no withdrawal before the legally applicable release
condition, **and no software-created delay beyond the legally applicable refund or remittance
deadline**. Jurisdictions with separate no-claim, claim-notice, objection, and balance-remittance
deadlines require separate contract state and transitions. A landlord-entered date, mutual
agreement, or disclaimer cannot be assumed to waive a mandatory rule.

### Required production redesign

1. Represent possession return, no-claim refund, claim notice, tenant objection, documentation, and
   remaining-balance deadlines separately.
2. Route each transition from a versioned jurisdiction rule with an official source and effective
   date; fail closed when the rule is missing, stale, conditional, or locally overridden.
3. Release an undisputed or no-claim balance by its statutory deadline even if a longer landlord
   claim or dispute process exists.
4. Preserve court orders, government holds, sanctions blocks, lawful early termination, abandonment,
   and other reviewed exception paths.
5. Do not describe the landlord's contract allocation as a legal determination. The current
   no-arbiter test workflow records party conduct; it does not adjudicate whether a deduction is
   lawful or eliminate external remedies.

## Major product-compliance risks

| Priority | Area | Product concern | Required gate |
| --- | --- | --- | --- |
| P0 | Deposit custody and escrow | Many state statutes prescribe who holds the deposit, where it is held, segregation, trust, bonding, notice, and interest. A shared smart contract is not automatically a permitted statutory account or licensed escrow arrangement. | Written jurisdiction-specific custody opinion and, if required, a licensed/regulated custodian or different funds flow. |
| P0 | Claims and automatic allocation | The default no-arbiter contract can allocate a documented landlord claim after tenant approval, dispute, or no response. A blockchain outcome is not proof that the deduction is legally permitted or adequately documented. | Counsel-approved jurisdiction flow, mandatory notice/evidence rules, external-remedy language, and any required court/escrow/mediation hold. |
| P0 | Money transmission and provider flow | A business that accepts and transmits convertible virtual currency or exchanges it can be a money transmitter unless an exemption applies. Provider-brokered on/off ramps reduce operational scope but do not settle OpenEscrow's classification. [FinCEN convertible-virtual-currency guidance](https://www.fincen.gov/resources/statutes-regulations/guidance/application-fincens-regulations-persons-administering) | Written federal and state money-transmission analysis of the exact custody, wallet, conversion, fee, and settlement flow; use approved providers and do not handle payment credentials. |
| P0 | Yield-bearing deposits | Deposit-interest ownership varies by law; a yield token adds protocol, liquidity, disclosure, tax, custody, loss-allocation, and potentially securities/consumer-finance questions. Participant consent alone is not assumed to cure a statutory restriction. | Keep real yield disabled until counsel and independent security reviewers approve the exact asset, adapter, disclosures, accounting, redemption, loss, tax, and provider model. |
| P0 | Sanctions and prohibited property | U.S. sanctions obligations apply to digital-asset transactions as they do to fiat, and covered actors need risk-based controls. [OFAC virtual-currency guidance](https://ofac.treasury.gov/system/files/126/virtual_currency_guidance_brochure.pdf) | Provider and operator sanctions program, screening, blocking/reporting procedure, jurisdiction controls, and counsel-approved responsibility matrix. |
| P1 | Electronic notices and consent | Electronic records can satisfy writing requirements only under the applicable statute and delivery rules. Federal E-SIGN consumer disclosure rules include affirmative consent and paper/withdrawal disclosures for covered records. [E-SIGN Act](https://www.govinfo.gov/content/pkg/COMPS-940/pdf/COMPS-940.pdf) | Notice-by-notice delivery matrix; affirmative electronic-record consent where required; printable/downloadable records; paper fallback; proof of delivery and withdrawal of consent. |
| P1 | Privacy, security, retention, and breach response | The service links identities, rental addresses, wallet activity, claims, and private evidence. If the production activity makes OpenEscrow a covered financial institution, GLBA privacy and Safeguards Rule duties may apply; state privacy and breach laws require separate review. [FTC Safeguards Rule](https://www.ftc.gov/legal-library/browse/rules/safeguards-rule) | Data map, minimization, retention/deletion/legal-hold rules, vendor agreements, access review, incident plan, breach matrix, and a formal applicability opinion. |
| P1 | Fair-housing and protected situations | Assistance-animal accommodations can require waiver of a pet deposit or fee, and disability details must not be inferred from an address. [HUD assistance-animal guidance](https://www.hud.gov/helping-americans/assistance-animals) SCRA-qualified orders can also change lease-termination timing. [DOJ SCRA guide](https://www.justice.gov/servicemembers/know-your-rights-guide-servicemembers-civil-relief-act) | Privacy-minimal, user-asserted conditional facts; no diagnosis storage; qualified human/legal escalation; accessibility and anti-discrimination review. |
| P1 | Lost wallets, death, incapacity, court orders, and abandoned property | Immutable wallet authorization and fixed deadlines do not by themselves provide a lawful recovery, succession, garnishment, escheat, or court-order process. | Reviewed recovery and legal-hold design before real value; do not make operator key substitution an informal remedy. |
| P2 | Tax, accounting, and reporting | Yield, fees, token conversions, landlord deductions, and reserve refunds can have participant and operator reporting consequences. | Tax/accounting review and durable value-denominated statements before enabling real assets. |

## Controls already aligned with the safer testnet boundary

- The UI and documentation describe the application as a public testnet prototype and prohibit real
  tenancy data and real funds.
- Positive taUSDC demonstration yield is allocated only to tenants; the landlord's allocation is
  capped at principal-equivalent test value.
- Proposals, identities, notification settings, and evidence remain offchain; evidence is encrypted
  at rest. Public-chain wallet addresses, amounts, deadlines, state changes, hashes, and opaque
  references are expressly not treated as private.
- Party actions and automated notices are recorded, but compliance profiles are described as
  research aids rather than legal determinations.
- The withdrawal safeguard now prevents either party from collecting a normally closed outcome
  before the configured claim deadline.

These controls make the demonstration clearer and safer. They do not resolve the production legal
issues above.

## Release recommendation

The current application can remain a clearly labeled, valueless Base Sepolia demonstration for
grant review and synthetic UAT. Real-money use remains **no-go**. Before even a supervised
real-money pilot, select one jurisdiction and tenancy segment, obtain a written opinion on the exact
funds and claim flow, redesign multi-deadline jurisdictions, complete an independent contract and
application audit, approve the providers and sanctions/privacy controls, and update the Terms,
Privacy Policy, and point-of-action disclosures for the reviewed configuration.
