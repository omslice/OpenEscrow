import assert from "node:assert/strict";
import test from "node:test";
import {
  appendAdditionalCheckJUnit,
  parseJUnitTestcases,
} from "./rehearsal-runner.mjs";

test("rendered rehearsal results are added to JUnit with escaped failure details", () => {
  const source = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
	<testcase name="server rehearsal"/>
</testsuites>
`;
  const appended = appendAdditionalCheckJUnit(source, [
    {
      name: 'rendered "record" rehearsal',
      target: "scripts/check-record-verification.mjs",
      durationMs: 1250,
      failed: false,
      error: null,
      stdout: "passed",
      stderr: null,
    },
    {
      name: "rendered failure",
      target: "scripts/check-record-verification.mjs",
      durationMs: 20,
      failed: true,
      error: null,
      stdout: null,
      stderr: "wrong <key> & altered archive",
    },
  ]);

  assert.match(appended, /name="rendered &quot;record&quot; rehearsal"/);
  assert.match(appended, /time="1\.25"/);
  assert.match(
    appended,
    /wrong &lt;key&gt; &amp; altered archive/,
  );
  assert.equal(
    (appended.match(/<testcase\b/g) || []).length,
    3,
  );
  assert.match(appended, /<\/testsuites>\s*$/);
  assert.throws(
    () => appendAdditionalCheckJUnit("<not-junit/>", [
      {
        name: "rendered check",
        target: "check.mjs",
        durationMs: 0,
        failed: false,
      },
    ]),
    /valid JUnit root/,
  );
});

test("JUnit parsing keeps self-closing passes separate from a later rendered failure", () => {
  const observed = parseJUnitTestcases(`<?xml version="1.0" encoding="utf-8"?>
<testsuites>
  <testcase name="server pass" time="0.1"/>
  <testcase name="rendered pass" classname="rendered-pilot"/>
  <testcase name="rendered failure"><failure message="failed">details</failure></testcase>
</testsuites>`);

  assert.deepEqual(observed.get("server pass"), { failed: false });
  assert.deepEqual(observed.get("rendered pass"), { failed: false });
  assert.deepEqual(observed.get("rendered failure"), { failed: true });
  assert.equal(observed.size, 3);
});
