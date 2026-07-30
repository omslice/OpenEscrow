import { downloadTextFile } from "./browserActions.ts";
import type { AccountDataInventory } from "./negotiations.ts";

export interface PreparedAccountDataInventory {
  content: string;
  contentType: "application/json";
  filename: string;
}

export type AccountDataInventoryDelivery =
  | (PreparedAccountDataInventory & { outcome: "downloaded" })
  | (PreparedAccountDataInventory & {
      outcome: "copy_available";
      error: unknown;
    });

type DownloadAction = (
  content: string,
  contentType: string,
  filename: string,
) => void;

function safeInventoryTimestamp(generatedAt: string) {
  const generatedDate = new Date(generatedAt);
  if (Number.isNaN(generatedDate.getTime())) return "unknown-time";
  return generatedDate.toISOString().replaceAll(/[:.]/g, "-");
}

export function prepareAccountDataInventory(
  inventory: AccountDataInventory,
): PreparedAccountDataInventory {
  return {
    content: `${JSON.stringify(inventory, null, 2)}\n`,
    contentType: "application/json",
    filename: `openescrow-account-data-inventory-${safeInventoryTimestamp(inventory.generatedAt)}.json`,
  };
}

export function deliverAccountDataInventory(
  inventory: AccountDataInventory,
  download: DownloadAction = downloadTextFile,
): AccountDataInventoryDelivery {
  const prepared = prepareAccountDataInventory(inventory);
  try {
    download(prepared.content, prepared.contentType, prepared.filename);
    return { ...prepared, outcome: "downloaded" };
  } catch (error) {
    return { ...prepared, outcome: "copy_available", error };
  }
}
