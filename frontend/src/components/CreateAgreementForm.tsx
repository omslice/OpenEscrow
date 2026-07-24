import { useEffect, useRef, useState } from "react";
import { decodeEventLog, isAddress } from "viem";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import {
  MAX_CLAIM_WINDOW_OFFSET_SECONDS,
  MAX_PERIOD_SECONDS,
  MIN_PERIOD_SECONDS,
  OpenEscrowABI,
  OPEN_ESCROW_ADDRESS,
} from "../contracts/config";
import { parseUSDC } from "../lib/format";
import {
  JURISDICTIONS,
  jurisdictionLabel,
  rememberJurisdiction,
  type JurisdictionCode,
} from "../lib/jurisdictions";
import { useTrackedAgreements } from "../lib/useTrackedAgreements";

const DAY = 24 * 60 * 60;
const MAX_PERIOD_DAYS = MAX_PERIOD_SECONDS / DAY;

function validatePeriodDays(days: string, label: string): string | null {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return `${label} must be a positive number of days.`;
  const seconds = n * DAY;
  if (seconds < MIN_PERIOD_SECONDS) return `${label} is below the contract's minimum (5 minutes).`;
  if (seconds > MAX_PERIOD_SECONDS) return `${label} exceeds the contract's maximum (${MAX_PERIOD_DAYS} days).`;
  return null;
}

export function CreateAgreementForm() {
  const { address, isConnected } = useAccount();
  const { addId } = useTrackedAgreements();

  const [tenant, setTenant] = useState("");
  const [arbiter, setArbiter] = useState("");
  const [deposit, setDeposit] = useState("100");
  const [claimWindowStart, setClaimWindowStart] = useState("");
  const [claimDays, setClaimDays] = useState("30");
  const [responseDays, setResponseDays] = useState("2");
  const [arbiterDays, setArbiterDays] = useState("3");
  const [jurisdiction, setJurisdiction] = useState<JurisdictionCode>("testnet-generic");
  const [createdId, setCreatedId] = useState<bigint | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
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

    if (!tenant || !arbiter) return setFormError("Tenant and arbiter addresses are required.");
    if (!isAddress(tenant)) return setFormError("Tenant address is not a valid Ethereum address.");
    if (!isAddress(arbiter)) return setFormError("Arbiter address is not a valid Ethereum address.");
    if (tenant.toLowerCase() === arbiter.toLowerCase()) {
      return setFormError("Tenant and arbiter must be different addresses.");
    }
    if (address && (tenant.toLowerCase() === address.toLowerCase() || arbiter.toLowerCase() === address.toLowerCase())) {
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
      functionName: "createAgreement",
      args: [
        tenant as `0x${string}`,
        arbiter as `0x${string}`,
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
        You become the landlord. The tenant funds nothing until the arbiter you name below has
        explicitly accepted the role (spec decision 4) - no on-chain negotiation happens after this,
        so make sure these terms are agreed off-chain first.
      </p>

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
        Tenant address
        <input value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="0x..." />
      </label>
      <label>
        Arbiter address
        <input value={arbiter} onChange={(e) => setArbiter(e.target.value)} placeholder="0x..." />
      </label>
      <label>
        Deposit amount (USDC)
        <input value={deposit} onChange={(e) => setDeposit(e.target.value)} type="number" min="0" step="0.000001" />
      </label>
      <label>
        Claim window start
        <input
          value={claimWindowStart}
          onChange={(e) => setClaimWindowStart(e.target.value)}
          type="datetime-local"
        />
      </label>
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
        {isPending ? "Confirm in wallet..." : isMining ? "Mining..." : "Create agreement"}
      </button>

      {formError && <p className="tx-error">{formError}</p>}
      {error && <p className="tx-error">{error.message.split("\n")[0]}</p>}
      {createdId !== null && (
        <div className="tx-success">
          <p>
            Created agreement #{createdId.toString()}. Share this link with your tenant and arbiter -
            opening it takes them straight to it, and it's also now tracked in "My agreements" below.
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
