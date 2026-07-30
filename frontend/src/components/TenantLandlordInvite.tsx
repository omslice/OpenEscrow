import { useState } from "react";
import { copyTextToClipboard } from "../lib/browserActions";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function TenantLandlordInvite() {
  const [landlordEmail, setLandlordEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const normalizedEmail = landlordEmail.trim().toLowerCase();
  const isValid = EMAIL_PATTERN.test(normalizedEmail);
  const subject = "Your tenant invited you to try OpenEscrow";
  const body = [
    "Your tenant invited you to use OpenEscrow, a free and open-source security-deposit escrow application.",
    "",
    "OpenEscrow helps landlords and tenants agree on deposit terms, document deductions, and keep a timestamped record of approvals and disputes.",
    "",
    "To get started:",
    "1. Open OpenEscrow and sign in with this email address.",
    "2. Choose “I am a landlord” and create the agreement proposal.",
    "3. Save the proposal, then send the tenant the role-locked review invitation.",
    "",
    `${window.location.origin}/`,
    "",
    "This is currently a Base Sepolia testnet demonstration. Do not send real funds.",
  ].join("\n");
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
    normalizedEmail,
  )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  async function copyInvite() {
    setCopyError(null);
    try {
      await copyTextToClipboard(
        `To: ${normalizedEmail}\nSubject: ${subject}\n\n${body}`,
      );
      setCopied(true);
    } catch (error) {
      setCopied(false);
      setCopyError(
        error instanceof Error ? error.message : "The landlord invitation could not be copied.",
      );
    }
  }

  return (
    <section className="card tenant-landlord-invite" aria-labelledby="tenant-landlord-invite-title">
      <span className="eyebrow">Start with your landlord</span>
      <h2 id="tenant-landlord-invite-title">Invite your landlord to OpenEscrow</h2>
      <p className="hint">
        If you do not have a proposal invitation yet, send your landlord a short introduction.
        The landlord creates the proposal and then sends you the tenant review link.
      </p>
      <label>
        Landlord email address
        <input
          value={landlordEmail}
          onChange={(event) => {
            setLandlordEmail(event.target.value);
            setCopied(false);
            setCopyError(null);
          }}
          type="email"
          pattern="[^\s@]+@[^\s@]+\.[^\s@]+"
          placeholder="landlord@example.com"
          autoComplete="email"
          aria-invalid={landlordEmail.length > 0 && !isValid}
        />
      </label>
      <div className="button-row">
        <button
          className="btn btn-primary"
          type="button"
          disabled={!isValid}
          onClick={() => window.open(gmailUrl, "_blank", "noopener,noreferrer")}
        >
          Open landlord invite in Gmail
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={!isValid}
          onClick={() => void copyInvite()}
        >
          {copied ? "Landlord invite copied" : "Copy landlord invite"}
        </button>
      </div>
      {copyError && (
        <p className="tx-error" role="alert" aria-live="assertive">
          {copyError}
        </p>
      )}
      <p className="field-help">
        This does not give the landlord access to your account. Their later proposal invitation
        will be tied to your tenant email.
      </p>
    </section>
  );
}
