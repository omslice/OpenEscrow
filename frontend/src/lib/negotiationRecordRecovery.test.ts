import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const claimSource = readFileSync(
  new URL("../components/ClaimSection.tsx", import.meta.url),
  "utf8",
);
const responseSource = readFileSync(
  new URL("../components/ResponseSection.tsx", import.meta.url),
  "utf8",
);
const proposalSource = readFileSync(
  new URL("../components/CreateAgreementForm.tsx", import.meta.url),
  "utf8",
);

test("claim requirements fail closed with a focused, retryable private-record error", () => {
  assert.match(claimSource, /setRecordLoadError\(/);
  assert.match(
    claimSource,
    /role="alert"[\s\S]*aria-label="Private claim requirements could not be loaded"/,
  );
  assert.match(claimSource, /recordRetryButton\.current\?\.focus\(\)/);
  assert.match(claimSource, /Try loading claim requirements again/);
  assert.match(
    claimSource,
    /disabled=\{[\s\S]*?isClaimPolicyUnavailable[\s\S]*?claimRequirementsConfirmed/,
  );
  assert.doesNotMatch(
    claimSource,
    /loadNegotiation\(negotiationAccess\)\.then\(setRecord\)/,
  );
});

test("tenant response details expose retry without blocking a time-sensitive onchain response", () => {
  assert.match(responseSource, /setRecordLoadError\(/);
  assert.match(
    responseSource,
    /role="alert"[\s\S]*aria-label="Private response details could not be loaded"/,
  );
  assert.match(responseSource, /recordRetryButton\.current\?\.focus\(\)/);
  assert.match(responseSource, /A time-sensitive onchain response remains available below/);
  assert.match(responseSource, /Try loading response details again/);
  assert.doesNotMatch(
    responseSource,
    /loadNegotiation\(negotiationAccess\)\.then\(setRecord\)/,
  );
});

test("invitation and notice audit saves cannot reject without visible recovery guidance", () => {
  for (const source of [claimSource, responseSource, proposalSource]) {
    assert.match(source, /async function record(?:Notice|Invitation)\(/);
    assert.match(
      source,
      /could not add that preparation step to the private record/i,
    );
  }
  assert.doesNotMatch(claimSource, /\}\)\.then\(setRecord\)/);
  assert.doesNotMatch(responseSource, /\}\)\.then\(setRecord\)/);
  assert.doesNotMatch(proposalSource, /\}\)\.then\(setDraft\)/);
});

test("claim email delivery remains distinct from its follow-up record refresh", () => {
  assert.match(claimSource, /async function sendTenantClaimNotification\(\)/);
  assert.match(claimSource, /tenantNotificationScope\.isCurrent\(operationId\)/);
  assert.match(claimSource, /disabled=\{isSendingTenantNotification\}/);
  assert.match(
    claimSource,
    /accepted for delivery, but OpenEscrow could not refresh the private Record display/,
  );
  assert.doesNotMatch(
    claimSource,
    /setRecord\(await loadNegotiation\(negotiationAccess\)\)/,
  );
});
