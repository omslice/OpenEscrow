import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../App.tsx", import.meta.url),
  "utf8",
);
const trackedAgreementsSource = readFileSync(
  new URL("./useTrackedAgreements.ts", import.meta.url),
  "utf8",
);

test("authenticated workspace state is remounted and scoped by stable account identity", () => {
  assert.match(appSource, /const accountIdentity = user\?\.id \?\? null;/);
  assert.match(
    appSource,
    /key=\{accountIdentity \?\? "anonymous-account"\}/,
  );
  assert.match(
    appSource,
    /useTrackedAgreements\(\s*ACCOUNT_AUTH_ENABLED \? accountIdentity : null,/s,
  );
  assert.match(
    appSource,
    /ACCOUNT_AUTH_ENABLED\s*\?\s*accountIdentity\s*\?\s*mergeAgreementIds\([\s\S]*?\)\s*:\s*\[\]/,
  );
});

test("account changes clear discovered records and invalidate background polling", () => {
  assert.match(
    appSource,
    /setSavedProposals\(\[\]\);[\s\S]*setSavedRecords\(\[\]\);[\s\S]*\}, \[accountIdentity\]\);/,
  );
  assert.match(
    appSource,
    /\}, \[accountIdentity, identityToken, workspaceRole\]\);/,
  );
});

test("manual discovery and archive completions check their requesting account", () => {
  const guardCreations = appSource.match(
    /createAccountOperationGuard\(\s*\(\) => activeAccountIdentity\.current,\s*requestedAccountIdentity,\s*\)/g,
  );
  assert.equal(guardCreations?.length, 2);
  assert.ok(
    (appSource.match(/if \(!requestIsCurrent\(\)\) return;/g)?.length ?? 0) >= 6,
  );
  assert.match(
    appSource,
    /if \(requestIsCurrent\(\)\) \{\s*setRecordArchivePendingKey\(null\);/s,
  );
});

test("tracked agreement ids never render from a previous account scope", () => {
  assert.match(
    trackedAgreementsSource,
    /const ids = state\.storageKey === storageKey \? state\.ids : \[\];/,
  );
  assert.match(
    trackedAgreementsSource,
    /const prev = current\.storageKey === storageKey \? current\.ids : \[\];/,
  );
});
