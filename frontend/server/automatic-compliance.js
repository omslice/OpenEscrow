import { US_JURISDICTION_PROFILE_BY_CODE } from "../shared/us-jurisdiction-profiles.js";
import { ARIZONA_SOURCE_ADAPTER, ARIZONA_SOURCE_URL, arizonaSourceDigest, extractArizonaSource, buildAutomaticArizonaProfile, arizonaRequirementChanges } from "../shared/arizona-compliance.js";
import { automaticStateVersion, buildAutomaticStateProfile } from "../shared/automatic-state-profile.js";

export const AUTOMATIC_COMPLIANCE_SCHEMAS = [
  `CREATE TABLE IF NOT EXISTS compliance_source_texts (
    source_key TEXT NOT NULL, source_digest TEXT NOT NULL, base_version TEXT NOT NULL,
    source_text TEXT NOT NULL, first_checked_at TEXT NOT NULL, profile_version TEXT,
    PRIMARY KEY (source_key, source_digest))`,
  `CREATE TABLE IF NOT EXISTS compliance_generated_profiles (
    profile_version TEXT PRIMARY KEY, source_key TEXT NOT NULL, source_digest TEXT NOT NULL,
    base_version TEXT NOT NULL, generated_at TEXT NOT NULL, changes_json TEXT NOT NULL, profile_json TEXT,
    UNIQUE (source_key, source_digest, base_version))`,
  `CREATE TABLE IF NOT EXISTS compliance_update_locks (
    source_key TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at TEXT NOT NULL)`,
];

const base = US_JURISDICTION_PROFILE_BY_CODE["us-az"];

export async function automaticComplianceProfile(db, jurisdiction, version = null) {
  const base = US_JURISDICTION_PROFILE_BY_CODE[jurisdiction];
  if (!base) return null;
  if (!db) return null;
  const row = await db.prepare(`SELECT p.*, t.source_text FROM compliance_generated_profiles p
    JOIN compliance_source_texts t ON t.source_key = p.source_key AND t.source_digest = p.source_digest
    ${version ? "" : "JOIN compliance_source_checks c ON c.source_key = p.source_key AND c.profile_version = p.base_version JOIN compliance_source_texts observed ON observed.source_key = c.source_key AND observed.source_digest = c.current_signature AND observed.profile_version = p.profile_version"}
    WHERE p.base_version = ? AND p.source_key = ? ${version ? "AND p.profile_version = ?" : ""}`)
    .bind(...(version ? [base.version, `state:${base.postalCode.toLowerCase()}`, version] : [base.version, `state:${base.postalCode.toLowerCase()}`])).first();
  if (!row) return null;
  let profile;
  if (row.profile_json) {
    const stored = JSON.parse(row.profile_json);
    const update = stored.sourceUpdate;
    profile = buildAutomaticStateProfile(base, update, row.source_text);
    if (await automaticStateVersion(base, row.source_digest, update.patch) !== profile.version) throw new Error("Stored automatic profile evidence is inconsistent.");
  } else profile = buildAutomaticArizonaProfile(base, {
    adapter: ARIZONA_SOURCE_ADAPTER, baseVersion: row.base_version,
    sourceDigest: row.source_digest, sourceText: row.source_text, generatedAt: row.generated_at,
  });
  if (profile.version !== row.profile_version) throw new Error("Stored automatic profile version is inconsistent.");
  return { profile, changes: JSON.parse(row.changes_json) };
}

export async function automaticComplianceHistory(db, jurisdiction) {
  const base = US_JURISDICTION_PROFILE_BY_CODE[jurisdiction];
  if (!base || !db) return [];
  const rows = await db.prepare("SELECT profile_version FROM compliance_generated_profiles WHERE source_key = ? AND base_version = ? ORDER BY generated_at DESC, profile_version DESC LIMIT 5")
    .bind(`state:${base.postalCode.toLowerCase()}`, base.version).all();
  if (!rows.results.length) return [];
  const profiles = await Promise.all(rows.results.map((row) => automaticComplianceProfile(db, jurisdiction, row.profile_version)));
  return [...profiles.map((item) => item.profile), base].map((profile) => ({
    version: profile.version, date: profile.researchedOn, requirements: profile.requirements,
    depositCapSummary: profile.depositCapSummary, deadlineSummary: profile.deadlineSummary,
  }));
}

