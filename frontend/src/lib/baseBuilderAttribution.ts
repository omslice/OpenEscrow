import { Attribution } from "ox/erc8021";
import type { Hex } from "viem";

/** Build the ERC-8021 suffix for one owner-issued Base.dev Builder Code. */
export function createBaseBuilderDataSuffix(
  rawBuilderCode?: string,
): Hex | undefined {
  const builderCode = rawBuilderCode?.trim();
  if (!builderCode) return undefined;

  try {
    return Attribution.toDataSuffix({ codes: [builderCode] });
  } catch (cause) {
    throw new Error(
      "VITE_BASE_BUILDER_CODE could not be encoded as an ERC-8021 Builder Code.",
      { cause },
    );
  }
}
