import assert from "node:assert/strict";
import test from "node:test";
import {
  assertValidLocalComplianceOverlayCatalog,
  validateLocalComplianceOverlayCatalog,
} from "../../shared/compliance-overlay-validation.js";
import { LOCAL_COMPLIANCE_OVERLAYS } from "../../shared/us-compliance-overlays.js";

const copyCatalog = () => structuredClone(LOCAL_COMPLIANCE_OVERLAYS);

test("reviewed local compliance overlays pass the reusable catalog validator", () => {
  const errors = validateLocalComplianceOverlayCatalog(LOCAL_COMPLIANCE_OVERLAYS);
  assert.deepEqual(errors, []);
  assert.equal(Object.isFrozen(errors), true);
  assert.equal(
    assertValidLocalComplianceOverlayCatalog(LOCAL_COMPLIANCE_OVERLAYS),
    LOCAL_COMPLIANCE_OVERLAYS,
  );
});

test("local overlay validation rejects scope, source, and unsupported-condition drift", () => {
  const catalog = copyCatalog();
  catalog[0].localityKeys = ["us:il:county:chicago"];
  catalog[0].condition = { fact: "ownerOccupied", equals: false };
  catalog[0].sources[0].url = "http://untrusted.example/chicago";
  catalog[0].sources[0].note = "silently ignored metadata";

  const errors = validateLocalComplianceOverlayCatalog(catalog);
  assert.ok(errors.some((message) => /localityKeys must match/i.test(message)));
  assert.ok(errors.some((message) => /condition must remain null/i.test(message)));
  assert.ok(errors.some((message) => /HTTPS official-source URL/i.test(message)));
  assert.ok(errors.some((message) => /unsupported field.*note/i.test(message)));
});

test("local overlay validation rejects duplicate identities and malformed deadlines", () => {
  const catalog = copyCatalog();
  catalog.push(structuredClone(catalog[0]));
  catalog[0].deadlines.push(structuredClone(catalog[0].deadlines[0]));
  catalog[0].deadlines[1].days = 731;
  catalog[0].deadlines[1].trigger = "not-a-timestamp";

  const errors = validateLocalComplianceOverlayCatalog(catalog);
  assert.ok(errors.some((message) => /overlay IDs must be unique/i.test(message)));
  assert.ok(errors.some((message) => /deadlines must use unique IDs/i.test(message)));
  assert.ok(errors.some((message) => /days must be an integer/i.test(message)));
  assert.ok(errors.some((message) => /timestamp field/i.test(message)));
  assert.throws(
    () => assertValidLocalComplianceOverlayCatalog(catalog),
    /invalid local compliance overlay catalog/i,
  );
});
