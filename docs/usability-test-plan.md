# OpenEscrow moderated usability test plan

## Objective

Determine whether first-time users understand OpenEscrow's tenant-first rule and can complete the
testnet workflow without developer intervention. This is product research, not a test of the
participant.

## Participants

Recruit at least eight people:

- three renters or recent renters;
- three small landlords or property managers;
- two people who could plausibly act as a neutral mediator or arbiter.

Do not recruit only people already comfortable with crypto. Record each participant's role, wallet
experience, and prior experience with deposit disputes.

## Safety and consent

- Use Base Sepolia and worthless test USDC only.
- Ask participants not to enter names, addresses, leases, photographs, invoices, or other personal
  information.
- Explain what will be recorded and obtain consent before recording.
- Store research notes by participant code, not by wallet address.

## Session structure

Target 40 minutes:

1. Five-minute introduction without explaining the interface.
2. Five-minute comprehension check after reading the landing page.
3. Twenty-minute scenario exercise.
4. Ten-minute debrief.

The moderator should ask participants to think aloud and avoid telling them where to click.

## Scenarios

Each participant completes the scenario appropriate to their role. Across the study, cover all
three outcomes.

### Scenario A: no claim

Create and fund an agreement, advance past the claim deadline, finalize the refund, and withdraw.

### Scenario B: accepted claim

Submit a partial claim, accept it as the tenant, and withdraw both credited balances.

### Scenario C: disputed claim

Submit a claim, partially dispute it, review evidence as the arbiter, issue a ruling, and withdraw.

## Questions

Before interacting:

- Who owns the deposit while the agreement is active?
- What must happen before a landlord receives any portion?
- What happens if the tenant does not respond?
- What happens if the arbiter does not rule?
- Would you put real tenancy information into this demo? Why?

After interacting:

- At what moment did you feel least certain?
- Which deadline or balance was hardest to understand?
- Did you trust the arbiter workflow? What was missing?
- What would stop you from using this with a real deposit?
- What notification would you need, and through which channel?

## Measures

For each scenario record:

- completion without moderator intervention;
- critical errors and wrong-role actions;
- time to identify the next required action;
- comprehension score out of five;
- wallet/network problems;
- trust rating from one to five;
- the participant's single biggest concern.

Gate 1 passes when at least 80% complete their primary scenario, every participant correctly
understands the non-response defaults, and no participant attempts to submit personal information.

## Findings template

| Participant | Role | Scenario | Completed | Interventions | Critical error | Trust / 5 | Main concern |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P01 | Tenant | C |  |  |  |  |  |

For every issue, record evidence, severity, affected role, proposed change, and whether it requires
engineering, copy, operations, or legal review.

## Recruitment message

> We are testing an early, testnet-only prototype for handling rental security deposits. The
> session takes about 40 minutes and uses tokens with no value. We are evaluating the product, not
> you. Please do not share real tenancy or personal information.
