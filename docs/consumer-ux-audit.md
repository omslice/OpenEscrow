# Consumer UX audit

This audit covers the Base Sepolia MVP as a consumer product. It does not change agreement
semantics, authorization, stored fields, APIs, contract calls, transaction order, or outcomes.

## Review standard

Each workspace was reviewed for:

- plain-language hierarchy and next-action clarity;
- grouping, progressive disclosure, status and error presentation;
- long identifiers, participant data, and dense form content;
- keyboard flow, focus recovery, touch targets, and mobile overflow;
- retention of safety, legal, and technical details without making them the primary experience.

## Findings and disposition

| Surface | Finding | Disposition |
| --- | --- | --- |
| Public introduction and About | Primary actions, testnet boundary, project context, and legal links are already separated from technical detail. | Reviewed; retain the current structure and validate it in moderated pilot sessions. |
| Account and settings | Identity, wallets, email readiness, provider diagnostics, and security controls competed for attention. | Refined into scannable identity/wallet cards, two descriptive notification choices, a consumer readiness message, collapsed delivery diagnostics, and separate inventory/session-safety cards. |
| Proposal list | Internal status text and a single participant line made multiple proposals difficult to scan. | Added plain-language status summaries, property-first metadata, participant, update, revision, and active-deposit cues while preserving actions and archive behavior. |
| Proposal editor | The workflow is necessarily long, but already uses a three-step keyboard tab flow, focused validation, participant cards, address autocomplete, asset cards, funding summary, and official-source status. | Reviewed; retain the current step structure. Pilot observation should determine whether any fields can safely become optional or deferred; that would be a product-policy change, not presentation-only work. |
| Deposit list | Multiple agreements were compact but visually generic. | Added property-first active-deposit rows, finalized cues, clearer disclosure controls, and preserved one-at-a-time live mounting. |
| Claims and resolution | Line items, evidence, response choices, and technical receipts created a dry, high-density form. | Refined with clearer sections, totals, next-action hierarchy, friendlier activity copy, and collapsed technical verification details. |
| Asset amount language | Standard testUSDC reviewer flows and bounded taUSDC flows shared generic or incorrectly hard-coded “shares” labels. | Amounts now use asset-aware units throughout the deposit, claim, tenant-response, arbiter-decision, and notification surfaces; automatic email is primary and draft/copy actions are clearly labeled as backups. |
| Mobile proposal editor | The stacked editor toolbar declared a full content width plus padding, creating page-level horizontal overflow when the form was open on a narrow phone. | The toolbar now uses border-box sizing, and the accessibility smoke test opens the editor at 390px before asserting that the document stays within the viewport. |
| Record | Reports, encrypted backups, proof verification, archives, and multiple agreements lacked a strong scan hierarchy. | Refined into compact expandable records with summary metadata, grouped actions, progressive disclosure, and mobile-safe archive controls. |

## Automated protection

The rendered checks cover desktop and mobile layouts, keyboard tab and disclosure behavior, focus
recovery, 44-pixel actions, one-live-deposit mounting, account switching, account-bound async
results, notification choices, security controls, official-source retry states, and mobile
overflow. Client and server suites continue to protect the unchanged authorization and workflow
logic.

## Human validation still required

Automated checks cannot establish whether first-time landlords and tenants understand the wording
or choose the correct action. Before a wider pilot, run moderated sessions with separate landlord
and tenant accounts, record hesitation and misinterpretation, and treat any requested field or
workflow removal as a separate product/legal decision.
