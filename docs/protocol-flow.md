# OpenEscrow – Full Protocol Flow

This document provides a complete overview of the OpenEscrow deposit lifecycle, as implemented in the protocol and reflected in the system wireframe.
It covers every state transition, from agreement creation to lease expiry, deduction claims, dispute handling, and yield distribution.

---

## Diagram – Full Lifecycle (Mermaid)

```mermaid
flowchart TD
    %% User connection
    A1["Tenant & Landlord connect"]:::role --> A2["Create Escrow Agreement"]:::action
    A2 --> A3["Enter: deposit amount, lease end, notice period"]:::input
    A3 --> A4["Select payment token (WYST, USDC, USDY...)"]:::input

    %% Token check
    A4 --> B1{"Has balance in selected token?"}:::decision
    B1 -- No --> B2["Swap using DEX or CEX"]:::external
    B2 --> B3["Send deposit in selected token"]:::tx
    B1 -- Yes --> B3
    B3 --> B4["EscrowFactory → createAgreement()"]:::contract
    B4 --> B5["Agreement stored in OpenEscrowCore"]:::contract

    %% Lease logic
    B5 --> C1{"Lease expired?"}:::decision
    C1 -- No --> C2["Lease continues as-is"]:::auto
    C1 -- Yes --> C3{"Lease renewed?"}:::decision
    C3 -- Yes --> C4["Update lease date or month-to-month"]:::action
    C4 --> C2
    C3 -- No --> C5["Start notice period (automatically)"]:::auto
    C5 --> C6["Emit NoticePeriodStarted event"]:::notify
    C6 --> C7["Notify both tenant and landlord"]:::notify
    C7 --> C8["Wait for noticeDuration"]:::timer

    %% Deduction flow
    C8 --> D1{"Did landlord submit deduction?"}:::decision
    D1 -- No --> D2["Full refund to tenant after notice period"]:::tx
    D1 -- Yes --> D3["Upload invoice to IPFS (required)"]:::action
    D3 --> D4["Notify tenant (approve or dispute)"]:::notify
    D4 --> D5["Start 48h countdown"]:::timer

    %% Landlord flexibility
    D5 --> E1["Landlord can edit/cancel deduction before release"]:::action
    E1 --> D5

    %% Tenant response
    D5 --> E2{"Tenant response"}:::decision
    E2 -- Approves --> E3["Claim validated"]:::contract
    E2 -- Disputes --> E4["Dispute recorded onchain"]:::record
    E4 --> E3

    %% Fund release and yield
    E3 --> F1["Transfer: claim → landlord, remainder → tenant"]:::tx
    F1 --> F2{"Yield module active?"}:::decision
    D2 --> F2
    F2 -- Yes --> F3["Distribute yield: tenant + landlord"]:::contract

    %% Styles
    classDef role fill:#dceeff,stroke:#007acc,stroke-width:2
    classDef input fill:#ffe0b3,stroke:#cc7a00,stroke-width:2
    classDef decision fill:#ffffff,stroke:#333,stroke-dasharray: 5 5
    classDef tx fill:#d4edda,stroke:#28a745,stroke-width:2
    classDef contract fill:#e6e6ff,stroke:#5a00cc,stroke-width:2
    classDef auto fill:#f0f0f0,stroke:#999,stroke-width:2
    classDef action fill:#cce5ff,stroke:#004085,stroke-width:2
    classDef external fill:#f5f5dc,stroke:#999900,stroke-width:2
    classDef notify fill:#fff3cd,stroke:#856404,stroke-width:2
    classDef timer fill:#e0e0e0,stroke:#666,stroke-width:2
    classDef record fill:#f3d1ff,stroke:#8e44ad,stroke-width:2
```

---

## Flow Summary (Written)

1. **Connection & Agreement Setup**
   Tenant and landlord connect to the app and create an escrow agreement by entering the deposit amount, lease end date, and notice period duration.

2. **Token Check (WYST, USDC, etc.)**
   Before depositing, the app checks if the user has enough balance in the selected token. If not, they're prompted to swap via a DEX or CEX. Once funds are available, the deposit is submitted to the smart contract.

3. **Escrow Creation**
   Calling `createAgreement()` in the EscrowFactory creates a new agreement, stored in `OpenEscrowCore`.

4. **Lease Expiry Logic**
   If the lease is renewed, the agreement is updated (new end date or month-to-month). If not, a notice period starts automatically.

5. **Deduction Flow**
   At the end of the notice period, the landlord can either:

* Submit no claim → full refund to tenant
* Submit a claim → IPFS invoice required, tenant is notified

6. **Claim & Dispute Phase**
   Tenant has 48h to approve or dispute. The landlord can cancel or modify the claim during this time. Disputes are recorded onchain but don’t block execution.

7. **Fund Release & Yield**
   Funds are split: claimed amount to landlord, remainder to tenant. If yield is enabled, it is distributed according to the configured share.

---

For technical details, see `technical-overview.md`.
For contributor instructions, see `CONTRIBUTING.md`.

```

Souhaites-tu que j’ajoute aussi un lien vers cette page dans ton README directement ?

```
