const MAX_BROWSER_DISCOVERY_AGREEMENTS = 500n;
const DISCOVERY_CONCURRENCY = 4;

type AgreementView = {
  landlord?: `0x${string}`;
  arbiter?: `0x${string}`;
};

export type AgreementDiscoveryClient = {
  readContract(input: {
    address: `0x${string}`;
    abi: unknown;
    functionName: "nextAgreementId" | "getAgreement" | "tenantShareBps";
    args?: readonly unknown[];
  }): Promise<unknown>;
};

export type AgreementDiscoveryConfig = {
  contractAddress: `0x${string}`;
  abi: unknown;
};

export function agreementDiscoveryErrorMessage() {
  return "OpenEscrow couldn't reach Base Sepolia to check this wallet's agreements. Wait a moment, then refresh deposits.";
}

function requiredBigInt(value: unknown, label: string) {
  if (
    typeof value !== "bigint" &&
    typeof value !== "number" &&
    typeof value !== "string"
  ) {
    throw new Error(`Base Sepolia returned an invalid ${label}.`);
  }
  try {
    const parsed = BigInt(value);
    if (parsed < 0n) throw new Error("negative");
    return parsed;
  } catch {
    throw new Error(`Base Sepolia returned an invalid ${label}.`);
  }
}

function agreementParty(value: unknown, key: keyof AgreementView) {
  if (!value || typeof value !== "object") {
    throw new Error("Base Sepolia returned an invalid agreement record.");
  }
  const candidate = (value as AgreementView)[key];
  if (typeof candidate !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(candidate)) {
    throw new Error("Base Sepolia returned an invalid agreement record.");
  }
  return candidate.toLowerCase();
}

async function accountParticipates(
  client: AgreementDiscoveryClient,
  address: `0x${string}`,
  id: bigint,
  config: AgreementDiscoveryConfig,
) {
  const [agreement, share] = await Promise.all([
    client.readContract({
      address: config.contractAddress,
      abi: config.abi,
      functionName: "getAgreement",
      args: [id],
    }),
    client.readContract({
      address: config.contractAddress,
      abi: config.abi,
      functionName: "tenantShareBps",
      args: [id, address],
    }),
  ]);
  const normalizedAddress = address.toLowerCase();
  return (
    agreementParty(agreement, "landlord") === normalizedAddress ||
    agreementParty(agreement, "arbiter") === normalizedAddress ||
    requiredBigInt(share, "tenant share") > 0n
  );
}

export async function discoverAgreementIds(
  client: AgreementDiscoveryClient,
  address: `0x${string}`,
  config: AgreementDiscoveryConfig,
): Promise<bigint[]> {
  const agreementCount = requiredBigInt(
    await client.readContract({
      address: config.contractAddress,
      abi: config.abi,
      functionName: "nextAgreementId",
    }),
    "agreement count",
  );
  if (agreementCount > MAX_BROWSER_DISCOVERY_AGREEMENTS) {
    throw new Error("Browser agreement discovery has reached its safe testnet limit.");
  }

  const matches: bigint[] = [];
  for (let start = 0n; start < agreementCount; start += BigInt(DISCOVERY_CONCURRENCY)) {
    const remaining = agreementCount - start;
    const batchSize = Number(
      remaining < BigInt(DISCOVERY_CONCURRENCY)
        ? remaining
        : BigInt(DISCOVERY_CONCURRENCY),
    );
    const ids = Array.from(
      { length: batchSize },
      (_, index) => start + BigInt(index),
    );
    const participation = await Promise.all(
      ids.map((id) => accountParticipates(client, address, id, config)),
    );
    ids.forEach((id, index) => {
      if (participation[index]) matches.push(id);
    });
  }
  return matches;
}
