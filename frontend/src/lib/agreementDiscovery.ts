// The public Base Sepolia RPC caps eth_getLogs at a 2000-block range per call. Keep
// every inclusive range comfortably below that limit.
const MAX_BLOCK_RANGE = 1900n;

type EventName =
  | "AgreementProposed"
  | "TenantParticipantAdded"
  | "ArbiterReplaced";

type DiscoveryEventArgs = {
  id?: bigint;
  landlord?: `0x${string}`;
  arbiter?: `0x${string}`;
};

export type AgreementDiscoveryClient = {
  getBlockNumber(): Promise<bigint>;
  getContractEvents(input: {
    address: `0x${string}`;
    abi: unknown;
    eventName: EventName;
    args?: Record<string, `0x${string}`>;
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<readonly unknown[]>;
};

export type AgreementDiscoveryConfig = {
  deploymentBlock: bigint;
  contractAddress: `0x${string}`;
  abi: unknown;
};

async function getChunkedEvents(
  client: AgreementDiscoveryClient,
  config: AgreementDiscoveryConfig,
  latestBlock: bigint,
  eventName: EventName,
  args?: Record<string, `0x${string}`>,
) {
  const events: DiscoveryEventArgs[] = [];
  for (
    let fromBlock = config.deploymentBlock;
    fromBlock <= latestBlock;
    fromBlock += MAX_BLOCK_RANGE + 1n
  ) {
    const toBlock =
      fromBlock + MAX_BLOCK_RANGE > latestBlock
        ? latestBlock
        : fromBlock + MAX_BLOCK_RANGE;
    const chunk = await client.getContractEvents({
      address: config.contractAddress,
      abi: config.abi,
      eventName,
      args,
      fromBlock,
      toBlock,
    });
    for (const log of chunk) {
      const eventArgs = (log as { args?: DiscoveryEventArgs }).args;
      if (eventArgs?.id !== undefined) events.push(eventArgs);
    }
  }
  return events;
}

export async function discoverAgreementIds(
  client: AgreementDiscoveryClient,
  address: `0x${string}`,
  config: AgreementDiscoveryConfig,
): Promise<bigint[]> {
  const latestBlock = await client.getBlockNumber();
  if (latestBlock < config.deploymentBlock) return [];

  const [proposed, tenantParticipations, arbiterReplacements] =
    await Promise.all([
      getChunkedEvents(
        client,
        config,
        latestBlock,
        "AgreementProposed",
      ),
      getChunkedEvents(
        client,
        config,
        latestBlock,
        "TenantParticipantAdded",
        { tenant: address },
      ),
      getChunkedEvents(
        client,
        config,
        latestBlock,
        "ArbiterReplaced",
        { newArbiter: address },
      ),
    ]);

  const normalizedAddress = address.toLowerCase();
  const ids = new Set<bigint>();
  for (const event of proposed) {
    if (
      event.landlord?.toLowerCase() === normalizedAddress ||
      event.arbiter?.toLowerCase() === normalizedAddress
    ) {
      ids.add(event.id!);
    }
  }
  for (const event of tenantParticipations) ids.add(event.id!);
  for (const event of arbiterReplacements) ids.add(event.id!);
  return Array.from(ids);
}
