import {
  DEPOSIT_ASSETS,
  depositAssetAvailability,
  type DepositAssetId,
} from "../../shared/deposit-assets.js";
import { createFundingPlan } from "../../shared/funding-routes.js";

export function DepositAssetSelector({
  selectedAssetId,
  yieldConsent,
  disabled,
  countryCode = "US",
  onSelect,
  onYieldConsentChange,
}: {
  selectedAssetId: DepositAssetId;
  yieldConsent: boolean;
  disabled: boolean;
  countryCode?: string | null;
  onSelect: (assetId: DepositAssetId) => void;
  onYieldConsentChange: (consented: boolean) => void;
}) {
  const selectedAsset =
    DEPOSIT_ASSETS.find((asset) => asset.id === selectedAssetId) ?? DEPOSIT_ASSETS[0];

  return (
    <fieldset className="deposit-asset-selector">
      <legend>Deposit asset</legend>
      <p className="field-help">
        Choose the asset based on settlement behavior, eligibility, and risk. Yield is optional,
        variable where offered, and not presented as the preferred choice.
      </p>
      <div className="deposit-asset-options">
        {DEPOSIT_ASSETS.map((asset) => {
          const availability = depositAssetAvailability(asset.id, { countryCode });
          const selected = selectedAssetId === asset.id;
          return (
            <label
              className={`deposit-asset-option${selected ? " selected" : ""}${
                availability.available ? "" : " unavailable"
              }`}
              key={asset.id}
            >
              <span className="deposit-asset-option-heading">
                <input
                  type="radio"
                  name="deposit-asset"
                  checked={selected}
                  disabled={disabled || !availability.available}
                  onChange={() => {
                    onSelect(asset.id);
                    onYieldConsentChange(false);
                  }}
                />
                <span>
                  <strong>{asset.displayName}</strong>
                  <small>{asset.badge}</small>
                </span>
                <b className={`implementation-badge ${asset.implementationStatus}`}>
                  {asset.implementationStatus}
                </b>
              </span>
              <dl>
                <div>
                  <dt>Yield</dt>
                  <dd>
                    {asset.yieldType === "none"
                      ? "None"
                      : `${asset.yieldSource} (${asset.yieldVariability})`}
                  </dd>
                </div>
                <div>
                  <dt>Main added risk</dt>
                  <dd>{asset.mainRisk}</dd>
                </div>
                <div>
                  <dt>Eligibility</dt>
                  <dd>{availability.available ? asset.eligibility : availability.reason}</dd>
                </div>
                <div>
                  <dt>Settlement</dt>
                  <dd>{asset.settlementAsset}</dd>
                </div>
              </dl>
              <a
                href={asset.officialDocumentationUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
              >
                Official documentation
              </a>
              <FundingRouteSummary asset={asset} />
            </label>
          );
        })}
      </div>
      {selectedAsset?.consentRequired && (
        <label className="asset-consent">
          <input
            type="checkbox"
            checked={yieldConsent}
            disabled={disabled}
            onChange={(event) => onYieldConsentChange(event.target.checked)}
          />
          <span>
            <strong>I affirmatively choose this yield-bearing asset.</strong>
            <small>
              I reviewed its variable yield, additional risks, eligibility, and{" "}
              {selectedAsset.settlementAsset} settlement. Every invited party must separately
              confirm the same revision before it can be finalized.
            </small>
          </span>
        </label>
      )}
      {selectedAsset && (
        <details className="asset-disclosures">
          <summary>Review {selectedAsset.displayName} disclosures</summary>
          <ul>
            {selectedAsset.disclosures.map((disclosure) => (
              <li key={disclosure}>{disclosure}</li>
            ))}
          </ul>
          <p>
            Funding route: fiat to USDC through the configured Privy provider, then{" "}
            {selectedAsset.fundingRoute.conversion === "none"
              ? "directly into escrow"
              : selectedAsset.id === "aave-usdc"
                ? "a direct Aave supply adapter in a future audited production deployment"
                : "a disabled asset-specific adapter"}
            . No production route is active in this Base Sepolia build.
          </p>
        </details>
      )}
    </fieldset>
  );
}

function FundingRouteSummary({ asset }: { asset: (typeof DEPOSIT_ASSETS)[number] }) {
  const plan = createFundingPlan(asset.id, {
    onrampEnabled: true,
    environment: "sandbox",
  });
  const conversion = plan.conversion;
  const routeDisplay = plan.routeSteps.join(" → ");
  const conversionSummary =
    conversion === null
      ? "No asset conversion is available."
      : conversion.kind === "none"
        ? "No conversion is needed; purchased USDC would remain USDC."
        : `${conversion.description} This step remains disabled in the testnet app.`;

  return (
    <p className="asset-route-summary">
      <strong>How funding would work</strong>
      <br />
      {routeDisplay || "No active funding path is modeled for this option."}
      <br />
      Privy would show a regulated payment provider available in the user&apos;s region. OpenEscrow
      would not receive card or bank details. The provider would send purchased USDC to the
      user&apos;s wallet before a separate escrow funding transaction.
      <br />
      {conversionSummary}
      <br />
      {plan.checkoutAvailable
        ? "A no-money checkout preview is available for testing."
        : plan.reason ?? "No checkout is available in this build."}
    </p>
  );
}
