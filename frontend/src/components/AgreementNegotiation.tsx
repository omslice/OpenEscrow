import { useCallback, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { ACCOUNT_AUTH_ENABLED } from "../lib/accountConfig";
import {
  CALIFORNIA_POLICY,
  evaluateSnapshotCompliance,
  jurisdictionLabel,
  jurisdictionProfile,
  type JurisdictionCode,
} from "../lib/jurisdictions";
import {
  loadNegotiation,
  negotiationAction,
  type NegotiationAccess,
  type NegotiationRecord,
} from "../lib/negotiations";
import { agreementReference, proposalReference } from "../lib/displayIds";
import { roleLabel } from "../lib/inviteContext";
import { useVisiblePolling } from "../lib/visiblePolling";
import { getDepositAssetForTerms } from "../../shared/deposit-assets.js";
import {
  dynamicComplianceFactsForProfile,
} from "../../shared/us-compliance-facts.js";

function approvalLabel(record: NegotiationRecord, role: "tenant" | "arbiter") {
  const approved = role === "tenant" ? record.tenantApproved : record.arbiterApproved;
  return approved ? `Approved revision ${record.revision}` : `Awaiting ${role} approval`;
}

function Terms({ record }: { record: NegotiationRecord }) {
  const { terms } = record;
  const depositAsset = getDepositAssetForTerms(terms);
  const assetSnapshot = terms.depositAssetSnapshot;
  const isLegacyCalifornia =
    terms.jurisdiction === CALIFORNIA_POLICY.jurisdiction &&
    terms.policyVersion === CALIFORNIA_POLICY.version;
  const researchProfile = jurisdictionProfile(terms.jurisdiction);
  const complianceSnapshot = terms.complianceSnapshot;
  return (
    <dl className="negotiation-terms">
      <div><dt>Rental property</dt><dd>{terms.propertyAddress || "Legacy proposal: not recorded"}</dd></div>
      {terms.addressResolution && (
        <div>
          <dt>Validated location</dt>
          <dd>
            {terms.addressResolution.city || "Unincorporated locality"}
            {terms.addressResolution.county ? `, ${terms.addressResolution.county}` : ""},{" "}
            {terms.addressResolution.stateCode}
            {terms.addressResolution.postalCode
              ? ` ${terms.addressResolution.postalCode}`
              : ""}
          </dd>
        </div>
      )}
      <div>
        <dt>Deposit</dt>
        <dd>
          {terms.deposit} {assetSnapshot?.testnetSymbol || depositAsset?.testnetSymbol || "testUSDC"}
          {assetSnapshot ? ` · ${assetSnapshot.displayName}` : ""}
        </dd>
      </div>
      {assetSnapshot && (
        <div>
          <dt>Deposit asset terms</dt>
          <dd>
            <strong>
              {assetSnapshot.yieldType === "none"
                ? "No yield"
                : `${assetSnapshot.yieldSource} · ${assetSnapshot.yieldVariability} yield`}
            </strong>
            <span>Settlement asset: {assetSnapshot.settlementAsset}</span>
            <details>
              <summary>Eligibility, risk, and accepted disclosures</summary>
              <p>{assetSnapshot.eligibility}</p>
              <p>{assetSnapshot.mainRisk}</p>
              <p>{assetSnapshot.liquidityRisk}</p>
              <ul>
                {assetSnapshot.disclosures.map((disclosure) => (
                  <li key={disclosure}>{disclosure}</li>
                ))}
              </ul>
              <small>
                Catalog {assetSnapshot.catalogVersion} · {assetSnapshot.implementationStatus}
              </small>
            </details>
          </dd>
        </div>
      )}
      {(isLegacyCalifornia || researchProfile) && <div><dt>Monthly rent used for cap</dt><dd>{terms.monthlyRent || "Legacy proposal: not recorded"}</dd></div>}
      <div>
        <dt>Testnet operations reserve</dt>
        <dd>
          $5 {assetSnapshot?.testnetSymbol || depositAsset?.testnetSymbol || "testUSDC"} total ·
          split evenly between tenants · not refundable principal
        </dd>
      </div>
      <div><dt>Expected possession returned</dt><dd>{new Date(terms.claimWindowStart).toLocaleString()}</dd></div>
      <div><dt>{isLegacyCalifornia ? "California accounting/refund period" : researchProfile ? "Statewide onchain safeguard window" : "Test deduction window"}</dt><dd>{terms.claimDays} calendar days · {isLegacyCalifornia || researchProfile ? "profile default" : "agreed test value"}</dd></div>
      <div><dt>Tenant response</dt><dd>{terms.responseDays} days · {isLegacyCalifornia || researchProfile ? "OpenEscrow test rule" : "agreed test value"}</dd></div>
      {record.arbiterEmail && (
        <div><dt>Arbiter ruling</dt><dd>{terms.arbiterDays} days · {isLegacyCalifornia || researchProfile ? "OpenEscrow test rule" : "agreed test value"}</dd></div>
      )}
      <div><dt>Jurisdiction</dt><dd>{jurisdictionLabel(terms.jurisdiction as JurisdictionCode)}</dd></div>
      <div><dt>Policy profile</dt><dd>{terms.policyVersion || "Legacy proposal"}</dd></div>
      {isLegacyCalifornia && (
      <div>
        <dt>California deposit-cap facts</dt>
        <dd>
          {terms.smallLandlordException ? "Qualifying small-landlord exception asserted" : "Standard one-month cap"}
          {terms.tenantIsServiceMember ? " · tenant is a service member" : ""}
        </dd>
      </div>
      )}
      <div><dt>Electronic record and return consent</dt><dd>{terms.electronicDeliveryConsent ? "Included in this approval" : "Not recorded"}</dd></div>
      {(complianceSnapshot || researchProfile) && (
        <div>
          <dt>Compliance requirements</dt>
          <dd>
            <details>
              <summary>
                {(complianceSnapshot?.deadlines || researchProfile?.deadlines || []).length}{" "}
                deadline path
                {(complianceSnapshot?.deadlines || researchProfile?.deadlines || []).length === 1
                  ? ""
                  : "s"}{" "}
                and{" "}
                {(complianceSnapshot?.requirements || researchProfile?.requirements || []).length}{" "}
                recorded requirements
              </summary>
              <ul>
                {(complianceSnapshot?.requirements || researchProfile?.requirements || []).map(
                  (requirement) => (
                  <li key={requirement}>{requirement}</li>
                  ),
                )}
              </ul>
              {complianceSnapshot?.overlays.map((overlay) => (
                <section key={overlay.id}>
                  <strong>
                    {overlay.label} ·{" "}
                    {overlay.applicability === "applies"
                      ? "applied"
                      : "needs a property or program fact"}
                  </strong>
                  <ul>
                    {overlay.requirements.map((requirement) => (
                      <li key={requirement}>{requirement}</li>
                    ))}
                  </ul>
                  {overlay.privacyNote && <small>{overlay.privacyNote}</small>}
                </section>
              ))}
              <small>
                {(complianceSnapshot?.unresolvedOverlays || [
                  "Local, federal, housing-program, and fact-specific overlays still require resolution.",
                ]).join(" ")}{" "}
                Software output is not legal advice.
              </small>
            </details>
          </dd>
        </div>
      )}
    </dl>
  );
}

function AgreementNegotiationView({
  access,
  currentName,
  currentEmail,
  enforceInvitedEmail,
  onUseInvitedAccount,
}: {
  access: NegotiationAccess;
  currentName?: string | null;
  currentEmail?: string | null;
  enforceInvitedEmail: boolean;
  onUseInvitedAccount?: () => void;
}) {
  const { address, isConnected } = useAccount();
  const [record, setRecord] = useState<NegotiationRecord | null>(null);
  const [changeSummary, setChangeSummary] = useState("");
  const [complianceEventName, setComplianceEventName] = useState("");
  const [complianceEventOccurredAt, setComplianceEventOccurredAt] = useState("");
  const [complianceEventNote, setComplianceEventNote] = useState("");
  const [complianceFactName, setComplianceFactName] = useState("");
  const [complianceFactValue, setComplianceFactValue] = useState("");
  const [complianceFactNote, setComplianceFactNote] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assetConsent, setAssetConsent] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setRecord(await loadNegotiation(access));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load this proposal.");
    }
  }, [access]);

  useVisiblePolling(refresh, 10_000);

  useEffect(() => {
    setAssetConsent(false);
  }, [record?.id, record?.revision]);

  async function act(
    action:
      | { type: "approve"; wallet: string; name?: string; assetConsent?: boolean }
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

  async function proposeComplianceEvent() {
    if (!complianceEventName || !complianceEventOccurredAt) return;
    setIsWorking(true);
    setMessage(null);
    setError(null);
    try {
      setRecord(
        await negotiationAction(access, {
          type: "propose_compliance_event",
          eventName: complianceEventName,
          occurredAt: new Date(complianceEventOccurredAt).toISOString(),
          note: complianceEventNote.trim() || undefined,
        }),
      );
      setComplianceEventOccurredAt("");
      setComplianceEventNote("");
      setMessage("The lifecycle event is recorded and awaiting confirmation by the other party.");
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "The lifecycle event could not be recorded.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function confirmComplianceEvent(proposalEventId: number) {
    setIsWorking(true);
    setMessage(null);
    setError(null);
    try {
      setRecord(
        await negotiationAction(access, {
          type: "confirm_compliance_event",
          proposalEventId,
        }),
      );
      setMessage("The lifecycle event is confirmed and its compliance deadlines are active.");
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "The lifecycle event could not be confirmed.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function proposeComplianceFact() {
    if (
      !complianceFactName ||
      (complianceFactValue !== "true" && complianceFactValue !== "false")
    ) {
      return;
    }
    setIsWorking(true);
    setMessage(null);
    setError(null);
    try {
      setRecord(
        await negotiationAction(access, {
          type: "propose_compliance_fact",
          factName: complianceFactName,
          value: complianceFactValue === "true",
          note: complianceFactNote.trim() || undefined,
        }),
      );
      setComplianceFactName("");
      setComplianceFactValue("");
      setComplianceFactNote("");
      setMessage(
        "The conditional fact is recorded and awaiting confirmation by the other party.",
      );
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "The conditional fact could not be recorded.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function confirmComplianceFact(proposalEventId: number) {
    setIsWorking(true);
    setMessage(null);
    setError(null);
    try {
      setRecord(
        await negotiationAction(access, {
          type: "confirm_compliance_fact",
          proposalEventId,
        }),
      );
      setMessage(
        "The conditional fact is confirmed and its deadline branch is active.",
      );
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "The conditional fact could not be confirmed.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function rejectComplianceFact(proposalEventId: number) {
    setIsWorking(true);
    setMessage(null);
    setError(null);
    try {
      setRecord(
        await negotiationAction(access, {
          type: "reject_compliance_fact",
          proposalEventId,
        }),
      );
      setMessage(
        "The conditional fact was not confirmed. Either party may record a corrected proposal.",
      );
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "The conditional fact response could not be recorded.",
      );
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
      ? record.viewerEmail || record.tenantEmail
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
  const viewingTenant =
    access.role === "tenant"
      ? record.tenants.find((tenant) => tenant.id === record.viewerTenantId) ||
        record.tenants.find(
          (tenant) =>
            tenant.email.trim().toLowerCase() === invitedEmail?.trim().toLowerCase(),
        )
      : null;
  const alreadyApproved =
    access.role === "tenant"
      ? Boolean(viewingTenant?.approved)
      : access.role === "arbiter"
        ? record.arbiterApproved
        : false;
  const reviewAsset = getDepositAssetForTerms(record.terms);
  const requiresAssetConsent = Boolean(
    record.terms.depositAssetId && reviewAsset?.consentRequired,
  );
  const complianceSnapshot = record.terms.complianceSnapshot;
  const activeComplianceProfile = jurisdictionProfile(record.terms.jurisdiction);
  const dynamicFactOptions = dynamicComplianceFactsForProfile(
    complianceSnapshot || activeComplianceProfile,
  );
  const eventOptions = [
    ...(complianceSnapshot?.deadlines || []),
    ...(complianceSnapshot?.overlays || []).flatMap((overlay) => overlay.deadlines),
  ].filter(
    (deadline, index, deadlines) =>
      deadlines.findIndex((candidate) => candidate.trigger === deadline.trigger) === index,
  );
  const confirmedProposalIds = new Set(
    record.events
      .filter((event) => event.action === "compliance_event_confirmed")
      .map((event) => Number(event.metadata?.proposalEventId)),
  );
  const pendingComplianceEvents = record.events.filter(
    (event) =>
      event.action === "compliance_event_proposed" &&
      !confirmedProposalIds.has(event.id),
  );
  const confirmedEventValues = Object.fromEntries(
    record.events
      .filter((event) => event.action === "compliance_event_confirmed")
      .map((event) => [
        String(event.metadata?.eventName || ""),
        String(event.metadata?.occurredAt || ""),
      ]),
  );
  const resolvedFactProposalIds = new Set(
    record.events
      .filter(
        (event) =>
          event.action === "compliance_fact_confirmed" ||
          event.action === "compliance_fact_rejected",
      )
      .map((event) => Number(event.metadata?.proposalEventId)),
  );
  const pendingComplianceFacts = record.events.filter(
    (event) =>
      event.action === "compliance_fact_proposed" &&
      !resolvedFactProposalIds.has(event.id),
  );
  const confirmedFactValues = Object.fromEntries(
    record.events
      .filter(
        (event) =>
          event.action === "compliance_fact_confirmed" &&
          typeof event.metadata?.value === "boolean",
      )
      .map((event) => [
        String(event.metadata?.factName || ""),
        event.metadata?.value,
      ]),
  );
  const unresolvedDynamicFactOptions = dynamicFactOptions.filter(
    (definition) =>
      typeof confirmedFactValues[definition.key] !== "boolean" &&
      !pendingComplianceFacts.some(
        (event) => event.metadata?.factName === definition.key,
      ),
  );
  const complianceEvaluation =
    complianceSnapshot
      ? evaluateSnapshotCompliance(complianceSnapshot, {
          facts: {
            ...(record.terms.complianceFacts || {}),
            ...confirmedFactValues,
            monthlyRent: record.terms.monthlyRent || null,
            deposit: record.terms.deposit,
          },
          events: confirmedEventValues,
        })
      : null;

  return (
    <section className="card negotiation-workspace" aria-labelledby="proposal-review-title">
      <div className="negotiation-heading">
        <div>
          <span className="eyebrow">
            {proposalReference(record.id)} · revision {record.revision}
          </span>
          <h2 id="proposal-review-title">Review the landlord’s agreement</h2>
        </div>
        <span className={`negotiation-status status-${record.status}`}>
          {record.status === "draft"
            ? "Under review"
            : record.status === "ready"
              ? "Approved"
              : record.status === "finalized"
                ? "Onchain"
                : "Cancelled"}
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
        <div>
          <span>Landlord</span>
          <strong>{record.landlordName || record.landlordEmail}</strong>
          {record.landlordName && <small>{record.landlordEmail}</small>}
        </div>
        {record.tenants.map((tenant) => (
          <div
            className={tenant.approved ? "participant-approved" : "participant-awaiting"}
            key={tenant.id}
          >
            <span>
              Tenant · {(tenant.depositShareBps / 100).toFixed(2).replace(/\.?0+$/, "")}% share
            </span>
            <strong>{tenant.name || tenant.email}</strong>
            {tenant.name && <small>{tenant.email}</small>}
            <small className="party-review-status">
              {tenant.approved
                ? `Approved revision ${record.revision}`
                : "Awaiting approval"}
            </small>
          </div>
        ))}
        {record.arbiterEmail && (
          <div
            className={
              record.arbiterApproved ? "participant-approved" : "participant-awaiting"
            }
          >
            <span>Arbiter</span>
            <strong>{record.arbiterName || record.arbiterEmail}</strong>
            {record.arbiterName && <small>{record.arbiterEmail}</small>}
            <small className="party-review-status">
              {approvalLabel(record, "arbiter")}
            </small>
          </div>
        )}
      </div>
      <Terms record={record} />

      {record.status === "finalized" &&
        complianceSnapshot &&
        (access.role === "landlord" || access.role === "tenant") &&
        invitedEmailMatches && (
          <section className="negotiation-response">
            <h3>Confirmed compliance timeline</h3>
            <p className="field-help">
              A landlord or tenant proposes the actual event time; the other side confirms it
              before OpenEscrow activates the offchain compliance deadlines. This does not alter
              the already-deployed smart contract timer.
            </p>
            <label>
              Lifecycle event
              <select
                value={complianceEventName}
                onChange={(event) => setComplianceEventName(event.target.value)}
              >
                <option value="">Choose an event</option>
                {eventOptions.map((deadline) => (
                  <option key={deadline.trigger} value={deadline.trigger}>
                    {deadline.triggerDescription}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Actual date and time
              <input
                type="datetime-local"
                value={complianceEventOccurredAt}
                onChange={(event) => setComplianceEventOccurredAt(event.target.value)}
              />
            </label>
            <label>
              Non-sensitive note
              <textarea
                rows={2}
                value={complianceEventNote}
                onChange={(event) => setComplianceEventNote(event.target.value)}
                placeholder="Record delivery or possession context; do not enter protected or medical details."
              />
            </label>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={
                isWorking || !complianceEventName || !complianceEventOccurredAt
              }
              onClick={() => void proposeComplianceEvent()}
            >
              Propose actual event time
            </button>
            {pendingComplianceEvents.map((event) => (
              <div className="role-mismatch" key={event.id}>
                <p>
                  <strong>{String(event.metadata?.eventName)}</strong>{" "}
                  {new Date(String(event.metadata?.occurredAt)).toLocaleString()} · proposed by{" "}
                  {event.actorRole}
                </p>
                {event.actorRole !== access.role && (
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={isWorking}
                    onClick={() => void confirmComplianceEvent(event.id)}
                  >
                    Confirm event
                  </button>
                )}
              </div>
            ))}
            {dynamicFactOptions.length > 0 && (
              <section>
                <h4>Resolve a conditional deadline branch</h4>
                <p className="field-help">
                  Some state deadlines depend on a fact that the property address
                  cannot establish. One agreement party records a yes/no fact and
                  the other confirms it before OpenEscrow uses that branch.
                </p>
                {unresolvedDynamicFactOptions.length > 0 && (
                  <>
                    <label>
                      Conditional fact
                      <select
                        value={complianceFactName}
                        onChange={(event) => {
                          setComplianceFactName(event.target.value);
                          setComplianceFactValue("");
                        }}
                      >
                        <option value="">Choose a fact</option>
                        {unresolvedDynamicFactOptions.map((definition) => (
                          <option key={definition.key} value={definition.key}>
                            {definition.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {complianceFactName && (
                      <>
                        <p className="field-help">
                          {
                            dynamicFactOptions.find(
                              (definition) =>
                                definition.key === complianceFactName,
                            )?.question
                          }
                        </p>
                        <label>
                          Answer
                          <select
                            value={complianceFactValue}
                            onChange={(event) =>
                              setComplianceFactValue(event.target.value)
                            }
                          >
                            <option value="">Choose yes or no</option>
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select>
                        </label>
                        <label>
                          Non-sensitive note
                          <textarea
                            rows={2}
                            value={complianceFactNote}
                            onChange={(event) =>
                              setComplianceFactNote(event.target.value)
                            }
                            placeholder="Reference the private record or delivery step; do not enter protected details."
                          />
                        </label>
                        <p className="field-help">
                          {
                            dynamicFactOptions.find(
                              (definition) =>
                                definition.key === complianceFactName,
                            )?.guidance
                          }
                        </p>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          disabled={!complianceFactValue || isWorking}
                          onClick={() => void proposeComplianceFact()}
                        >
                          Propose conditional fact
                        </button>
                      </>
                    )}
                  </>
                )}
                {pendingComplianceFacts.map((event) => (
                  <div className="role-mismatch" key={event.id}>
                    <p>
                      <strong>{String(event.metadata?.label)}</strong>:{" "}
                      {event.metadata?.value === true ? "Yes" : "No"} · proposed
                      by {event.actorRole}
                    </p>
                    {event.actorRole !== access.role && (
                      <div className="button-row">
                        <button
                          className="btn btn-primary"
                          type="button"
                          disabled={isWorking}
                          onClick={() => void confirmComplianceFact(event.id)}
                        >
                          Confirm fact
                        </button>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          disabled={isWorking}
                          onClick={() => void rejectComplianceFact(event.id)}
                        >
                          Not correct
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {Object.entries(confirmedFactValues).map(
                  ([factName, value]) => {
                    const definition = dynamicFactOptions.find(
                      (candidate) => candidate.key === factName,
                    );
                    return definition ? (
                      <p className="field-help" key={factName}>
                        Confirmed: <strong>{definition.label}</strong> —{" "}
                        {value === true ? "Yes" : "No"}
                      </p>
                    ) : null;
                  },
                )}
              </section>
            )}
            {complianceEvaluation && (
              <ul>
                {[
                  ...complianceEvaluation.deadlines.filter(
                    (deadline: { comparison: string | null }) =>
                      !deadline.comparison,
                  ),
                  ...(complianceEvaluation.combinedDeadlines || []),
                  ...complianceEvaluation.overlays.flatMap(
                    (overlay: { deadlines: Array<Record<string, unknown>> }) =>
                      overlay.deadlines,
                  ),
                ]
                  .filter(
                    (deadline: { status: string }) =>
                      deadline.status === "scheduled" ||
                      deadline.status === "waiting-for-event",
                  )
                  .map(
                    (deadline: {
                      id: string;
                      label: string;
                      status: string;
                      dueAt: string | null;
                    }) => (
                      <li key={deadline.id}>
                        {deadline.label}:{" "}
                        {deadline.dueAt
                          ? new Date(deadline.dueAt).toLocaleString()
                          : "waiting for a confirmed event"}
                      </li>
                    ),
                  )}
              </ul>
            )}
          </section>
        )}

      {canRespond && record.status !== "finalized" && record.status !== "cancelled" && (
        <div className="negotiation-response">
          <h3>Respond to revision {record.revision}</h3>
          {requiresAssetConsent && reviewAsset && !alreadyApproved && (
            <label className="asset-consent">
              <input
                type="checkbox"
                checked={assetConsent}
                disabled={isWorking}
                onChange={(event) => setAssetConsent(event.target.checked)}
              />
              <span>
                <strong>I affirmatively agree to {reviewAsset.displayName}.</strong>
                <small>
                  I reviewed the variable yield, eligibility, additional risks, simulation status,
                  and {reviewAsset.settlementAsset} settlement disclosed above.
                </small>
              </span>
            </label>
          )}
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
              disabled={
                isWorking ||
                alreadyApproved ||
                !isConnected ||
                !address ||
                (requiresAssetConsent && !assetConsent)
              }
              onClick={() =>
                address &&
                void act(
                  {
                    type: "approve",
                    wallet: address,
                    name: currentName?.trim() || undefined,
                    assetConsent: requiresAssetConsent ? assetConsent : undefined,
                  },
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

      {message && <p className="tx-success" role="status">{message}</p>}
      {error && <p className="tx-error" role="alert">{error}</p>}
      {record.status === "finalized" && record.onchainAgreementId && (
        <p className="tx-success" role="status">
          Finalized as {agreementReference(record.onchainAgreementId)}. Open the
          Deposits tab to manage the deposit or the Record tab to review its history.
        </p>
      )}
    </section>
  );
}

function PrivyAgreementNegotiation({ access }: { access: NegotiationAccess }) {
  const { authenticated, user, logout } = usePrivy();
  const currentName = user?.google?.name ?? null;
  const currentEmail = user?.google?.email ?? user?.email?.address ?? null;
  return (
    <AgreementNegotiationView
      access={access}
      currentName={currentName}
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
