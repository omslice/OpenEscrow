# OpenEscrow roadmap

This roadmap is organized around evidence and release gates rather than speculative features or calendar promises.

## Gate 1 — Testnet technical MVP

**Status: implemented; awaiting moderated external evaluation**

- [x] Normative claim/dispute state machine
- [x] Shared escrow contract with one pinned token
- [x] Explicit arbiter acceptance and mutual-consent replacement
- [x] Tenant-default no-response and arbiter-timeout behavior
- [x] Pull-based withdrawals and reentrancy protection
- [x] Unit, fuzz, deadline-boundary, authorization, and invariant tests
- [x] Base Sepolia deployment and source verification
- [x] Minimal frontend and full lifecycle demonstration
- [x] Second implementation review and documented addendum
- [x] Continuous integration for contracts and frontend
- [x] Public hosted testnet demo
- [ ] Five moderated usability sessions

**Exit criterion:** an outside evaluator can complete the no-claim, accepted-claim, and disputed-claim scenarios without developer intervention, and all automated checks remain green.

## Gate 2 — One-jurisdiction pilot design

**Status: not started**

- [ ] Select one jurisdiction and intended user segment
- [ ] Retain qualified legal counsel
- [ ] Resolve Category A in [`docs/open-questions.md`](docs/open-questions.md)
- [ ] Identify a mediation, legal-aid, housing, or property-management partner
- [ ] Define evidence privacy, access, and retention
- [ ] Define user disclosures and informed consent
- [ ] Decide whether blockchain custody is legally permissible and operationally useful
- [ ] Convert statutory requirements into a reviewed jurisdiction policy profile

**Exit criterion:** counsel and the pilot partner approve a written workflow that maps applicable law to product behavior.

## Gate 3 — Pilot-ready product

**Status: blocked on Gate 2**

- [ ] Replace developer terminology with role-based guided tasks
- [ ] Add production-grade wallet and mobile flows
- [ ] Add notifications for every required deadline and action
- [ ] Add a scalable agreement indexer
- [ ] Implement access-controlled evidence storage
- [ ] Add structured, itemized landlord claims
- [ ] Add operational monitoring and support procedures
- [ ] Commission an independent smart-contract audit
- [ ] Complete accessibility, privacy, and threat-model reviews

**Exit criterion:** a narrowly scoped pilot can operate without exposing personal information or depending on a developer to move agreements forward.

## Gate 4 — Supervised real-world pilot

**Status: future**

- [ ] Start with a small participant cohort and explicit limits
- [ ] Monitor completion, dispute, abandonment, and support rates
- [ ] Compare the workflow with existing deposit handling
- [ ] Record legal, operational, and user-experience failures
- [ ] Publish a transparent pilot evaluation

**Exit criterion:** evidence supports continuing, changing the custody model, or stopping.

## Explicitly deferred

These features are not part of the viable MVP and should not be built until the pilot demonstrates a need:

- Yield-bearing deposits
- Multiple tokens
- Multi-chain deployments
- Fiat ramps
- Reputation systems
- DAO governance
- Decentralized arbitration
- Protocol fees
- Upgradeability
