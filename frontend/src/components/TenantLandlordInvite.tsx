import { useState } from "react";
import { useIdentityToken } from "@privy-io/react-auth";
import { copyTextToClipboard } from "../lib/browserActions";
import { sendLandlordInvite } from "../lib/negotiations";
import { publicAppOrigin } from "../lib/publicAppOrigin";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function TenantLandlordInvite() {
  const { identityToken } = useIdentityToken();
  const [landlordEmail, setLandlordEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
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
    `${publicAppOrigin()}/`,
    "",
    "This is currently a Base Sepolia testnet demonstration. Do not send real funds.",
  ].join("\n");
  async function copyInvite() {
    setActionError(null);
    try {
      await copyTextToClipboard(
        `To: ${normalizedEmail}\nSubject: ${subject}\n\n${body}`,
      );
      setCopied(true);
    } catch (error) {
      setCopied(false);
      setActionError(
        error instanceof Error ? error.message : "The landlord invitation could not be copied.",
      );
    }
  }

  async function sendInvite() {
    if (!identityToken || !isValid || sending) return;
    setActionError(null);
    setSent(false);
    setSending(true);
    try {
      await sendLandlordInvite(identityToken, normalizedEmail);
      setSent(true);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "The landlord invitation could not be sent.",
      );
    } finally {
      setSending(false);
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
            setSent(false);
            setActionError(null);
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
          disabled={!isValid || !identityToken || sending}
          onClick={() => void sendInvite()}
        >
          {sending ? "Sending invite..." : sent ? "Landlord invite sent" : "Send landlord invite"}
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
      {actionError && (
        <p className="tx-error" role="alert" aria-live="assertive">
          {actionError}
        </p>
      )}
      {sent && (
        <p className="tx-success" role="status" aria-live="polite">
          Invitation sent to {normalizedEmail}.
        </p>
      )}
      <p className="field-help">
        This does not give the landlord access to your account. Their later proposal invitation
        will be tied to your tenant email.
      </p>
    </section>
  );
}
