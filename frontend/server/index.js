const AGREEMENTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS agreement_negotiations (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL,
  revision INTEGER NOT NULL,
  terms_json TEXT NOT NULL,
  landlord_email TEXT NOT NULL,
  tenant_email TEXT NOT NULL,
  arbiter_email TEXT,
  landlord_token_hash TEXT NOT NULL,
  tenant_token_hash TEXT NOT NULL,
  arbiter_token_hash TEXT,
  tenant_approved_revision INTEGER,
  arbiter_approved_revision INTEGER,
  tenant_wallet TEXT,
  arbiter_wallet TEXT,
  onchain_agreement_id TEXT,
  onchain_tx_hash TEXT
)`;

const EVENTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS negotiation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  negotiation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  revision INTEGER NOT NULL,
  metadata_json TEXT,
  FOREIGN KEY (negotiation_id) REFERENCES agreement_negotiations(id)
)`;

const EVENTS_INDEX = `
CREATE INDEX IF NOT EXISTS negotiation_events_negotiation_id_idx
ON negotiation_events (negotiation_id, id)`;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WALLET_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const encoder = new TextEncoder();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function cleanText(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeEmail(value) {
  return cleanText(value, 254).toLowerCase();
}

function validTerms(terms) {
  return (
    terms &&
    typeof terms === "object" &&
    typeof terms.jurisdiction === "string" &&
    (terms.tokenChoice === "plain" || terms.tokenChoice === "yield") &&
    typeof terms.deposit === "string" &&
    Number(terms.deposit) > 0 &&
    typeof terms.claimWindowStart === "string" &&
    !Number.isNaN(new Date(terms.claimWindowStart).getTime()) &&
    [terms.claimDays, terms.responseDays, terms.arbiterDays].every(
      (value) => typeof value === "string" && Number(value) > 0,
    )
  );
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function initialize(db) {
  await db.batch([
    db.prepare(AGREEMENTS_SCHEMA),
    db.prepare(EVENTS_SCHEMA),
    db.prepare(EVENTS_INDEX),
  ]);
}

async function rowFor(db, id) {
  return db
    .prepare("SELECT * FROM agreement_negotiations WHERE id = ?")
    .bind(id)
    .first();
}

async function authorize(row, token) {
  if (!row || !token) return null;
  const hash = await hashToken(token);
  if (hash === row.landlord_token_hash) return "landlord";
  if (hash === row.tenant_token_hash) return "tenant";
  if (row.arbiter_token_hash && hash === row.arbiter_token_hash) return "arbiter";
  return null;
}

async function eventsFor(db, id) {
  const result = await db
    .prepare(
      "SELECT id, created_at, actor_role, action, summary, revision, metadata_json FROM negotiation_events WHERE negotiation_id = ? ORDER BY id ASC",
    )
    .bind(id)
    .all();
  return (result.results || []).map((event) => ({
    id: event.id,
    createdAt: event.created_at,
    actorRole: event.actor_role,
    action: event.action,
    summary: event.summary,
    revision: event.revision,
    metadata: event.metadata_json ? JSON.parse(event.metadata_json) : null,
  }));
}

async function serialize(db, row) {
  const arbiterRequired = Boolean(row.arbiter_email);
  return {
    id: row.id,
    status: row.status,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    landlordEmail: row.landlord_email,
    tenantEmail: row.tenant_email,
    arbiterEmail: row.arbiter_email,
    terms: JSON.parse(row.terms_json),
    tenantApproved: row.tenant_approved_revision === row.revision,
    arbiterApproved: !arbiterRequired || row.arbiter_approved_revision === row.revision,
    tenantWallet: row.tenant_wallet,
    arbiterWallet: row.arbiter_wallet,
    onchainAgreementId: row.onchain_agreement_id,
    onchainTxHash: row.onchain_tx_hash,
    events: await eventsFor(db, row.id),
  };
}

function eventStatement(db, id, now, actorRole, action, summary, revision, metadata = null) {
  return db
    .prepare(
      "INSERT INTO negotiation_events (negotiation_id, created_at, actor_role, action, summary, revision, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id, now, actorRole, action, summary, revision, metadata ? JSON.stringify(metadata) : null);
}

async function createNegotiation(request, db) {
  const body = await request.json();
  const landlordEmail = normalizeEmail(body.landlordEmail);
  const tenantEmail = normalizeEmail(body.tenantEmail);
  const arbiterEmail = normalizeEmail(body.arbiterEmail) || null;

  if (!EMAIL_PATTERN.test(landlordEmail) || !EMAIL_PATTERN.test(tenantEmail)) {
    return json({ error: "A valid landlord and tenant email are required." }, 400);
  }
  if (arbiterEmail && !EMAIL_PATTERN.test(arbiterEmail)) {
    return json({ error: "The optional arbiter email is invalid." }, 400);
  }
  if (new Set([landlordEmail, tenantEmail, arbiterEmail].filter(Boolean)).size !== (arbiterEmail ? 3 : 2)) {
    return json({ error: "Each party must use a different email." }, 400);
  }
  if (!validTerms(body.terms)) {
    return json({ error: "The agreement terms are incomplete or invalid." }, 400);
  }

  const id = crypto.randomUUID().split("-")[0];
  const landlordToken = randomToken();
  const tenantToken = randomToken();
  const arbiterToken = arbiterEmail ? randomToken() : null;
  const [landlordHash, tenantHash, arbiterHash] = await Promise.all([
    hashToken(landlordToken),
    hashToken(tenantToken),
    arbiterToken ? hashToken(arbiterToken) : Promise.resolve(null),
  ]);
  const now = new Date().toISOString();
  const termsJson = JSON.stringify(body.terms);

  await db.batch([
    db
      .prepare(
        `INSERT INTO agreement_negotiations (
          id, created_at, updated_at, status, revision, terms_json,
          landlord_email, tenant_email, arbiter_email,
          landlord_token_hash, tenant_token_hash, arbiter_token_hash
        ) VALUES (?, ?, ?, 'draft', 1, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        now,
        now,
        termsJson,
        landlordEmail,
        tenantEmail,
        arbiterEmail,
        landlordHash,
        tenantHash,
        arbiterHash,
      ),
    eventStatement(
      db,
      id,
      now,
      "landlord",
      "proposal_created",
      `Created revision 1 for ${tenantEmail}${arbiterEmail ? ` with ${arbiterEmail} as optional arbiter` : " without an arbiter"}.`,
      1,
      { terms: body.terms },
    ),
  ]);

  const row = await rowFor(db, id);
  return json({
    record: await serialize(db, row),
    access: {
      landlord: landlordToken,
      tenant: tenantToken,
      arbiter: arbiterToken,
    },
  }, 201);
}

async function getNegotiation(db, id, token) {
  const row = await rowFor(db, id);
  const role = await authorize(row, token);
  if (!role) return json({ error: "This proposal link is invalid or no longer available." }, 403);
  return json(await serialize(db, row));
}

async function sendLandlordReadyNotification(request, env, row) {
  if (!env.RESEND_API_KEY || !env.NOTIFICATION_FROM_EMAIL) return null;
  const workspaceUrl = new URL(request.url).origin;
  const subject = `OpenEscrow proposal ${row.id} is approved and ready to finalize`;
  const text = [
    `The tenant${row.arbiter_email ? " and optional arbiter have" : " has"} approved revision ${row.revision} of OpenEscrow proposal ${row.id}.`,
    "The proposal is still saved offchain and has not been finalized.",
    `Sign in as the landlord, choose Agreements & deductions, and select Find my proposals & agreements: ${workspaceUrl}`,
    "Open the approval-ready proposal and submit the finalized terms onchain.",
  ].join("\n\n");
  const sent = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "idempotency-key": `proposal-ready-${row.id}-${row.revision}`,
      "user-agent": "OpenEscrow/1.0",
    },
    body: JSON.stringify({
      from: env.NOTIFICATION_FROM_EMAIL,
      to: [row.landlord_email],
      subject,
      text,
    }),
  });
  const result = await sent.json().catch(() => ({}));
  return sent.ok && result.id ? result.id : null;
}

async function applyAction(request, env, id) {
  const db = env.DB;
  const body = await request.json();
  const row = await rowFor(db, id);
  const role = await authorize(row, body.token);
  if (!role) return json({ error: "This proposal link is invalid or no longer available." }, 403);

  const now = new Date().toISOString();
  const revision = Number(row.revision);
  const statements = [];

  if (body.type === "propose_change") {
    if (row.status === "finalized") {
      return json({ error: "Agreement terms can no longer be changed after onchain finalization." }, 409);
    }
    if (role !== "tenant" && role !== "arbiter") {
      return json({ error: "Only the invited tenant or arbiter may propose changes." }, 403);
    }
    const summary = cleanText(body.summary, 1000);
    if (summary.length < 8) return json({ error: "Describe the proposed change in more detail." }, 400);
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(db, id, now, role, "change_proposed", summary, revision),
    );
  } else if (body.type === "approve") {
    if (row.status === "finalized") {
      return json({ error: "This proposal has already been finalized onchain." }, 409);
    }
    if (role !== "tenant" && role !== "arbiter") {
      return json({ error: "Only the invited tenant or arbiter may approve." }, 403);
    }
    if (!WALLET_PATTERN.test(body.wallet || "")) {
      return json({ error: "Connect a valid EVM wallet before approving." }, 400);
    }
    const field = role === "tenant" ? "tenant" : "arbiter";
    statements.push(
      db
        .prepare(
          `UPDATE agreement_negotiations
           SET ${field}_approved_revision = ?, ${field}_wallet = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(revision, body.wallet, now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "revision_approved",
        `Approved revision ${revision} and confirmed wallet ${body.wallet}.`,
        revision,
      ),
    );
  } else if (body.type === "revise") {
    if (row.status === "finalized") {
      return json({ error: "Agreement terms can no longer be revised after onchain finalization." }, 409);
    }
    if (role !== "landlord") return json({ error: "Only the landlord may revise the proposal." }, 403);
    if (!validTerms(body.terms)) return json({ error: "The revised agreement terms are invalid." }, 400);
    const summary = cleanText(body.summary, 1000);
    if (summary.length < 8) return json({ error: "Describe what changed in this revision." }, 400);
    const nextRevision = revision + 1;
    statements.push(
      db
        .prepare(
          `UPDATE agreement_negotiations
           SET terms_json = ?, revision = ?, status = 'draft',
               tenant_approved_revision = NULL, arbiter_approved_revision = NULL, updated_at = ?
           WHERE id = ?`,
        )
        .bind(JSON.stringify(body.terms), nextRevision, now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "proposal_revised",
        `Published revision ${nextRevision}: ${summary}`,
        nextRevision,
        { terms: body.terms },
      ),
    );
  } else if (body.type === "invitation_prepared") {
    if (row.status === "finalized") {
      return json({ error: "Use the claim-notice action after onchain finalization." }, 409);
    }
    if (role !== "landlord") return json({ error: "Only the landlord may prepare invitations." }, 403);
    if (body.invitedRole !== "tenant" && body.invitedRole !== "arbiter") {
      return json({ error: "The invited role is invalid." }, 400);
    }
    if (body.invitedRole === "arbiter" && !row.arbiter_email) {
      return json({ error: "This proposal does not include an arbiter." }, 400);
    }
    const method = body.method === "gmail" ? "Gmail" : "copied invitation";
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "invitation_prepared",
        `Prepared the ${body.invitedRole} invitation using ${method}.`,
        revision,
      ),
    );
  } else if (body.type === "finalize") {
    if (role !== "landlord") return json({ error: "Only the landlord may finalize the proposal." }, 403);
    if (row.status !== "ready") {
      return json({ error: "The current revision must be approved before it can be finalized." }, 409);
    }
    const agreementId = cleanText(body.agreementId, 80);
    const transactionHash = cleanText(body.transactionHash, 100);
    if (!agreementId || !/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
      return json({ error: "The onchain agreement details are invalid." }, 400);
    }
    statements.push(
      db
        .prepare(
          "UPDATE agreement_negotiations SET status = 'finalized', onchain_agreement_id = ?, onchain_tx_hash = ?, updated_at = ? WHERE id = ?",
        )
        .bind(agreementId, transactionHash, now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "posted_onchain",
        `Finalized as onchain agreement #${agreementId} in transaction ${transactionHash}.`,
        revision,
      ),
    );
  } else if (body.type === "claim_submitted") {
    if (role !== "landlord") {
      return json({ error: "Only the landlord may submit a deduction claim." }, 403);
    }
    if (row.status !== "finalized") {
      return json({ error: "The agreement must be finalized onchain before a deduction claim." }, 409);
    }
    const amount = cleanText(body.amount, 80);
    const category = cleanText(body.category, 120);
    const note = cleanText(body.note, 1000);
    const evidenceUri = cleanText(body.evidenceUri, 500);
    const evidenceHash = cleanText(body.evidenceHash, 100);
    const transactionHash = cleanText(body.transactionHash, 100);
    if (!amount || !category || !/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
      return json({ error: "The recorded deduction claim is incomplete." }, 400);
    }
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "deduction_claim_submitted",
        `Submitted a ${amount}-share deduction claim (${category})${note ? `: ${note}` : "."}${evidenceUri ? ` Evidence: ${evidenceUri}.` : ""}`,
        revision,
        { amount, category, note, evidenceUri, evidenceHash, transactionHash },
      ),
    );
  } else if (body.type === "claim_notification_prepared") {
    if (role !== "landlord") {
      return json({ error: "Only the landlord may prepare the tenant claim notice." }, 403);
    }
    const method = body.method === "copy" ? "copied email" : "Gmail";
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "claim_notification_prepared",
        `Prepared the tenant deduction-claim notice using ${method}.`,
        revision,
      ),
    );
  } else if (body.type === "claim_amended") {
    if (role !== "landlord") {
      return json({ error: "Only the landlord may amend a deduction claim." }, 403);
    }
    const amount = cleanText(body.amount, 80);
    const note = cleanText(body.note, 1000);
    const evidenceUri = cleanText(body.evidenceUri, 500);
    const evidenceHash = cleanText(body.evidenceHash, 100);
    const transactionHash = cleanText(body.transactionHash, 100);
    if (!amount || !/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
      return json({ error: "The recorded claim amendment is incomplete." }, 400);
    }
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "deduction_claim_amended",
        `Amended the deduction claim to ${amount} shares${note ? `: ${note}` : "."}${evidenceUri ? ` Evidence: ${evidenceUri}.` : ""}`,
        revision,
        { amount, note, evidenceUri, evidenceHash, transactionHash },
      ),
    );
  } else if (body.type === "claim_response") {
    if (role !== "tenant") {
      return json({ error: "Only the tenant may approve or dispute a deduction claim." }, 403);
    }
    if (!["approve", "partial", "dispute"].includes(body.decision)) {
      return json({ error: "The tenant response is invalid." }, 400);
    }
    const acceptedAmount = cleanText(body.acceptedAmount, 80);
    const note = cleanText(body.note, 1000);
    const transactionHash = cleanText(body.transactionHash, 100);
    if (!acceptedAmount || !/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
      return json({ error: "The tenant response record is incomplete." }, 400);
    }
    const decisionLabel =
      body.decision === "approve"
        ? "approved the deduction in full"
        : body.decision === "dispute"
          ? "disputed the deduction in full"
          : `accepted ${acceptedAmount} shares and disputed the remainder`;
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "claim_response_submitted",
        `Tenant ${decisionLabel}${note ? `: ${note}` : "."}`,
        revision,
        { decision: body.decision, acceptedAmount, note, transactionHash },
      ),
    );
  } else if (body.type === "arbiter_ruling") {
    if (role !== "arbiter") {
      return json({ error: "Only the appointed arbiter may record a ruling." }, 403);
    }
    const award = cleanText(body.awardToLandlord, 80);
    const note = cleanText(body.note, 1000);
    const transactionHash = cleanText(body.transactionHash, 100);
    if (!award || !/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
      return json({ error: "The arbiter ruling record is incomplete." }, 400);
    }
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "arbiter_ruling_submitted",
        `Awarded ${award} disputed shares to the landlord${note ? `: ${note}` : "."}`,
        revision,
        { awardToLandlord: award, note, transactionHash },
      ),
    );
  } else {
    return json({ error: "Unsupported agreement action." }, 400);
  }

  await db.batch(statements);
  let updated = await rowFor(db, id);
  if (body.type === "approve") {
    const tenantApproved = updated.tenant_approved_revision === updated.revision;
    const arbiterApproved = !updated.arbiter_email || updated.arbiter_approved_revision === updated.revision;
    if (tenantApproved && arbiterApproved && updated.status !== "ready") {
      const readyAt = new Date().toISOString();
      await db.batch([
        db
          .prepare("UPDATE agreement_negotiations SET status = 'ready', updated_at = ? WHERE id = ?")
          .bind(readyAt, id),
        eventStatement(
          db,
          id,
          readyAt,
          "system",
          "proposal_ready",
          `All required parties approved revision ${updated.revision}; it is ready for onchain finalization.`,
          updated.revision,
        ),
      ]);
      updated = await rowFor(db, id);
      try {
        const messageId = await sendLandlordReadyNotification(request, env, updated);
        if (messageId) {
          const notifiedAt = new Date().toISOString();
          await db.batch([
            db
              .prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?")
              .bind(notifiedAt, id),
            eventStatement(
              db,
              id,
              notifiedAt,
              "system",
              "landlord_ready_notification_sent",
              `Notified ${updated.landlord_email} that revision ${updated.revision} is approved and ready for onchain finalization.`,
              updated.revision,
              { messageId },
            ),
          ]);
          updated = await rowFor(db, id);
        }
      } catch {
        // Approval must still succeed if the optional email provider is unavailable.
      }
    }
  }
  return json(await serialize(db, updated));
}

