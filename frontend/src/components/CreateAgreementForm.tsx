import { useEffect, useMemo, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { decodeEventLog, isAddress } from "viem";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import {
  MAX_CLAIM_WINDOW_OFFSET_SECONDS,
  MAX_PERIOD_SECONDS,
  MIN_PERIOD_SECONDS,
  OpenEscrowABI,
  OPEN_ESCROW_ADDRESS,
  USDC_ADDRESS,
  YIELD_USDC_ADDRESS,
  chain,
} from "../contracts/config";
import { parseUSDC } from "../lib/format";
import {
  JURISDICTIONS,
  rememberJurisdiction,
  type JurisdictionCode,
} from "../lib/jurisdictions";
import { ACCOUNT_AUTH_ENABLED } from "../lib/accountConfig";
import { useTrackedAgreements } from "../lib/useTrackedAgreements";
import type { InviteRole } from "../lib/inviteContext";
import {
  buildNegotiationInviteUrl,
  clearLandlordBundle,
  createNegotiation,
  loadNegotiation,
  negotiationAction,
  negotiationReportUrl,
  readLandlordBundle,
  rememberLandlordBundle,
  storeNegotiationAccess,
  type AgreementTerms,
  type CreatedNegotiation,
  type NegotiationAccess,
  type NegotiationRecord,
} from "../lib/negotiations";
import { AgreementCard } from "./AgreementCard";

const DAY = 24 * 60 * 60;
const MAX_PERIOD_DAYS = MAX_PERIOD_SECONDS / DAY;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

type ProposalField =
  | "tenantEmail"
  | "arbiterEmail"
  | "deposit"
  | "claimWindowStart"
  | "claimDays"
  | "responseDays"
  | "arbiterDays"
  | "revisionSummary";

type ProposalValidationIssue = {
  field?: ProposalField;
  message: string;
};

function validatePeriodDays(days: string, label: string): string | null {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return `${label} must be a positive number of days.`;
  const seconds = n * DAY;
  if (seconds < MIN_PERIOD_SECONDS) return `${label} is below the contract's minimum (5 minutes).`;
  if (seconds > MAX_PERIOD_SECONDS) return `${label} exceeds the contract's maximum (${MAX_PERIOD_DAYS} days).`;
  return null;
}

function inviteContent(
  email: string,
  role: InviteRole,
  proposalId: string,
  token: string,
) {
  const inviteUrl = buildNegotiationInviteUrl(role, proposalId, token);
  const subject = `Review OpenEscrow agreement proposal ${proposalId}`;
  const body = [
    `You have been invited to review an OpenEscrow security-deposit proposal as the ${role}.`,
    "",
    `Review the landlord's terms, propose changes, or approve the current revision here: ${inviteUrl}`,
    "",
    "Your invitation is locked to the role named above. OpenEscrow can create an EVM wallet when you sign in with Google, or you can connect your own wallet.",
    "",
    "Every proposal, requested change, approval, invitation action, and finalization is added to a timestamped running record.",
    "",
    "This is a Base Sepolia testnet demonstration. Do not send real funds.",
  ].join("\n");
  return {
    body,
    gmailUrl: `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  };
}

function AgreementForm({
  landlordEmail,
  initialAccess,
}: {
  landlordEmail: string;
  initialAccess?: NegotiationAccess | null;
}) {
  const { address, isConnected } = useAccount();
  const { addId } = useTrackedAgreements();

  const [tenantEmail, setTenantEmail] = useState("");
  const [arbiterEmail, setArbiterEmail] = useState("");
  const [deposit, setDeposit] = useState("100");
  const [tokenChoice, setTokenChoice] = useState<"plain" | "yield">("plain");
  const [claimWindowStart, setClaimWindowStart] = useState("");
  const [claimDays, setClaimDays] = useState("30");
  const [responseDays, setResponseDays] = useState("7");
  const [arbiterDays, setArbiterDays] = useState("7");
  const [jurisdiction, setJurisdiction] = useState<JurisdictionCode>("testnet-generic");
  const [draft, setDraft] = useState<NegotiationRecord | null>(null);
  const [accessBundle, setAccessBundle] = useState<CreatedNegotiation["access"] | null>(null);
  const [revisionSummary, setRevisionSummary] = useState("");
  const [createdId, setCreatedId] = useState<bigint | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<ProposalField | null>(null);
  const [copiedInvite, setCopiedInvite] = useState<InviteRole | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const submittedJurisdiction = useRef<JurisdictionCode>("testnet-generic");
  const handledReceipt = useRef<`0x${string}` | null>(null);

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { data: receipt, isLoading: isMining } = useWaitForTransactionReceipt({ hash });
  const claimWindowHasPassed =
    Boolean(claimWindowStart) && new Date(claimWindowStart).getTime() <= Date.now();

  const landlordAccess = useMemo<NegotiationAccess | null>(
    () =>
      draft && accessBundle
        ? { proposalId: draft.id, role: "landlord", token: accessBundle.landlord }
        : null,
    [draft, accessBundle],
  );

  function applyTerms(record: NegotiationRecord) {
    setTenantEmail(record.tenantEmail);
    setArbiterEmail(record.arbiterEmail || "");
    setDeposit(record.terms.deposit);
    setTokenChoice(record.terms.tokenChoice);
    setClaimWindowStart(record.terms.claimWindowStart);
    setClaimDays(record.terms.claimDays);
    setResponseDays(record.terms.responseDays);
    setArbiterDays(record.terms.arbiterDays);
    if (JURISDICTIONS.some((item) => item.code === record.terms.jurisdiction)) {
      setJurisdiction(record.terms.jurisdiction as JurisdictionCode);
    }
  }

  useEffect(() => {
    const saved = readLandlordBundle(initialAccess?.proposalId);
    const access: NegotiationAccess | null =
      initialAccess?.role === "landlord"
        ? initialAccess
        : saved
          ? {
              proposalId: saved.proposalId,
              role: "landlord",
              token: saved.access.landlord,
            }
          : null;
    if (!access) return;
    loadNegotiation(access)
      .then((record) => {
        setDraft(record);
        setAccessBundle(
          saved?.access || {
            landlord: access.token,
            tenant: "",
            arbiter: null,
          },
        );
        applyTerms(record);
      })
      .catch(() => {
        clearLandlordBundle(access.proposalId);
      });
  }, [initialAccess]);

  useEffect(() => {
    if (!receipt || handledReceipt.current === receipt.transactionHash) return;
    handledReceipt.current = receipt.transactionHash;

    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: OpenEscrowABI, data: log.data, topics: log.topics });
        if (decoded.eventName === "AgreementProposed") {
          const id = (decoded.args as unknown as { id: bigint }).id;
          setCreatedId(id);
          rememberJurisdiction(id, submittedJurisdiction.current);
          addId(id);
          if (landlordAccess) {
            void negotiationAction(landlordAccess, {
              type: "finalize",
              agreementId: id.toString(),
              transactionHash: receipt.transactionHash,
            }).then(setDraft);
          }
          break;
        }
      } catch {
        // Ignore logs emitted by other contracts in the transaction.
      }
    }
  }, [receipt, addId, landlordAccess]);

  function currentTerms(): AgreementTerms {
    return {
      jurisdiction,
      tokenChoice,
      deposit,
      claimWindowStart,
      claimDays,
      responseDays,
      arbiterDays,
    };
  }

  function validateDraft(): ProposalValidationIssue | null {
    if (ACCOUNT_AUTH_ENABLED && !landlordEmail) {
      return { message: "The landlord must link a verified email before creating a proposal." };
    }
    if (!EMAIL_PATTERN.test(tenantEmail)) {
      return { field: "tenantEmail", message: "Enter a valid tenant email." };
    }
    const hasArbiter = arbiterEmail.trim() !== "";
    if (hasArbiter && !EMAIL_PATTERN.test(arbiterEmail)) {
      return {
        field: "arbiterEmail",
        message: "Enter a valid arbiter email, or leave it blank.",
      };
    }
    if (hasArbiter && tenantEmail.toLowerCase() === arbiterEmail.toLowerCase()) {
      return {
        field: "arbiterEmail",
        message: "Tenant and arbiter must use different emails.",
      };
    }
    if (
      tenantEmail.toLowerCase() === landlordEmail.toLowerCase() ||
      (hasArbiter && arbiterEmail.toLowerCase() === landlordEmail.toLowerCase())
    ) {
      return {
        field:
          tenantEmail.toLowerCase() === landlordEmail.toLowerCase()
            ? "tenantEmail"
            : "arbiterEmail",
        message: "Landlord, tenant, and arbiter must use different emails.",
      };
    }
    if (!claimWindowStart) {
      return {
        field: "claimWindowStart",
        message: "Expected lease expiration is required.",
      };
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const startSec = Math.floor(new Date(claimWindowStart).getTime() / 1000);
    if (!Number.isFinite(startSec) || startSec <= nowSec) {
      return {
        field: "claimWindowStart",
        message:
          "The saved lease-expiration date has passed. Choose a future date before publishing this revision.",
      };
    }
    if (startSec - nowSec > MAX_CLAIM_WINDOW_OFFSET_SECONDS) {
      return {
        field: "claimWindowStart",
        message: "Expected lease expiration is too far in the future.",
      };
    }
    try {
      if (parseUSDC(deposit) <= 0n) {
        return { field: "deposit", message: "Deposit must be greater than zero." };
      }
    } catch {
      return { field: "deposit", message: "Invalid deposit amount." };
    }
    for (const [days, label, field] of [
      [claimDays, "Claim period", "claimDays"],
      [responseDays, "Response period", "responseDays"],
      [arbiterDays, "Arbiter ruling period", "arbiterDays"],
    ] as const) {
      const validation = validatePeriodDays(days, label);
      if (validation) return { field, message: validation };
    }
    return null;
  }

  function clearFieldIssue(field: ProposalField) {
    if (invalidField !== field) return;
    setInvalidField(null);
    setFormError(null);
  }

  function reportIssue(issue: ProposalValidationIssue) {
    setFormMessage(null);
    setFormError(issue.message);
    setInvalidField(issue.field || null);
    window.requestAnimationFrame(() => {
      const target = issue.field
        ? document.querySelector<HTMLElement>(`[data-proposal-field="${issue.field}"]`)
        : document.getElementById("proposal-form-feedback");
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  async function saveDraft() {
    setFormError(null);
    setFormMessage(null);
    setInvalidField(null);
    if (draft && revisionSummary.trim().length < 8) {
      return reportIssue({
        field: "revisionSummary",
        message: "Add a revision note of at least 8 characters describing what changed.",
      });
    }
    const validation = validateDraft();
    if (validation) return reportIssue(validation);

    setIsSavingDraft(true);
    try {
      if (!draft) {
        const created = await createNegotiation({
          landlordEmail,
          tenantEmail,
          arbiterEmail: arbiterEmail.trim() || null,
          terms: currentTerms(),
        });
        setDraft(created.record);
        setAccessBundle(created.access);
        const access: NegotiationAccess = {
          proposalId: created.record.id,
          role: "landlord",
          token: created.access.landlord,
        };
        storeNegotiationAccess(access, true);
        rememberLandlordBundle(created);
        setFormMessage("Proposal saved. Invitations are now unlocked for this exact revision.");
      } else {
        if (!landlordAccess) throw new Error("The landlord proposal access is unavailable.");
        const updated = await negotiationAction(landlordAccess, {
          type: "revise",
          summary: revisionSummary.trim(),
          terms: currentTerms(),
        });
        setDraft(updated);
        setRevisionSummary("");
        setFormMessage(
          `Revision ${updated.revision} published. Prior approvals were reset; resend the review invitation so the tenant${updated.arbiterEmail ? " and arbiter" : ""} can approve the new revision.`,
        );
      }
    } catch (saveError) {
      reportIssue({
        message:
          saveError instanceof Error ? saveError.message : "The proposal could not be saved.",
      });
    } finally {
      setIsSavingDraft(false);
    }
  }

  function startAnotherProposal() {
    setDraft(null);
    setAccessBundle(null);
    setRevisionSummary("");
    setInvalidField(null);
    setFormError(null);
    setFormMessage("Ready to create a separate proposal.");
  }

  function inviteFor(role: InviteRole) {
    if (!draft || !accessBundle) return null;
    const token = role === "tenant" ? accessBundle.tenant : accessBundle.arbiter;
    const email = role === "tenant" ? draft.tenantEmail : draft.arbiterEmail;
    return token && email ? inviteContent(email, role, draft.id, token) : null;
  }

  function recordInvitation(role: InviteRole, method: "gmail" | "copy") {
    if (!landlordAccess) return;
    void negotiationAction(landlordAccess, {
      type: "invitation_prepared",
      invitedRole: role,
      method,
    }).then(setDraft);
  }

  async function copyInvite(role: InviteRole) {
    const invitation = inviteFor(role);
    if (!invitation) return;
    await navigator.clipboard.writeText(invitation.body);
    setCopiedInvite(role);
    recordInvitation(role, "copy");
  }

  function openInvite(role: InviteRole) {
    const invitation = inviteFor(role);
    if (!invitation) return;
    window.open(invitation.gmailUrl, "_blank", "noopener,noreferrer");
    recordInvitation(role, "gmail");
  }

  function finalizeOnchain() {
    setFormError(null);
    setCreatedId(null);
    if (!draft || draft.status !== "ready") {
      return setFormError("The tenant and optional arbiter must approve the current revision first.");
    }
    if (!address) return setFormError("Connect the landlord wallet before finalizing.");
    const tenantWallet = draft.tenantWallet || "";
    const arbiterWallet = draft.arbiterWallet || "";
    const hasArbiter = Boolean(draft.arbiterEmail);
    if (!isAddress(tenantWallet)) return setFormError("The tenant must approve with a valid wallet.");
    if (hasArbiter && !isAddress(arbiterWallet)) {
      return setFormError("The arbiter must approve with a valid wallet.");
    }
    if (tenantWallet.toLowerCase() === address.toLowerCase()) {
      return setFormError("The landlord and tenant wallets must be different.");
    }
    if (hasArbiter && arbiterWallet.toLowerCase() === address.toLowerCase()) {
      return setFormError("The landlord and arbiter wallets must be different.");
    }
    if (hasArbiter && tenantWallet.toLowerCase() === arbiterWallet.toLowerCase()) {
      return setFormError("The tenant and arbiter wallets must be different.");
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const startSec = Math.floor(new Date(claimWindowStart).getTime() / 1000);
    if (startSec < nowSec) return setFormError("The lease expiration must still be in the future.");
    if (startSec - nowSec > MAX_CLAIM_WINDOW_OFFSET_SECONDS) {
      return setFormError("The lease expiration is too far in the future.");
    }

    submittedJurisdiction.current = jurisdiction;
    writeContract({
      address: OPEN_ESCROW_ADDRESS,
      abi: OpenEscrowABI,
      functionName: "createAgreementWithToken",
      account: address,
      chain,
      args: [
        tenantWallet,
        hasArbiter ? arbiterWallet : ZERO_ADDRESS,
        tokenChoice === "yield" ? YIELD_USDC_ADDRESS : USDC_ADDRESS,
        parseUSDC(deposit),
        BigInt(startSec),
        BigInt(Number(claimDays) * DAY),
        BigInt(Number(responseDays) * DAY),
        BigInt(Number(arbiterDays) * DAY),
      ],
    });
  }

  return (
    <section className="card proposal-builder" id="proposal-builder">
      <div className="proposal-builder-heading">
        <div>
          <span className="eyebrow">Landlord-initiated workflow</span>
          <h2>{draft ? `Agreement proposal ${draft.id}` : "Set up a new agreement proposal"}</h2>
        </div>
        {draft && <span className={`negotiation-status status-${draft.status}`}>Revision {draft.revision}</span>}
      </div>
      <p className="hint">
        Set the complete proposal first. Tenant and optional arbiter invitations stay locked until
        it is saved, so invitees always receive terms they can review, change, and approve.
      </p>

      <div className="participant-summary">
        <span>Landlord email</span>
        <strong>{landlordEmail || "Link Google in your account settings first"}</strong>
        <small>The active wallet becomes the onchain landlord after approvals.</small>
      </div>

      <label>
        Tenant email
        <input
          value={tenantEmail}
          onChange={(event) => {
            setTenantEmail(event.target.value);
            clearFieldIssue("tenantEmail");
          }}
          placeholder="tenant@example.com"
          type="email"
          autoComplete="email"
          disabled={Boolean(draft)}
          data-proposal-field="tenantEmail"
          aria-invalid={invalidField === "tenantEmail"}
        />
      </label>
      <label>
        Arbiter email (optional)
        <input
          value={arbiterEmail}
          onChange={(event) => {
            setArbiterEmail(event.target.value);
            clearFieldIssue("arbiterEmail");
          }}
          placeholder="arbiter@example.com"
          type="email"
          autoComplete="email"
          disabled={Boolean(draft)}
          data-proposal-field="arbiterEmail"
          aria-invalid={invalidField === "arbiterEmail"}
        />
      </label>
      {draft && (
        <p className="field-help">
          Party emails are locked once invitations exist. Start a separate proposal to change the parties.
        </p>
      )}

      <label>
        Jurisdiction context
        <select value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value as JurisdictionCode)}>
          {JURISDICTIONS.map((option) => (
            <option key={option.code} value={option.code}>{option.label}</option>
          ))}
        </select>
      </label>
      <p className="jurisdiction-notice">
        Research context only. It has not been legally reviewed and does not change enforceability.
      </p>

      <fieldset className="token-choice">
        <legend>Deposit test token</legend>
        <label title="Plain freely mintable test token. Its displayed value does not grow.">
          <input type="radio" name="deposit-token" checked={tokenChoice === "plain"} onChange={() => setTokenChoice("plain")} />
          <span><strong>testUSDC</strong><small>Plain test token · stable demo value</small></span>
        </label>
        <label title="Freely mintable test shares whose displayed testUSDC value grows 20% per day.">
          <input type="radio" name="deposit-token" checked={tokenChoice === "yield"} onChange={() => setTokenChoice("yield")} />
          <span><strong>ytUSDC ⓘ</strong><small>Yield-test shares · 20%/day accelerated demo</small></span>
        </label>
      </fieldset>
      <label>
        Deposit amount ({tokenChoice === "yield" ? "ytUSDC shares" : "testUSDC"})
        <input
          value={deposit}
          onChange={(event) => {
            setDeposit(event.target.value);
            clearFieldIssue("deposit");
          }}
          type="number"
          min="0"
          step="0.000001"
          data-proposal-field="deposit"
          aria-invalid={invalidField === "deposit"}
        />
      </label>
      <label>
        Expected lease expiration / claim window start
        <input
          value={claimWindowStart}
          onChange={(event) => {
            setClaimWindowStart(event.target.value);
            clearFieldIssue("claimWindowStart");
          }}
          type="datetime-local"
          data-proposal-field="claimWindowStart"
          aria-invalid={invalidField === "claimWindowStart" || claimWindowHasPassed}
        />
      </label>
      <p className="field-help">The claim window opens when the lease is expected to expire.</p>
      {claimWindowHasPassed && (
        <p className="field-validation-error" role="alert">
          This saved date has passed. Select a future lease-expiration date before publishing a
          revision or finalizing onchain.
        </p>
      )}
      <label>
        Claim period (days the landlord has to submit a claim)
        <input
          value={claimDays}
          onChange={(event) => {
            setClaimDays(event.target.value);
            clearFieldIssue("claimDays");
          }}
          type="number"
          min="1"
          data-proposal-field="claimDays"
          aria-invalid={invalidField === "claimDays"}
        />
      </label>
      <label>
        Response period (days the tenant has to respond)
        <input
          value={responseDays}
          onChange={(event) => {
            setResponseDays(event.target.value);
            clearFieldIssue("responseDays");
          }}
          type="number"
          min="1"
          data-proposal-field="responseDays"
          aria-invalid={invalidField === "responseDays"}
        />
      </label>
      <label>
        Arbiter ruling period (days the optional arbiter has to rule)
        <input
          value={arbiterDays}
          onChange={(event) => {
            setArbiterDays(event.target.value);
            clearFieldIssue("arbiterDays");
          }}
          type="number"
          min="1"
          data-proposal-field="arbiterDays"
          aria-invalid={invalidField === "arbiterDays"}
        />
      </label>

      {draft && draft.status !== "finalized" ? (
        <section className="revision-publisher" aria-labelledby="revision-publisher-title">
          <h3 id="revision-publisher-title">Publish a new revision</h3>
          <p className="hint">
            Update the terms above, then describe the change. Publishing creates a new timestamped
            revision and requires fresh approval from every invited reviewer.
          </p>
          {draft.status === "ready" && (
            <div className="revision-impact">
              <strong>The current revision is already approved.</strong>
              <span>
                Publishing changes will cancel its ready-to-finalize status and reset the recorded
                tenant{draft.arbiterEmail ? " and arbiter approvals" : " approval"}.
              </span>
            </div>
          )}
          <label>
            Revision note (required)
            <textarea
              value={revisionSummary}
              onChange={(event) => {
                setRevisionSummary(event.target.value);
                clearFieldIssue("revisionSummary");
              }}
              placeholder="For example: Extended the response period from 7 to 10 days."
              rows={3}
              minLength={8}
              data-proposal-field="revisionSummary"
              aria-invalid={invalidField === "revisionSummary"}
            />
          </label>
          <p className="field-help">At least 8 characters. This note becomes part of the running record.</p>
          <div className="button-row">
            <button
              className="btn btn-primary"
              type="button"
              disabled={isSavingDraft}
              onClick={() => void saveDraft()}
            >
              {isSavingDraft ? "Publishing revision..." : "Publish revised proposal"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={startAnotherProposal}>
              Start another proposal
            </button>
          </div>
        </section>
      ) : !draft ? (
        <div className="button-row">
          <button
            className="btn btn-primary"
            type="button"
            disabled={isSavingDraft}
            onClick={() => void saveDraft()}
          >
            {isSavingDraft ? "Saving proposal..." : "Save proposal for review"}
          </button>
        </div>
      ) : (
        <div className="button-row">
          <button className="btn btn-ghost" type="button" onClick={startAnotherProposal}>
            Start another proposal
          </button>
        </div>
      )}
      <div
        className="proposal-form-feedback"
        id="proposal-form-feedback"
        aria-live="assertive"
        tabIndex={-1}
      >
        {formMessage && <p className="tx-success">{formMessage}</p>}
        {formError && <p className="tx-error">{formError}</p>}
      </div>

      {!draft && (
        <div className="invite-gate">
          <strong>Invitations unlock after the proposal is saved.</strong>
          <span>The tenant and optional arbiter will receive this exact revision for review.</span>
        </div>
      )}

      {draft && (
        <section className="proposal-review-controls">
          <div className="record-header">
            <div>
              <h3>Invite parties to review revision {draft.revision}</h3>
              <p className="hint">Each link is role-locked and opens this saved proposal—not the landlord’s creation tools.</p>
            </div>
            {landlordAccess && (
              <a className="btn btn-ghost small" href={negotiationReportUrl(landlordAccess)} target="_blank" rel="noreferrer">
                Open timestamped report
              </a>
            )}
          </div>
          <div className="invite-actions">
            <button className="btn btn-secondary" type="button" onClick={() => openInvite("tenant")}>Open tenant invite in Gmail</button>
            <button className="btn btn-secondary" type="button" onClick={() => void copyInvite("tenant")}>
              {copiedInvite === "tenant" ? "Tenant invite copied" : "Copy tenant invite"}
            </button>
            {draft.arbiterEmail && (
              <>
                <button className="btn btn-secondary" type="button" onClick={() => openInvite("arbiter")}>Open arbiter invite in Gmail</button>
                <button className="btn btn-secondary" type="button" onClick={() => void copyInvite("arbiter")}>
                  {copiedInvite === "arbiter" ? "Arbiter invite copied" : "Copy arbiter invite"}
                </button>
              </>
            )}
          </div>

          <div className="approval-grid">
            <div className={draft.tenantApproved ? "approval approved" : "approval"}>
              <strong>Tenant</strong><span>{draft.tenantApproved ? "Approved current revision" : "Awaiting approval"}</span>
            </div>
            {draft.arbiterEmail && (
              <div className={draft.arbiterApproved ? "approval approved" : "approval"}>
                <strong>Arbiter</strong><span>{draft.arbiterApproved ? "Approved current revision" : "Awaiting approval"}</span>
              </div>
            )}
          </div>

          <div className="record-header">
            <div><h3>Running agreement record</h3><p className="hint">All proposal actions are timestamped and append-only.</p></div>
            {landlordAccess && (
              <button className="btn btn-ghost small" type="button" onClick={() => void loadNegotiation(landlordAccess).then(setDraft)}>
                Refresh
              </button>
            )}
          </div>
          <ol className="activity-timeline">
            {draft.events.map((event) => (
              <li key={event.id}>
                <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time>
                <strong>{event.actorRole}</strong>
                <span>{event.summary}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {draft?.status === "ready" && (
        <section className="onchain-ready">
          <span className="eyebrow">All required approvals recorded</span>
          <h3>Ready for onchain finalization</h3>
          <p>
            The approved tenant wallet{draft.arbiterEmail ? " and arbiter wallet are" : " is"} mapped
            automatically from the approval actions. This transaction creates the testnet agreement.
          </p>
          <button className="btn btn-primary" type="button" disabled={!isConnected || isPending || isMining} onClick={finalizeOnchain}>
            {isPending ? "Confirm in wallet..." : isMining ? "Mining..." : "Finalize approved agreement onchain"}
          </button>
        </section>
      )}

      {draft && draft.status === "draft" && (
        <p className="role-pending">Onchain finalization stays locked until the tenant and optional arbiter approve the current revision.</p>
      )}
      {draft?.status === "finalized" && (
        <>
          <p className="tx-success">This proposal is finalized as onchain agreement #{draft.onchainAgreementId}.</p>
          {draft.onchainAgreementId && landlordAccess && (
            <div className="finalized-agreement-workspace">
              <AgreementCard id={BigInt(draft.onchainAgreementId)} negotiationAccess={landlordAccess} />
            </div>
          )}
        </>
      )}
      {error && <p className="tx-error">{error.message.split("\n")[0]}</p>}
      {createdId !== null && <p className="tx-success">Created and recorded onchain agreement #{createdId.toString()}.</p>}
    </section>
  );
}

function PrivyCreateAgreementForm({
  initialAccess,
}: {
  initialAccess?: NegotiationAccess | null;
}) {
  const { user } = usePrivy();
  const landlordEmail = user?.google?.email ?? user?.email?.address ?? "";
  return <AgreementForm landlordEmail={landlordEmail} initialAccess={initialAccess} />;
}

export function CreateAgreementForm({
  initialAccess,
}: {
  initialAccess?: NegotiationAccess | null;
}) {
  return ACCOUNT_AUTH_ENABLED ? (
    <PrivyCreateAgreementForm initialAccess={initialAccess} />
  ) : (
    <AgreementForm landlordEmail="" initialAccess={initialAccess} />
  );
}
