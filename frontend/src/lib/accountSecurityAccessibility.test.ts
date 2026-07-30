import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const accountCenterSource = readFileSync(
  new URL("../components/PrivyAccountCenter.tsx", import.meta.url),
  "utf8",
);
const appStyles = readFileSync(new URL("../App.css", import.meta.url), "utf8");

test("account security controls retain their accessible descriptions and atomic status", () => {
  assert.match(
    accountCenterSource,
    /id="account-session-containment-description"/,
  );
  assert.match(
    accountCenterSource,
    /id="account-data-inventory-description"/,
  );
  assert.match(accountCenterSource, /id="account-security-status"/);
  assert.match(accountCenterSource, /aria-atomic="true"/);
  assert.match(
    accountCenterSource,
    /aria-describedby=\{`account-data-inventory-description/,
  );
  assert.match(
    accountCenterSource,
    /aria-describedby=\{`account-session-containment-description/,
  );
  assert.match(
    accountCenterSource,
    /aria-describedby="account-data-inventory-description account-security-status"/,
  );
  assert.match(
    accountCenterSource,
    /activeIdentityToken\.current !== requestedIdentityToken/,
  );
  assert.match(
    accountCenterSource,
    /setInventoryRecovery\(null\);[\s\S]*setSecurityStatus\(null\);/,
  );
});

test("mobile account security recovery actions retain full-width touch targets", () => {
  assert.match(
    appStyles,
    /\.account-security-settings \.settings-actions \.btn\s*\{[^}]*flex:\s*1 1 100%;[^}]*min-height:\s*44px;/s,
  );
});
