import { useCallback, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { ACCOUNT_AUTH_ENABLED } from "../lib/accountConfig";
import { jurisdictionLabel, type JurisdictionCode } from "../lib/jurisdictions";
import {
  loadNegotiation,
  negotiationAction,
  negotiationReportUrl,
  type NegotiationAccess,
  type NegotiationRecord,
} from "../lib/negotiations";
import { roleLabel } from "../lib/inviteContext";
import { AgreementCard } from "./AgreementCard";

function approvalLabel(record: NegotiationRecord, role: "tenant" | "arbiter") {
  const approved = role === "tenant" ? record.tenantApproved : record.arbiterApproved;
  return approved ? `Approved revision ${record.revision}` : `Awaiting ${role} approval`;
}

function Terms({ record }: { record: NegotiationRecord }) {
  const { terms } = record;
  return (
    <dl className="negotiation-terms">
      <div><dt>Deposit</dt><dd>{terms.deposit} {terms.tokenChoice === "yield" ? "ytUSDC" : "testUSDC"}</dd></div>
      <div><dt>Lease expiration</dt><dd>{new Date(terms.claimWindowStart).toLocaleString()}</dd></div>
      <div><dt>Claim period</dt><dd>{terms.claimDays} days</dd></div>
      <div><dt>Tenant response</dt><dd>{terms.responseDays} days</dd></div>
      <div><dt>Arbiter ruling</dt><dd>{terms.arbiterDays} days</dd></div>
      <div><dt>Jurisdiction context</dt><dd>{jurisdictionLabel(terms.jurisdiction as JurisdictionCode)}</dd></div>
    </dl>
  );
}

function AgreementNegotiationView({
  access,
  currentEmail,
  enforceInvitedEmail,
  onUseInvitedAccount,
}: {
  access: NegotiationAccess;
  currentEmail?: string | null;
  enforceInvitedEmail: boolean;
  onUseInvitedAccount?: () => void;
}) {
  const { address, isConnected } = useAccount();
  const [record, setRecord] = useState<NegotiationRecord | null>(null);
  const [changeSummary, setChangeSummary] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRecord(await loadNegotiation(access));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load this proposal.");
    }
  }, [access]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  async function act(
    action:
      | { type: "approve"; wallet: string }
      | { type: "propose_change"; summary: string },
    success: string,
  ) {
    setIsWorking(true);
    setMessage(null);
    setError(null);
    try {
      setRecord(await negotiationAction(access, action));
      setMessage(success);
      if (action.type === "propose_change") setChangeSummary("");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "The record could not be updated.");
    } finally {
      setIsWorking(false);
    }
  }

  if (!record) {
    return (
      <section className="card negotiation-workspace">
        <h2>Agreement proposal</h2>
        <p>{error || "Loading the landlord's proposal..."}</p>
      </section>
    );
  }

  const invitedEmail =
    access.role === "tenant"
      ? record.tenantEmail
      : access.role === "arbiter"
        ? record.arbiterEmail
        : record.landlordEmail;
  const invitedEmailMatches =
    !enforceInvitedEmail ||
    Boolean(
      currentEmail &&
        invitedEmail &&
        currentEmail.trim().toLowerCase() === invitedEmail.trim().toLowerCase(),
    );
  const canRespond =
    (access.role === "tenant" || access.role === "arbiter") && invitedEmailMatches;
  const alreadyApproved =
    access.role === "tenant"
      ? record.tenantApproved
      : access.role === "arbiter"
        ? record.arbiterApproved
        : false;

  return (
    <section className="card negotiation-workspace" aria-labelledby="proposal-review-title">
      <div className="negotiation-heading">
        <div>
          <span className="eyebrow">Proposal {record.id} · revision {record.revision}</span>
          <h2 id="proposal-review-title">Review the landlord’s agreement</h2>
        </div>
        <span className={`negotiation-status status-${record.status}`}>
          {record.status === "draft" ? "Under review" : record.status === "ready" ? "Approved" : "Onchain"}
        </span>
      </div>
      <p className="hint">
        You are acting as the {roleLabel[access.role].toLowerCase()}. You cannot create a separate
        agreement from this invitation. Review these terms, request a change, or approve the
        current revision.
      </p>
      {!invitedEmailMatches && (
        <div className="role-mismatch" role="alert">
          <div>
            <strong>
              {currentEmail
                ? "This invitation belongs to a different Google account."
                : `Sign in with the invited ${access.role} account.`}
            </strong>
            <p>
              This {access.role} invitation was sent to <strong>{invitedEmail}</strong>
              {currentEmail ? `, but you are signed in as ${currentEmail}.` : "."} Review and
              approval controls stay locked until the invited account is used.
            </p>
          </div>
          {currentEmail && onUseInvitedAccount && (
            <button className="btn btn-ghost" type="button" onClick={onUseInvitedAccount}>
              Sign out and use invited account
            </button>
          )}
        </div>
      )}

      <div className="participant-grid">
        <div><span>Landlord</span><strong>{record.landlordEmail}</strong></div>
        <div><span>Tenant</span><strong>{record.tenantEmail}</strong></div>
        <div><span>Arbiter</span><strong>{record.arbiterEmail || "Not appointed"}</strong></div>
      </div>
      <Terms record={record} />

      <div className="approval-grid">
        <div className={record.tenantApproved ? "approval approved" : "approval"}>
          <strong>Tenant</strong>
          <span>{approvalLabel(record, "tenant")}</span>
        </div>
        {record.arbiterEmail && (
          <div className={record.arbiterApproved ? "approval approved" : "approval"}>
            <strong>Arbiter</strong>
            <span>{approvalLabel(record, "arbiter")}</span>
          </div>
        )}
      </div>

      {canRespond && record.status !== "finalized" && (
        <div className="negotiation-response">
          <h3>Respond to revision {record.revision}</h3>
          <label>
            Proposed change
            <textarea
              value={changeSummary}
              onChange={(event) => setChangeSummary(event.target.value)}
              placeholder="Describe exactly what you want the landlord to change and why."
              rows={4}
            />
          </label>
          <div className="button-row">
            <button
              className="btn btn-secondary"
              disabled={isWorking || changeSummary.trim().length < 8}
              onClick={() =>
                void act(
                  { type: "propose_change", summary: changeSummary.trim() },
                  "Your proposed change was added to the record.",
                )
              }
            >
              Propose this change
            </button>
            <button
              className="btn btn-primary"
              disabled={isWorking || alreadyApproved || !isConnected || !address}
              onClick={() =>
                address &&
                void act(
                  { type: "approve", wallet: address },
                  `Revision ${record.revision} approved and your wallet was recorded.`,
                )
              }
            >
              {alreadyApproved ? "Current revision approved" : "Approve current revision"}
            </button>
          </div>
          {!isConnected && <p className="field-help">Connect your account wallet before approving.</p>}
        </div>
      )}

      <div className="record-header">
        <div>
          <h3>Running agreement record</h3>
          <p className="hint">Append-only actions with server timestamps, ready for future onchain anchoring.</p>
        </div>
        <a
          className="btn btn-ghost small"
          href={negotiationReportUrl(access)}
          target="_blank"
          rel="noreferrer"
        >
          Open timestamped report
        </a>
      </div>
      <ol className="activity-timeline">
        {record.events.map((event) => (
          <li key={event.id}>
            <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time>
            <strong>{roleLabel[event.actorRole as keyof typeof roleLabel] || "System"}</strong>
            <span>{event.summary}</span>
          </li>
        ))}
      </ol>
      {message && <p className="tx-success">{message}</p>}
      {error && <p className="tx-error">{error}</p>}
      {record.status === "finalized" && record.onchainAgreementId && (
        <div className="finalized-agreement-workspace">
          <span className="eyebrow">Live deduction and resolution workflow</span>
          <AgreementCard
            id={BigInt(record.onchainAgreementId)}
            negotiationAccess={access}
          />
        </div>
      )}
    </section>
  );
}

function PrivyAgreementNegotiation({ access }: { access: NegotiationAccess }) {
  const { authenticated, user, logout } = usePrivy();
  const currentEmail = user?.google?.email ?? user?.email?.address ?? null;
  return (
    <AgreementNegotiationView
      access={access}
      currentEmail={authenticated ? currentEmail : null}
      enforceInvitedEmail
      onUseInvitedAccount={() => void logout()}
    />
  );
}

export function AgreementNegotiation({ access }: { access: NegotiationAccess }) {
  return ACCOUNT_AUTH_ENABLED ? (
    <PrivyAgreementNegotiation access={access} />
  ) : (
    <AgreementNegotiationView access={access} enforceInvitedEmail={false} />
  );
}
