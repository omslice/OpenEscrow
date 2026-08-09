import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const fundingPage = readFileSync(
  new URL("../components/FundingPage.tsx", import.meta.url),
  "utf8",
);
const root = readFileSync(new URL("../Root.tsx", import.meta.url), "utf8");
const layout = readFileSync(
  new URL("../components/Layout.tsx", import.meta.url),
  "utf8",
);

test("the public funding route is lazy and available without account initialization", () => {
  assert.match(root, /const FundingPage = lazy/);
  assert.match(root, /path === "\/funding"/);
  assert.match(root, /<FundingPage \/>/);
  assert.match(layout, /href="\/funding">Funding &amp; transparency<\/a>/);
});

test("the unconfirmed public state cannot imply that zero funding was received", () => {
  assert.match(fundingPage, /Funding disclosures are being verified/);
  assert.match(fundingPage, /does not state a zero balance/);
  assert.match(fundingPage, /Applications and nominations are never ledger receipts/);
  assert.match(fundingPage, /Do not assume a contribution is charitable or tax deductible/);
  assert.match(fundingPage, /hasConfirmedFundingDisclosure/);
  assert.match(fundingPage, /Funding and transparency questions/);
});

test("the funding page preserves independence and participation boundaries", () => {
  assert.match(fundingPage, /A contribution does not buy control/);
  assert.match(fundingPage, /Funders receive no privileged access to private records/);
  assert.match(fundingPage, /Optional yield is not part of the default first-pilot budget/);
  assert.match(fundingPage, /Review the repository/);
  assert.match(fundingPage, /Discuss collaboration/);
});
