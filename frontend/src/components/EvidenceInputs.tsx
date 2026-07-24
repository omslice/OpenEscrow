import { useState } from "react";
import { keccak256, toBytes } from "viem";

/**
 * Shared evidence-entry UX: the description text is hashed client-side and only the
 * hash goes on-chain, alongside a caller-supplied pointer/URI. Per spec decision 6,
 * the raw description is never itself sent to the contract - only keccak256(description).
 */
export function useEvidenceInputs() {
  const [description, setDescription] = useState("");
  const [uri, setUri] = useState("");

  const contentHash = description ? keccak256(toBytes(description)) : ("0x" + "0".repeat(64)) as `0x${string}`;
  const valid = description.trim().length > 0;

  const fields = (
    <>
      <label>
        Evidence description (hashed locally, never sent on-chain as text)
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. 'Move-out inspection notes, unit 4B, water damage in kitchen ceiling'"
          rows={3}
        />
      </label>
      <label>
        Evidence pointer / URI (optional, e.g. an IPFS link to photos)
        <input value={uri} onChange={(e) => setUri(e.target.value)} placeholder="ipfs://... or any opaque id" />
      </label>
      <p className="warning">
        Public IPFS is public and permanent, not private storage. Do not put names, physical addresses,
        lease documents, invoices, or photographs directly here or at an unencrypted public URI.
      </p>
    </>
  );

  return { fields, contentHash, uri, valid };
}
