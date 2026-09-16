# Deposit loading correction — 2026-09-16

Saved finalized proposals must identify an agreement by its original escrow
contract and agreement number. Earlier deployments can reuse the same number;
the number alone does not identify a deposit in the current release.

The API now returns the stored finalization contract address. The Deposits tab
loads older deposits from that address in a read-only card and keeps each saved
proposal separate. Records without a verified address remain available in the
Record tab without guessing a deployment. Stale cached numbers no longer create
phantom current deposits when their only saved association is historical. A
confirmed current deposit with the same number remains visible.

An explicit `AgreementDoesNotExist` response is no longer described as a network
failure. Historical records cannot initiate proof transactions against the
current activity registry. This correction does not enable legacy transactions,
change existing snapshot formats, migrate participant data, or redeploy contracts.

The Proposals tab places **Start a new proposal** and the new proposal editor
before the existing proposal list, including historical and archived proposals.

Regression coverage includes API authorization and original-address serialization,
two original contracts sharing an agreement number, an unverified deployment,
stale local shortcuts, a colliding current agreement, saved Record access, mobile
overflow, and proposal launcher reading order. The browser regression is part of
the standard release check.
