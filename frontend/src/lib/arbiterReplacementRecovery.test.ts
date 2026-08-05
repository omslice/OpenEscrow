import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const replacementSource = readFileSync(
  new URL("../components/ArbiterReplacementSection.tsx", import.meta.url),
  "utf8",
);

test("replacement-arbiter invitation copy keeps a permission-safe manual fallback", () => {
  assert.match(
    replacementSource,
    /import \{ copyTextToClipboard \} from "\.\.\/lib\/browserActions";/,
  );
  assert.match(
    replacementSource,
    /await copyTextToClipboard\(inviteUrl\);/,
  );
  assert.doesNotMatch(replacementSource, /navigator\.clipboard/);
  assert.match(
    replacementSource,
    /Select and copy the link below\./,
  );
  assert.match(replacementSource, /recordStatus && <p className="tx-success" role="status">/);
  assert.match(replacementSource, /recordError && <p className="tx-error" role="alert">/);
});

test("replacement-arbiter receipt recovery is automatic with a collapsed technical fallback", () => {
  assert.match(
    replacementSource,
    /findArbiterReplacementTransaction\(/,
  );
  assert.match(
    replacementSource,
    /Find confirmation and finish Record update/,
  );
  assert.match(
    replacementSource,
    /<details className="technical-details">\s*<summary>Technical recovery<\/summary>/,
  );
  assert.match(
    replacementSource,
    /OpenEscrow will verify the agreement, event, wallet, and sender/,
  );
  assert.match(
    replacementSource,
    /Use transaction hash to finish Record update/,
  );
});