async function uploadEvidence(request, env) {
  if (!env.DB) return json({ error: "Agreement record storage is not available." }, 503);
  if (!env.PINATA_JWT) {
    return json(
      {
        error:
          "Direct IPFS upload is not configured yet. Add a Pinata JWT, or paste an existing privacy-safe IPFS URI.",
      },
      503,
    );
  }
  const form = await request.formData();
  const proposalId = cleanText(form.get("proposalId"), 80);
  const token = cleanText(form.get("token"), 200);
  const file = form.get("file");
  const row = await rowFor(env.DB, proposalId);
  const role = await authorize(row, token);
  if (!role || (role !== "landlord" && role !== "tenant")) {
    return json({ error: "Only an agreement party may upload claim evidence." }, 403);
  }
  if (!(file instanceof File) || file.size === 0) {
    return json({ error: "Choose an invoice or supporting document to upload." }, 400);
  }
  if (file.size > 10 * 1024 * 1024) {
    return json({ error: "Evidence files are limited to 10 MB in this MVP." }, 413);
  }

  const pinataForm = new FormData();
  pinataForm.set("file", file, file.name);
  pinataForm.set("pinataOptions", JSON.stringify({ cidVersion: 1 }));
  pinataForm.set(
    "pinataMetadata",
    JSON.stringify({ name: `openescrow-${proposalId}-${crypto.randomUUID()}` }),
  );
  const upload = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { authorization: `Bearer ${env.PINATA_JWT}` },
    body: pinataForm,
  });
  const result = await upload.json();
  if (!upload.ok || !result.IpfsHash) {
    return json({ error: "The IPFS pinning service rejected the upload." }, 502);
  }

  const now = new Date().toISOString();
  const uri = `ipfs://${result.IpfsHash}`;
  await env.DB.batch([
    env.DB
      .prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?")
      .bind(now, proposalId),
    eventStatement(
      env.DB,
      proposalId,
      now,
      role,
      "evidence_uploaded",
      `Uploaded a ${file.type || "document"} evidence file to IPFS as ${uri}.`,
      row.revision,
      { cid: result.IpfsHash, uri, size: file.size, type: file.type || null },
    ),
  ]);
  return json({
    cid: result.IpfsHash,
    uri,
    gatewayUrl: `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`,
  });
}

