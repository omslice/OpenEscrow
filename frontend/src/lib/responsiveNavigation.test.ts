import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appStyles = readFileSync(new URL("../App.css", import.meta.url), "utf8");
const agreementCardStyles = readFileSync(
  new URL("../components/AgreementCard.css", import.meta.url),
  "utf8",
);

test("phone layouts keep every workspace destination visible", () => {
  assert.match(
    appStyles,
    /@media \(max-width: 680px\)[\s\S]*?\.workspace-tabs \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);[\s\S]*?overflow-x: visible;/,
  );
  assert.match(
    appStyles,
    /\.workspace-tabs \.tab \{[\s\S]*?width: 100%;[\s\S]*?min-height: 44px;/,
  );
});

test("phone layouts keep all three agreement panels visible without horizontal scrolling", () => {
  assert.match(
    agreementCardStyles,
    /@media \(max-width: 680px\)[\s\S]*?\.agreement-panel-tabs \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);[\s\S]*?overflow: visible;/,
  );
  assert.match(
    agreementCardStyles,
    /\.agreement-panel-tabs \[role="tab"\] \{[\s\S]*?min-height: 52px;[\s\S]*?white-space: normal;/,
  );
});
