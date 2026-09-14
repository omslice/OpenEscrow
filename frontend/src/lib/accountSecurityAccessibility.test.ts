import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const accountCenterSource = readFileSync(
  new URL("../components/PrivyAccountCenter.tsx", import.meta.url),
  "utf8",
);
const appStyles = readFileSync(new URL("../App.css", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const appProvidersSource = readFileSync(
  new URL("../AppProviders.tsx", import.meta.url),
  "utf8",
);
const connectWalletSource = readFileSync(
  new URL("../components/PrivyConnectWallet.tsx", import.meta.url),
  "utf8",
);
const layoutSource = readFileSync(
  new URL("../components/Layout.tsx", import.meta.url),
  "utf8",
);

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
    /isCurrentIdentity: requestIsCurrent/,
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
    /const DEFAULT_PREFERENCES: NotificationPreferences = \{\s*agreementActivity: true,\s*deadlineReminders: true,/s,
  );
  assert.match(
    accountCenterSource,
    /Both are on by default for a new verified account/,
  );
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
    /const requestIsCurrent = createAccountOperationGuard\(/,
  );
  assert.doesNotMatch(
    accountCenterSource,
    /preferenceStatus\.includes\("could not"\)/,
  );
});

test("account-bound wallet and inventory callbacks reject stale identity completions", () => {
  const guardCreations = accountCenterSource.match(
    /createAccountOperationGuard\(\s*\(\) => activeAccountIdentity\.current,\s*requestedAccountIdentity,\s*\(\) => accountScopeActive\.current,\s*\)/g,
  );
  assert.ok((guardCreations?.length ?? 0) >= 7);
  assert.match(
    accountCenterSource,
    /slowTimer = window\.setTimeout\(\(\) => \{\s*if \(requestIsCurrent\(\)\) setWalletSetup\("slow"\);/s,
  );
  assert.match(
    accountCenterSource,
    /const inventory = await loadAccountDataInventory\(requestedIdentityToken\);[\s\S]*?!requestIsCurrent\(\)/,
  );
  assert.match(
    accountCenterSource,
    /activeIdentityToken\.current !== requestedIdentityToken[\s\S]*?return;[\s\S]*?setSecurityError\(true\);/,
  );
  assert.match(
    accountCenterSource,
    /await copyTextToClipboard\(walletAddress\);\s*if \(!requestIsCurrent\(\)\) return;/,
  );
  assert.match(
    accountCenterSource,
    /setWalletCopyStatus\(null\);[\s\S]*attemptedForUser\.current = null;[\s\S]*\}, \[accountIdentity\]\);/,
  );
  assert.match(
    accountCenterSource,
    /return \(\) => \{\s*accountScopeActive\.current = false;\s*\};/,
  );
});

test("an existing embedded wallet is activated automatically for a signed-in account", () => {
  assert.match(
    appProvidersSource,
    /createOnLogin: "users-without-wallets"/,
  );
  assert.match(
    accountCenterSource,
    /wallets\.find\(\(wallet\) => wallet\.walletClientType === "privy"\) \?\? wallets\[0\]/,
  );
  assert.match(
    accountCenterSource,
    /activationAttemptedForUser\.current = user\.id;\s*void Promise\.resolve\(setActiveWallet\(preferredWallet\)\)/,
  );
  assert.match(
    accountCenterSource,
    /activeAccountIdentity\.current !== user\.id \|\| !accountScopeActive\.current/,
  );
});

test("mobile account security recovery actions retain full-width touch targets", () => {
  assert.match(
    appStyles,
    /\.account-security-settings \.settings-actions \.btn\s*\{[^}]*flex:\s*1 1 100%;[^}]*min-height:\s*44px;/s,
  );
});

test("Google sign-in starts direct OAuth while wallet sign-in retains the wallet chooser", () => {
  for (const source of [appSource, connectWalletSource]) {
    assert.match(source, /useLoginWithOAuth/);
    assert.match(source, /initOAuth\(\{ provider: "google" \}\)/);
    assert.match(source, /login\(\{ loginMethods: \["wallet"\] \}\)/);
  }
});

test("the header wordmark and compact donation copy control retain accessible treatment", () => {
  assert.match(layoutSource, /src="\/openescrow-logo-tapered-dark\.png"/);
  assert.match(layoutSource, /aria-label=\{`Copy donation address/);
  assert.match(layoutSource, /<svg[\s\S]*aria-hidden="true"/);
  assert.match(appStyles, /\.app-wordmark-logo[\s\S]*mix-blend-mode:\s*lighten/);
});

test("the signed-out header keeps its brand readable before stacking", () => {
  assert.match(layoutSource, /className="app-brand"/);
  assert.match(appStyles, /\.app-brand\s*\{[^}]*min-width:\s*280px;/s);
  assert.match(appStyles, /\.tagline\s*\{[^}]*max-width:\s*46ch;[^}]*overflow-wrap:\s*anywhere;/s);
  assert.match(layoutSource, /!showNotifications \|\| accountEntry !== undefined/);
  assert.match(
    appStyles,
    /\.app-header-account-entry\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*align-items:\s*start;/s,
  );
  assert.match(
    appStyles,
    /\.app-header-account-entry \.account-entry \.btn\s*\{[^}]*flex:\s*1 1 160px;[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere;/s,
  );
  assert.match(
    appStyles,
    /\.app-header-account-entry \.account-entry\s*\{[^}]*flex:\s*1 1 0;[^}]*width:\s*auto;[^}]*min-width:\s*0;/s,
  );
  assert.match(
    appStyles,
    /\.app-header-account-entry \.notification-center\s*\{[^}]*flex:\s*0 0 auto;/s,
  );
  assert.match(
    appStyles,
    /@media \(max-width: 860px\)[\s\S]*\.app-header-account-entry\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[\s\S]*\.app-brand\s*\{[^}]*min-width:\s*0;/s,
  );
});
