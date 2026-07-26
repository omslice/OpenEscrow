import { useReadContract } from "wagmi";
import {
  OpenEscrowABI,
  OPEN_ESCROW_ADDRESS,
  YIELD_USDC_ADDRESS,
} from "../contracts/config";
import { formatUSDC, shortAddr } from "../lib/format";
import type { NegotiationRecord } from "../lib/negotiations";
import type { Agreement } from "../lib/useAgreement";

type TenantParticipants =
  | readonly [
      readonly `0x${string}`[],
      readonly number[],
      readonly bigint[],
      readonly bigint[],
    ]
  | undefined;

export function FundingLedger({
  id,
  agreement,
  participantRecord,
}: {
  id: bigint;
  agreement: Agreement;
  participantRecord?: NegotiationRecord | null;
}) {
  const participants = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "getTenantParticipants",
    args: [id],
    query: { refetchInterval: 4_000 },
  });
  const data = participants.data as TenantParticipants;
  const tokenLabel =
    agreement.token.toLowerCase() === YIELD_USDC_ADDRESS.toLowerCase()
      ? "ytUSDC"
      : "testUSDC";

  function tenantIdentity(wallet: string) {
    const tenant = participantRecord?.tenants.find(
      (candidate) => candidate.wallet?.toLowerCase() === wallet.toLowerCase(),
    );
    return {
      name: tenant?.name || "Tenant",
      email: tenant?.email,
    };
  }

  return (
    <section className="funding-ledger" aria-labelledby={`funding-ledger-${id}`}>
      <div className="agreement-panel-heading">
        <span className="eyebrow">Funding ledger</span>
        <h4 id={`funding-ledger-${id}`}>Who funded and who has claim to the deposit</h4>
        <p>
          Contributions and ownership are read directly from the agreement. Withdrawable
          amounts update after a claim or refund is resolved.
        </p>
      </div>

      {!data ? (
        <p className="hint">Loading participant funding...</p>
      ) : (
        <div className="funding-party-list">
          {data[0].map((wallet, index) => {
            const identity = tenantIdentity(wallet);
            const share = Number(data[1][index] || 0) / 100;
            const contribution = data[2][index] || 0n;
            const withdrawable = data[3][index] || 0n;
            return (
              <article className="funding-party-row" key={wallet}>
                <div>
                  <strong>{identity.name}</strong>
                  {identity.email && <span>{identity.email}</span>}
                  <small>{shortAddr(wallet)}</small>
                </div>
                <dl>
                  <div>
                    <dt>Funded</dt>
                    <dd>{formatUSDC(contribution)} {tokenLabel}</dd>
                  </div>
                  <div>
                    <dt>Deposit ownership</dt>
                    <dd>{share.toFixed(2).replace(/\.?0+$/, "")}%</dd>
                  </div>
                  <div>
                    <dt>Available now</dt>
                    <dd>{formatUSDC(withdrawable)} {tokenLabel}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
          <article className="funding-party-row landlord-claim-row">
            <div>
              <strong>{participantRecord?.landlordName || "Landlord"}</strong>
              {participantRecord?.landlordEmail && (
                <span>{participantRecord.landlordEmail}</span>
              )}
              <small>{shortAddr(agreement.landlord)}</small>
            </div>
            <dl>
              <div>
                <dt>Funded</dt>
                <dd>0 {tokenLabel}</dd>
              </div>
              <div>
                <dt>Deduction claimed</dt>
                <dd>{formatUSDC(agreement.claimedAmount)} {tokenLabel}</dd>
              </div>
              <div>
                <dt>Available now</dt>
                <dd>{formatUSDC(agreement.landlordWithdrawable)} {tokenLabel}</dd>
              </div>
            </dl>
          </article>
        </div>
      )}
    </section>
  );
}
