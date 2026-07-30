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
  assert.match(
    accountCenterSource,
    /activeAccountIdentity\.current === requestedAccountIdentity/,
  );
  assert.match(accountCenterSource, /result\.outcome === "identity_changed"/);
  assert.match(
    accountCenterSource,
    /setIsEndingSessions\(false\);[\s\S]*setIsTestingEmail\(false\);[\s\S]*\}, \[accountIdentity\]\);/,
  );
});

test("notification outcomes use explicit accessible error state", () => {
  assert.match(
    accountCenterSource,
    /id="notification-preference-boundary"/,
  );
  assert.match(
    accountCenterSource,
    /id="notification-preference-status"/,
  );
  assert.match(
    accountCenterSource,
    /role=\{preferenceNotice\.error \? "alert" : "status"\}/,
  );
  assert.match(
    accountCenterSource,
    /aria-live=\{preferenceNotice\.error \? "assertive" : "polite"\}/,
  );
  assert.match(
    accountCenterSource,
    /aria-atomic="true"/,
  );
  assert.match(
    accountCenterSource,
    /preferenceNotice \? " notification-preference-status" : ""/,
  );
  assert.match(
    accountCenterSource,
    /activeAccountIdentity\.current !== requestedAccountIdentity/,
  );
  assert.doesNotMatch(
    accountCenterSource,
    /preferenceStatus\.includes\("could not"\)/,
  );
});

test("mobile account security recovery actions retain full-width touch targets", () => {
  assert.match(
    appStyles,
    /\.account-security-settings \.settings-actions \.btn\s*\{[^}]*flex:\s*1 1 100%;[^}]*min-height:\s*44px;/s,
  );
});
