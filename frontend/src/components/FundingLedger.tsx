import { useReadContract } from "wagmi";
import {
  OpenEscrowABI,
  OPEN_ESCROW_ADDRESS,
  YIELD_USDC_ADDRESS,
} from "../contracts/config";
import { formatUSDC, shortAddr } from "../lib/format";
import type { NegotiationRecord } from "../lib/negotiations";
import type { Agreement } from "../lib/useAgreement";
import { getDepositAssetForTerms } from "../../shared/deposit-assets.js";
import { claimAmountUnit, payoutAmountUnit } from "../lib/agreementAmountDisplay";

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
  const isYieldToken =
    agreement.token.toLowerCase() === YIELD_USDC_ADDRESS.toLowerCase();
  const yieldSettlement = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "yieldSettled",
    args: [id],
    query: { enabled: isYieldToken, refetchInterval: 4_000 },
  });
  const isYieldSettled = isYieldToken && yieldSettlement.data === true;
  const tokenLabel =
    getDepositAssetForTerms(
      participantRecord?.terms || { tokenChoice: isYieldToken ? "yield" : "plain" },
    )?.testnetSymbol || (isYieldToken ? "taUSDC" : "testUSDC");
  const payoutUnit = payoutAmountUnit({
    tokenAddress: agreement.token,
    yieldTokenAddress: YIELD_USDC_ADDRESS,
    yieldSettled: isYieldSettled,
  });
  const claimUnit = claimAmountUnit(agreement.token, YIELD_USDC_ADDRESS);

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
    <section className="funding-ledger" aria-label="Funding ledger">
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
                  <div className="funding-party-name">
                    <strong>{identity.name}</strong>
                    <b className="party-role-badge tenant">Tenant</b>
                  </div>
                  {identity.email && <span>{identity.email}</span>}
                  <small>{shortAddr(wallet)}</small>
                </div>
                <dl>
                  <div>
                    <dt>Funded</dt>
                    <dd>
                      ${formatUSDC(contribution)} test USD
                      <small>{formatUSDC(contribution)} {tokenLabel}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Deposit ownership</dt>
                    <dd>{share.toFixed(2).replace(/\.?0+$/, "")}%</dd>
                  </div>
                  <div>
                    <dt>Available now</dt>
                    <dd>{formatUSDC(withdrawable)} {payoutUnit}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
          <article className="funding-party-row landlord-claim-row">
            <div>
              <div className="funding-party-name">
                <strong>{participantRecord?.landlordName || "Landlord"}</strong>
                <b className="party-role-badge landlord">Landlord</b>
              </div>
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
                <dd>{formatUSDC(agreement.claimedAmount)} {claimUnit}</dd>
              </div>
              <div>
                <dt>Available now</dt>
                <dd>{formatUSDC(agreement.landlordWithdrawable)} {payoutUnit}</dd>
              </div>
            </dl>
          </article>
        </div>
      )}
    </section>
  );
}