async function sendClaimNotification(request, env) {
  if (!env.DB) return json({ error: "Agreement record storage is not available." }, 503);
  if (!env.RESEND_API_KEY || !env.NOTIFICATION_FROM_EMAIL) {
    return json(
      {
        error:
          "Automatic email delivery is not configured yet. Use the Gmail or copy-email fallback.",
      },
      503,
    );
  }
  const body = await request.json();
  const proposalId = cleanText(body.proposalId, 80);
  const row = await rowFor(env.DB, proposalId);
  const role = await authorize(row, body.token);
  if (role !== "landlord") {
    return json({ error: "Only the landlord may send a deduction-claim notice." }, 403);
  }
  let reviewUrl;
  try {
    reviewUrl = new URL(body.reviewUrl);
  } catch {
    return json({ error: "The tenant review link is invalid." }, 400);
  }
  const requestOrigin = new URL(request.url).origin;
  if (
    reviewUrl.origin !== requestOrigin ||
    reviewUrl.searchParams.get("invite") !== "tenant" ||
    reviewUrl.searchParams.get("proposal") !== proposalId
  ) {
    return json({ error: "The tenant review link is invalid." }, 400);
  }
  const agreementId = cleanText(body.agreementId, 80);
  const amount = cleanText(body.amount, 80);
  const note = cleanText(body.note, 1000);
  const evidenceUri = cleanText(body.evidenceUri, 500);
  if (!agreementId || !amount) return json({ error: "The claim notice is incomplete." }, 400);

  const subject = `OpenEscrow deduction claim for agreement #${agreementId}`;
  const text = [
    `A deduction claim of ${amount} shares has been submitted for OpenEscrow agreement #${agreementId}.`,
    note ? `Landlord note: ${note}` : "",
    evidenceUri ? `Invoice / evidence: ${evidenceUri}` : "",
    `Review the documentation and approve or dispute the claim: ${reviewUrl.toString()}`,
    "Your decision and all related actions will be included in the timestamped agreement record.",
  ].filter(Boolean).join("\n\n");
  const sent = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "idempotency-key": `claim-${proposalId}-${crypto.randomUUID()}`,
      "user-agent": "OpenEscrow/1.0",
    },
    body: JSON.stringify({
      from: env.NOTIFICATION_FROM_EMAIL,
      to: [row.tenant_email],
      subject,
      text,
    }),
  });
  const result = await sent.json();
  if (!sent.ok || !result.id) {
    return json({ error: "The email provider could not send this claim notice." }, 502);
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB
      .prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?")
      .bind(now, proposalId),
    eventStatement(
      env.DB,
      proposalId,
      now,
      role,
      "claim_notification_sent",
      `Sent the deduction-claim notice to ${row.tenant_email}.`,
      row.revision,
      { messageId: result.id },
    ),
  ]);
  return json({ messageId: result.id });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function report(db, id, token) {
  const row = await rowFor(db, id);
  const role = await authorize(row, token);
  if (!role) return new Response("Invalid report link.", { status: 403 });
  const record = await serialize(db, row);
  const terms = record.terms;
  const timeline = record.events
    .map(
      (event) => `<tr><td>${escapeHtml(event.createdAt)}</td><td>${escapeHtml(event.actorRole)}</td><td>${escapeHtml(event.summary)}</td></tr>`,
    )
    .join("");
  const revisionSnapshots = record.events
    .filter((event) => event.metadata?.terms)
    .map((event) => {
      const snapshot = event.metadata.terms;
      return `<h3>Revision ${event.revision}</h3><p class="meta">${escapeHtml(event.createdAt)}</p><table>
<tr><th>Deposit</th><td>${escapeHtml(snapshot.deposit)} ${snapshot.tokenChoice === "yield" ? "ytUSDC" : "testUSDC"}</td></tr>
<tr><th>Lease expiration</th><td>${escapeHtml(snapshot.claimWindowStart)}</td></tr>
<tr><th>Claim period</th><td>${escapeHtml(snapshot.claimDays)} days</td></tr>
<tr><th>Response period</th><td>${escapeHtml(snapshot.responseDays)} days</td></tr>
<tr><th>Arbiter ruling period</th><td>${escapeHtml(snapshot.arbiterDays)} days</td></tr>
<tr><th>Jurisdiction context</th><td>${escapeHtml(snapshot.jurisdiction)}</td></tr>
</table>`;
    })
    .join("");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>OpenEscrow proposal ${escapeHtml(record.id)} record</title>
<style>body{font:15px/1.5 system-ui,sans-serif;color:#191826;max-width:900px;margin:40px auto;padding:0 24px}h1{margin-bottom:0}.meta{color:#666}table{border-collapse:collapse;width:100%;margin:20px 0}th,td{text-align:left;vertical-align:top;border:1px solid #ddd;padding:9px}th{background:#f5f3fb}@media print{button{display:none}body{margin:0}}</style>
</head><body>
<button onclick="window.print()">Print or save as PDF</button>
<h1>OpenEscrow agreement record</h1>
<p class="meta">Proposal ${escapeHtml(record.id)} · revision ${record.revision} · status ${escapeHtml(record.status)}<br>Generated ${escapeHtml(new Date().toISOString())}</p>
<h2>Parties</h2><table>
<tr><th>Landlord</th><td>${escapeHtml(record.landlordEmail)}</td></tr>
<tr><th>Tenant</th><td>${escapeHtml(record.tenantEmail)}</td></tr>
<tr><th>Arbiter</th><td>${escapeHtml(record.arbiterEmail || "Not appointed")}</td></tr>
</table>
<h2>Current terms</h2><table>
<tr><th>Deposit</th><td>${escapeHtml(terms.deposit)} ${terms.tokenChoice === "yield" ? "ytUSDC" : "testUSDC"}</td></tr>
<tr><th>Lease expiration</th><td>${escapeHtml(terms.claimWindowStart)}</td></tr>
<tr><th>Claim period</th><td>${escapeHtml(terms.claimDays)} days</td></tr>
<tr><th>Response period</th><td>${escapeHtml(terms.responseDays)} days</td></tr>
<tr><th>Arbiter ruling period</th><td>${escapeHtml(terms.arbiterDays)} days</td></tr>
<tr><th>Jurisdiction context</th><td>${escapeHtml(terms.jurisdiction)}</td></tr>
</table>
<h2>Approval state</h2>
<p>Tenant: ${record.tenantApproved ? "approved" : "not approved"} · Arbiter: ${record.arbiterEmail ? (record.arbiterApproved ? "approved" : "not approved") : "not appointed"}</p>
<h2>Revision snapshots</h2>${revisionSnapshots}
<h2>Timestamped activity</h2><table><thead><tr><th>Time (UTC)</th><th>Actor</th><th>Action</th></tr></thead><tbody>${timeline}</tbody></table>
<p class="meta">This MVP record is platform-stored and has not yet been cryptographically anchored onchain.</p>
</body></html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function sameOriginPost(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/notifications/claim" && request.method === "POST") {
      if (!sameOriginPost(request)) return json({ error: "Cross-origin writes are not allowed." }, 403);
      if (env.DB) await initialize(env.DB);
      return sendClaimNotification(request, env);
    }
    if (url.pathname === "/api/evidence" && request.method === "POST") {
      if (!sameOriginPost(request)) return json({ error: "Cross-origin writes are not allowed." }, 403);
      if (env.DB) await initialize(env.DB);
      return uploadEvidence(request, env);
    }
    if (url.pathname.startsWith("/api/negotiations")) {
      if (!env.DB) return json({ error: "Agreement record storage is not available." }, 503);
      if (request.method !== "GET" && !sameOriginPost(request)) {
        return json({ error: "Cross-origin writes are not allowed." }, 403);
      }
      await initialize(env.DB);

      if (url.pathname === "/api/negotiations" && request.method === "POST") {
        return createNegotiation(request, env.DB);
      }

      const match = url.pathname.match(/^\/api\/negotiations\/([a-zA-Z0-9-]+)(?:\/(actions|report))?$/);
      if (!match) return json({ error: "Agreement record endpoint not found." }, 404);
      const [, id, action] = match;
      if (!action && request.method === "GET") {
        return getNegotiation(env.DB, id, url.searchParams.get("token"));
      }
      if (action === "actions" && request.method === "POST") {
        return applyAction(request, env, id);
      }
      if (action === "report" && request.method === "GET") {
        return report(env.DB, id, url.searchParams.get("token"));
      }
      return json({ error: "Method not allowed." }, 405);
    }

    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== "GET") return response;
    const fallback = new URL(request.url);
    fallback.pathname = "/index.html";
    fallback.search = "";
    return env.ASSETS.fetch(new Request(fallback, request));
  },
};

export default worker;
