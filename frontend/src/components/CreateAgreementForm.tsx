import { useEffect, useRef, useState } from "react";
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
} from "../contracts/config";
import { parseUSDC } from "../lib/format";
import {
  JURISDICTIONS,
  jurisdictionLabel,
  rememberJurisdiction,
  type JurisdictionCode,
} from "../lib/jurisdictions";
import { ACCOUNT_AUTH_ENABLED } from "../lib/accountConfig";
import { useTrackedAgreements } from "../lib/useTrackedAgreements";

const DAY = 24 * 60 * 60;
const MAX_PERIOD_DAYS = MAX_PERIOD_SECONDS / DAY;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

function validatePeriodDays(days: string, label: string): string | null {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return `${label} must be a positive number of days.`;
  const seconds = n * DAY;
  if (seconds < MIN_PERIOD_SECONDS) return `${label} is below the contract's minimum (5 minutes).`;
  if (seconds > MAX_PERIOD_SECONDS) return `${label} exceeds the contract's maximum (${MAX_PERIOD_DAYS} days).`;
  return null;
}

function inviteContent(email: string, role: "tenant" | "arbiter") {
  const inviteUrl = `${window.location.origin}/?invite=${role}`;
  const subject = "You have been invited to OpenEscrow";
  const body = [
    `You have been invited to participate in an OpenEscrow security-deposit agreement as the ${role}.`,
    "",
    `Create or sign in to your OpenEscrow account here: ${inviteUrl}`,
    "",
    "OpenEscrow will create an EVM wallet for you when you sign up with Google, or you can connect your own wallet. For this MVP, copy that wallet address from your account and send it back to the landlord so it can be mapped to this agreement.",
    "",
    "This is a Base Sepolia testnet demonstration. Do not send real funds.",
  ].join("\n");
  return {
    subject,
    body,
    gmailUrl: `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  };
}

function AgreementForm({ landlordEmail }: { landlordEmail: string }) {
  const { address, isConnected } = useAccount();
  const { addId } = useTrackedAgreements();

  const [tenantEmail, setTenantEmail] = useState("");
  const [arbiterEmail, setArbiterEmail] = useState("");
  const [tenantWallet, setTenantWallet] = useState("");
  const [arbiterWallet, setArbiterWallet] = useState("");
  const [deposit, setDeposit] = useState("100");
  const [tokenChoice, setTokenChoice] = useState<"plain" | "yield">("plain");
  const [claimWindowStart, setClaimWindowStart] = useState("");
  const [claimDays, setClaimDays] = useState("30");
  const [responseDays, setResponseDays] = useState("7");
  const [arbiterDays, setArbiterDays] = useState("7");
  const [jurisdiction, setJurisdiction] = useState<JurisdictionCode>("testnet-generic");
  const [createdId, setCreatedId] = useState<bigint | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState<"tenant" | "arbiter" | null>(null);
  const submittedJurisdiction = useRef<JurisdictionCode>("testnet-generic");
  const handledReceipt = useRef<`0x${string}` | null>(null);

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { data: receipt, isLoading: isMining } = useWaitForTransactionReceipt({ hash });

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
          const url = new URL(window.location.href);
          url.searchParams.set("id", id.toString());
          url.searchParams.set("jurisdiction", submittedJurisdiction.current);
          window.history.replaceState(null, "", url.toString());
          break;
        }
      } catch {
        // not this event, ignore
      }
    }
  }, [receipt, addId]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setCreatedId(null);

    if (ACCOUNT_AUTH_ENABLED && !landlordEmail) {
      return setFormError("The landlord must link a verified email before proposing an agreement.");
    }
    if (!EMAIL_PATTERN.test(tenantEmail)) return setFormError("Enter a valid tenant email.");
    const hasArbiter = arbiterEmail.trim() !== "" || arbiterWallet.trim() !== "";
    if (hasArbiter && !EMAIL_PATTERN.test(arbiterEmail)) {
      return setFormError("Enter a valid arbiter email, or leave both arbiter fields blank.");
    }
    if (hasArbiter && tenantEmail.toLowerCase() === arbiterEmail.toLowerCase()) {
      return setFormError("Tenant and arbiter must use different emails.");
    }
    if (
      tenantEmail.toLowerCase() === landlordEmail.toLowerCase() ||
      (hasArbiter && arbiterEmail.toLowerCase() === landlordEmail.toLowerCase())
    ) {
      return setFormError("Landlord, tenant, and arbiter must use different emails.");
    }
    if (!tenantWallet) return setFormError("The tenant wallet must be resolved before finalizing.");
    if (hasArbiter && (!arbiterEmail || !arbiterWallet)) {
      return setFormError("Provide both an arbiter email and wallet, or leave both blank.");
    }
    if (!isAddress(tenantWallet)) return setFormError("The mapped tenant wallet is not valid.");
    if (hasArbiter && !isAddress(arbiterWallet)) {
      return setFormError("The mapped arbiter wallet is not valid.");
    }
    if (hasArbiter && tenantWallet.toLowerCase() === arbiterWallet.toLowerCase()) {
      return setFormError("Tenant and arbiter must be different addresses.");
    }
    if (
      address &&
      (tenantWallet.toLowerCase() === address.toLowerCase() ||
        (hasArbiter && arbiterWallet.toLowerCase() === address.toLowerCase()))
    ) {
      return setFormError("Tenant and arbiter must both be different from your connected (landlord) address.");
    }
    if (!claimWindowStart) return setFormError("Claim window start date is required.");

    let depositRaw: bigint;
    try {
      depositRaw = parseUSDC(deposit);
    } catch {
      return setFormError("Invalid deposit amount.");
    }
    if (depositRaw <= 0n) return setFormError("Deposit must be greater than zero.");

    for (const [days, label] of [
      [claimDays, "Claim period"],
      [responseDays, "Response period"],
      [arbiterDays, "Arbiter ruling period"],
    ] as const) {
      const err = validatePeriodDays(days, label);
      if (err) return setFormError(err);
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const startSec = Math.floor(new Date(claimWindowStart).getTime() / 1000);
    if (startSec < nowSec) return setFormError("Claim window start must be in the future.");
    if (startSec - nowSec > MAX_CLAIM_WINDOW_OFFSET_SECONDS) {
      return setFormError("Claim window start is too far in the future.");
    }

    const claimPeriod = BigInt(Number(claimDays) * DAY);
    const responsePeriod = BigInt(Number(responseDays) * DAY);
    const arbiterPeriod = BigInt(Number(arbiterDays) * DAY);

    submittedJurisdiction.current = jurisdiction;
    writeContract({
      address: OPEN_ESCROW_ADDRESS,
      abi: OpenEscrowABI,
      functionName: "createAgreementWithToken",
      args: [
        tenantWallet as `0x${string}`,
        hasArbiter ? (arbiterWallet as `0x${string}`) : ZERO_ADDRESS,
        tokenChoice === "yield" ? YIELD_USDC_ADDRESS : USDC_ADDRESS,
        depositRaw,
        BigInt(startSec),
        claimPeriod,
        responsePeriod,
        arbiterPeriod,
      ],
    });
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Propose a new agreement</h2>
      <p className="hint">
        You are the landlord. Invite the tenant by email and optionally nominate an arbiter. Each
        email is matched to the wallet created for their OpenEscrow account, or to a wallet they
        connect themselves.
      </p>

      <div className="participant-summary">
        <span>Landlord email</span>
        <strong>{landlordEmail || "Link Google in your account settings first"}</strong>
        <small>The active wallet is used as the onchain landlord.</small>
      </div>

      <label>
        Jurisdiction context
        <select
          value={jurisdiction}
          onChange={(e) => setJurisdiction(e.target.value as JurisdictionCode)}
        >
          {JURISDICTIONS.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <p className="jurisdiction-notice">
        Research context only: this selection is saved off-chain and shared in the agreement link.
        It has not been legally reviewed and does not change the contract's deadlines, claim rules,
        or enforceability.
      </p>

      <label>
        Tenant email
        <input
          value={tenantEmail}
          onChange={(e) => setTenantEmail(e.target.value)}
          placeholder="tenant@example.com"
          type="email"
          autoComplete="email"
        />
      </label>
      <label>
        Arbiter email (optional)
        <input
          value={arbiterEmail}
          onChange={(e) => setArbiterEmail(e.target.value)}
          placeholder="arbiter@example.com"
          type="email"
          autoComplete="email"
        />
      </label>
      <div className="invite-actions">
        <a
          className={`btn btn-secondary${EMAIL_PATTERN.test(tenantEmail) ? "" : " disabled"}`}
          href={EMAIL_PATTERN.test(tenantEmail) ? inviteContent(tenantEmail, "tenant").gmailUrl : undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!EMAIL_PATTERN.test(tenantEmail)}
        >
          Open tenant invite in Gmail
        </a>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={!EMAIL_PATTERN.test(tenantEmail)}
          onClick={async () => {
            await navigator.clipboard.writeText(inviteContent(tenantEmail, "tenant").body);
            setCopiedInvite("tenant");
          }}
        >
          {copiedInvite === "tenant" ? "Tenant invite copied" : "Copy tenant invite"}
        </button>
        {arbiterEmail.trim() !== "" && (
          <>
            <a
              className={`btn btn-secondary${EMAIL_PATTERN.test(arbiterEmail) ? "" : " disabled"}`}
              href={EMAIL_PATTERN.test(arbiterEmail) ? inviteContent(arbiterEmail, "arbiter").gmailUrl : undefined}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!EMAIL_PATTERN.test(arbiterEmail)}
            >
              Open arbiter invite in Gmail
            </a>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={!EMAIL_PATTERN.test(arbiterEmail)}
              onClick={async () => {
                await navigator.clipboard.writeText(inviteContent(arbiterEmail, "arbiter").body);
                setCopiedInvite("arbiter");
              }}
            >
              {copiedInvite === "arbiter" ? "Arbiter invite copied" : "Copy arbiter invite"}
            </button>
          </>
        )}
      </div>
      <p className="field-help">
        Gmail opens in a new tab, and the copy option works without a desktop mail app. Automatic
        sending and wallet matching remain a server-side milestone.
      </p>
      <details className="participant-resolution">
        <summary>Participant wallet resolution — temporary MVP step</summary>
        <p className="hint">
          Automatic email invitations and account-to-wallet matching require the invitation
          service now being built. Until it is connected, enter the wallets supplied by the
          tenant and, if used, the arbiter to finalize this draft onchain.
        </p>
        <label>
          Tenant wallet mapped to {tenantEmail || "tenant email"}
          <input
            value={tenantWallet}
            onChange={(e) => setTenantWallet(e.target.value)}
            placeholder="0x..."
          />
        </label>
        <label>
          Arbiter wallet mapped to {arbiterEmail || "optional arbiter email"}
          <input
            value={arbiterWallet}
            onChange={(e) => setArbiterWallet(e.target.value)}
            placeholder="0x..."
          />
        </label>
        <p className="field-help">
          Leave both arbiter fields blank to proceed without one. If a dispute later occurs, the
          landlord and tenant may mutually appoint an arbiter before the fixed ruling deadline;
          otherwise the disputed balance defaults to the tenant when the deadline expires.
        </p>
      </details>
      <fieldset className="token-choice">
        <legend>Deposit test token</legend>
        <label title="Plain freely mintable test token. Its displayed value does not grow.">
          <input
            type="radio"
            name="deposit-token"
            checked={tokenChoice === "plain"}
            onChange={() => setTokenChoice("plain")}
          />
          <span>
            <strong>testUSDC</strong>
            <small>Plain test token · stable demo value</small>
          </span>
        </label>
        <label title="Freely mintable test shares whose displayed testUSDC value grows 20% per day. No real assets or redemption.">
          <input
            type="radio"
            name="deposit-token"
            checked={tokenChoice === "yield"}
            onChange={() => setTokenChoice("yield")}
          />
          <span>
            <strong>ytUSDC ⓘ</strong>
            <small>Yield-test shares · 20%/day accelerated demo</small>
          </span>
        </label>
      </fieldset>
      <label>
        Deposit amount ({tokenChoice === "yield" ? "ytUSDC shares" : "testUSDC"})
        <input value={deposit} onChange={(e) => setDeposit(e.target.value)} type="number" min="0" step="0.000001" />
      </label>
      <label>
        Expected lease expiration / claim window start
        <input
          value={claimWindowStart}
          onChange={(e) => setClaimWindowStart(e.target.value)}
          type="datetime-local"
        />
      </label>
      <p className="field-help">
        For this demo, the claim window opens when the lease is expected to expire. Actual legal
        deadlines may depend on move-out, possession, and the selected jurisdiction.
      </p>
      <label>
        Claim period (days the landlord has to submit a claim once the window opens)
        <input value={claimDays} onChange={(e) => setClaimDays(e.target.value)} type="number" min="1" />
      </label>
      <label>
        Response period (days the tenant has to respond once a claim is submitted)
        <input value={responseDays} onChange={(e) => setResponseDays(e.target.value)} type="number" min="1" />
      </label>
      <label>
        Arbiter ruling period (days the arbiter has to rule once a dispute is created)
        <input value={arbiterDays} onChange={(e) => setArbiterDays(e.target.value)} type="number" min="1" />
      </label>

      <button className="btn btn-primary" type="submit" disabled={!isConnected || isPending || isMining}>
        {isPending ? "Confirm in wallet..." : isMining ? "Mining..." : "Finalize agreement onchain"}
      </button>

      {formError && <p className="tx-error">{formError}</p>}
      {error && <p className="tx-error">{error.message.split("\n")[0]}</p>}
      {createdId !== null && (
        <div className="tx-success">
          <p>
            Created agreement #{createdId.toString()}. Share this link with the tenant
            {arbiterEmail ? " and arbiter" : ""}; opening it takes them straight to the deposit
            dashboard.
          </p>
          <p>
            Jurisdiction context: {jurisdictionLabel(submittedJurisdiction.current)} (off-chain).
          </p>
          <code>{window.location.href}</code>
        </div>
      )}
    </form>
  );
}

function PrivyCreateAgreementForm() {
  const { user } = usePrivy();
  const landlordEmail = user?.google?.email ?? user?.email?.address ?? "";
  return <AgreementForm landlordEmail={landlordEmail} />;
}

export function CreateAgreementForm() {
  return ACCOUNT_AUTH_ENABLED ? (
    <PrivyCreateAgreementForm />
  ) : (
    <AgreementForm landlordEmail="" />
  );
}
