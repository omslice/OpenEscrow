import assert from "node:assert/strict";
import test from "node:test";
import {
  rememberAgreementPanel,
  shouldLoadAgreementPanel,
  type AgreementPanel,
} from "./agreementPanelLoading.ts";

test("agreement tools load on first visit and remain mounted afterward", () => {
  let visited: readonly AgreementPanel[] = ["summary"];

  assert.equal(shouldLoadAgreementPanel("funds", "summary", visited), false);
  assert.equal(shouldLoadAgreementPanel("claims", "summary", visited), false);
  assert.equal(shouldLoadAgreementPanel("funds", "funds", visited), true);

  visited = rememberAgreementPanel(visited, "funds");
  assert.equal(shouldLoadAgreementPanel("funds", "summary", visited), true);
  assert.equal(shouldLoadAgreementPanel("claims", "summary", visited), false);

  const unchanged = rememberAgreementPanel(visited, "funds");
  assert.equal(unchanged, visited);

  visited = rememberAgreementPanel(visited, "claims");
  assert.deepEqual(visited, ["summary", "funds", "claims"]);
});
