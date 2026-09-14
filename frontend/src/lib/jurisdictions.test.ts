import assert from "node:assert/strict";
import test from "node:test";
import {
  US_JURISDICTION_PROFILES,
  addressResolutionMatchesProfile,
  buildComplianceSnapshot,
  complianceSnapshotMatchesProfile,
  evaluateSnapshotCompliance,
  isVersionedComplianceSnapshot,
  jurisdictionProfile,
  jurisdictionProfileForPostalCode,
  normalizeAddressResolution,
  readJurisdiction,
  rememberJurisdiction,
  type AddressResolution,
  type ComplianceSnapshot,
  type USJurisdictionProfile,
} from "./jurisdictions.ts";

function addressFor(profile: USJurisdictionProfile): AddressResolution {
  return {
    provider: "photon-openstreetmap",
    providerFeatureId: `R:${profile.postalCode}:routing`,
    label: `1 Main Street, Test City, ${profile.postalCode} 00000`,
    countryCode: "US",
    stateCode: profile.postalCode,
    city: "Test City",
    county: "Test County",
    postalCode: "00000",
    latitude: 38,
    longitude: -97,
    attestation: null,
  };
}

test("validated addresses route every state and DC to the exact versioned profile", () => {
  assert.equal(US_JURISDICTION_PROFILES.length, 51);
  for (const profile of US_JURISDICTION_PROFILES) {
    const address = addressFor(profile);
    assert.equal(jurisdictionProfile(profile.code), profile);
    assert.equal(
      jurisdictionProfileForPostalCode(` ${profile.postalCode.toLowerCase()} `),
      profile,
    );
    assert.equal(addressResolutionMatchesProfile(address, profile), true);
    const snapshot = buildComplianceSnapshot(profile, address);
    assert.ok(snapshot);
    assert.equal(snapshot.jurisdiction, profile.code);
    assert.equal(snapshot.profileVersion, profile.version);
    assert.equal(snapshot.address.stateCode, profile.postalCode);
    assert.equal(snapshot.source.url, profile.statuteUrl);
  }
});

test("legacy display punctuation does not look like a substantive policy change", () => {
  const nevada = US_JURISDICTION_PROFILES.find(
    (profile) => profile.postalCode === "NV",
  );
  assert.ok(nevada);
  const address = addressFor(nevada);
  const current = buildComplianceSnapshot(nevada, address);
  assert.ok(current);
  assert.equal(
    complianceSnapshotMatchesProfile(current, nevada, address),
    true,
  );

  const legacy = structuredClone(current);
  const legacyDisplayText = (value: string) =>
    Array.from(value, (character) =>
      character.codePointAt(0)! > 127 ? "?" : character,
    ).join("");
  legacy.source.citation = legacyDisplayText(legacy.source.citation);
  legacy.depositCap.summary = legacyDisplayText(legacy.depositCap.summary);
  legacy.claimPolicy.source.citation = legacyDisplayText(
    legacy.claimPolicy.source.citation,
  );
  assert.equal(
    complianceSnapshotMatchesProfile(legacy, nevada, address),
    true,
  );

  const changedDeadline = structuredClone(legacy);
  changedDeadline.deadlines[0].days += 1;
  assert.equal(
    complianceSnapshotMatchesProfile(changedDeadline, nevada, address),
    false,
  );

  const changedCitation = structuredClone(current);
  changedCitation.source.citation = "A different citation";
  assert.equal(
    complianceSnapshotMatchesProfile(changedCitation, nevada, address),
    false,
  );
});

test("address routing fails closed for foreign, unknown, and mismatched states", () => {
  const california = US_JURISDICTION_PROFILES.find(
    (profile) => profile.postalCode === "CA",
  );
  assert.ok(california);
  const californiaAddress = addressFor(california);

  assert.equal(
    normalizeAddressResolution({
      ...californiaAddress,
      countryCode: "CA",
    }),
    null,
  );
  assert.equal(jurisdictionProfileForPostalCode("ZZ"), null);
  assert.equal(
    addressResolutionMatchesProfile(
      { ...californiaAddress, stateCode: "NV" },
      california,
    ),
    false,
  );
  assert.equal(
    buildComplianceSnapshot(
      california,
      { ...californiaAddress, stateCode: "NV" },
    ),
    null,
  );
});

test("every jurisdiction snapshot detaches its address and nested rule inputs", () => {
  for (const profile of US_JURISDICTION_PROFILES) {
    const mutableProfile = structuredClone(profile) as unknown as {
      code: USJurisdictionProfile["code"];
      postalCode: string;
      version: string;
      researchedOn: string;
      reviewMethod: string;
      statuteCitation: string;
      statuteUrl: string;
      depositCap: USJurisdictionProfile["depositCap"];
      deadlines: Array<{ days: number }>;
      requirements: string[];
      exceptions: string[];
      claimPolicy: USJurisdictionProfile["claimPolicy"];
    };
    const address = addressFor(profile);
    const snapshot = buildComplianceSnapshot(
      mutableProfile as unknown as USJurisdictionProfile,
      address,
    );
    assert.ok(snapshot);
    const serialized = JSON.stringify(snapshot);

    address.city = "Changed after snapshot";
    if (mutableProfile.deadlines[0]) mutableProfile.deadlines[0].days += 100;
    if (mutableProfile.requirements[0]) {
      mutableProfile.requirements[0] = "Changed after snapshot";
    }

    assert.equal(JSON.stringify(snapshot), serialized);
    assert.equal(Object.isFrozen(snapshot), true);
    assert.equal(Object.isFrozen(snapshot.address), true);
    assert.equal(Object.isFrozen(snapshot.deadlines), true);
    assert.equal(Object.isFrozen(snapshot.claimPolicy), true);
    assert.equal(Object.isFrozen(snapshot.overlays), true);
  }
});

test("stored jurisdiction snapshots require the exact canonical validated address", () => {
  const profile = US_JURISDICTION_PROFILES.find(
    (candidate) => candidate.postalCode === "ME",
  );
  assert.ok(profile);
  const snapshot = buildComplianceSnapshot(profile, addressFor(profile));
  assert.ok(snapshot);

  for (const [label, mutate] of [
    ["missing provider", (candidate: Record<string, unknown>) => {
      delete (candidate.address as Record<string, unknown>).provider;
    }],
    ["spoofed provider", (candidate: Record<string, unknown>) => {
      (candidate.address as Record<string, unknown>).provider = "manual-entry";
    }],
    ["lowercase state", (candidate: Record<string, unknown>) => {
      (candidate.address as Record<string, unknown>).stateCode = "me";
    }],
    ["unclean locality", (candidate: Record<string, unknown>) => {
      (candidate.address as Record<string, unknown>).city = " Test City ";
    }],
  ] as const) {
    const candidate = structuredClone(snapshot) as unknown as Record<string, unknown>;
    mutate(candidate);
    assert.equal(isVersionedComplianceSnapshot(candidate), false, label);
    assert.equal(
      evaluateSnapshotCompliance(candidate as unknown as ComplianceSnapshot, {}),
      null,
      label,
    );
  }
});

test("current-page jurisdiction routing survives blocked local storage", () => {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem() {
          throw new Error("storage blocked");
        },
        setItem() {
          throw new Error("storage blocked");
        },
        removeItem() {
          throw new Error("storage blocked");
        },
      },
    },
  });
  try {
    const agreementId = 9_876_543_210n;
    rememberJurisdiction(agreementId, "us-dc");
    assert.equal(readJurisdiction(agreementId), "us-dc");
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});