export async function latestAutomaticComplianceProfile(db, jurisdiction) {
  const base = US_JURISDICTION_PROFILE_BY_CODE[jurisdiction];
  if (!base || !db) return null;
  const row = await db.prepare("SELECT profile_version FROM compliance_generated_profiles WHERE source_key = ? AND base_version = ? ORDER BY generated_at DESC, profile_version DESC LIMIT 1")
    .bind(`state:${base.postalCode.toLowerCase()}`, base.version).first();
  return row ? automaticComplianceProfile(db, jurisdiction, row.profile_version) : null;
}

async function completeSourceText(response) {
  if (response.status !== 200 || (response.url && response.url !== ARIZONA_SOURCE_URL) ||
      !/text\/html|application\/xhtml\+xml/i.test(response.headers.get("content-type") || "")) {
    throw new Error("Arizona did not return the complete official HTML statute.");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 131072) throw new Error("Arizona statute exceeded the complete-source size limit.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return extractArizonaSource(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export async function refreshAutomaticArizonaSource(db, sourceRow, now, signal) {
  const response = await fetch(ARIZONA_SOURCE_URL, { redirect: "manual", signal, headers: { accept: "text/html" } });
  if (!response.ok) throw new Error(`Official source returned HTTP ${response.status}.`);
  const checkedAt = now.toISOString();
  let sourceText;
  try { sourceText = await completeSourceText(response); }
  catch (error) { error.requiresSourceReview = true; throw error; }
  const digest = await arizonaSourceDigest(sourceText, base.version);
  const previous = await automaticComplianceProfile(db, "us-az") || await latestAutomaticComplianceProfile(db, "us-az");
  let profile;
  let issue = null;
  try {
    profile = buildAutomaticArizonaProfile(base, { adapter: ARIZONA_SOURCE_ADAPTER, baseVersion: base.version, sourceDigest: digest, sourceText, generatedAt: checkedAt });
  } catch (error) { issue = error.message; }
  await persistAutomaticObservation(db, sourceRow, { digest, sourceText, checkedAt, profile, issue,
    changes: profile ? arizonaRequirementChanges(previous?.profile || base, profile) : [] });
}

export async function persistAutomaticObservation(db, sourceRow, { digest, sourceText, checkedAt, verifiedAt = checkedAt, profile, issue = null, changes = [] }) {
  const statements = [db.prepare(`INSERT INTO compliance_source_texts
    (source_key, source_digest, base_version, source_text, first_checked_at, profile_version) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_key, source_digest) DO UPDATE SET profile_version = COALESCE(compliance_source_texts.profile_version, excluded.profile_version)`)
    .bind(sourceRow.source_key, digest, sourceRow.profile_version, sourceText, checkedAt, profile?.version || null)];
  if (profile) statements.push(db.prepare(`INSERT OR IGNORE INTO compliance_generated_profiles
    (profile_version, source_key, source_digest, base_version, generated_at, changes_json, profile_json) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(profile.version, sourceRow.source_key, profile.sourceUpdate.sourceDigest, sourceRow.profile_version, profile.sourceUpdate.generatedAt, JSON.stringify(changes),
      profile.version.startsWith("az-auto-v1-") ? null : JSON.stringify(profile)));
  statements.push(db.prepare(`UPDATE compliance_source_checks SET
    current_signature = ?, baseline_signature = CASE WHEN ? = 'unchanged' THEN ? ELSE baseline_signature END,
    status = ?, http_status = 200, last_checked_at = ?, error = ?,
    last_verified_at = CASE WHEN ? = 'unchanged' THEN ? ELSE last_verified_at END,
    last_changed_at = CASE WHEN current_signature <> ? THEN ? ELSE last_changed_at END
    WHERE source_key = ? AND profile_version = ? AND url = ? AND (last_checked_at IS NULL OR last_checked_at <= ?)`)
    .bind(digest, profile ? "unchanged" : "changed", digest, profile ? "unchanged" : "changed", checkedAt, issue,
      profile ? "unchanged" : "changed", verifiedAt, digest, checkedAt, sourceRow.source_key, sourceRow.profile_version, sourceRow.url, checkedAt));
  await db.batch(statements);
}
