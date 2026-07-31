import assert from "node:assert/strict";
import test from "node:test";
import {
  discoverAgreementIds,
  type AgreementDiscoveryClient,
} from "./agreementDiscovery.ts";

const account = "0x1111111111111111111111111111111111111111" as const;
const other = "0x2222222222222222222222222222222222222222" as const;
const deploymentBlock = 1_000n;
const config = {
  deploymentBlock,
  contractAddress: "0x3333333333333333333333333333333333333333" as const,
  abi: [],
};

test("wallet discovery snapshots the chain once and scans each event family once", async () => {
  let blockNumberCalls = 0;
  const eventCalls: Parameters<AgreementDiscoveryClient["getContractEvents"]>[0][] =
    [];
  const client: AgreementDiscoveryClient = {
    async getBlockNumber() {
      blockNumberCalls += 1;
      return deploymentBlock + 20n;
    },
    async getContractEvents(input) {
      eventCalls.push(input);
      if (input.eventName === "AgreementProposed") {
        return [
          { args: { id: 1n, landlord: account, arbiter: other } },
          { args: { id: 2n, landlord: other, arbiter: account.toUpperCase() } },
          { args: { id: 99n, landlord: other, arbiter: other } },
        ];
      }
      if (input.eventName === "TenantParticipantAdded") {
        return [{ args: { id: 3n } }, { args: { id: 1n } }];
      }
      return [{ args: { id: 4n } }];
    },
  };

  assert.deepEqual(
    await discoverAgreementIds(client, account, config),
    [1n, 2n, 3n, 4n],
  );
  assert.equal(blockNumberCalls, 1);
  assert.equal(eventCalls.length, 3);
  assert.deepEqual(
    eventCalls.map(({ eventName }) => eventName),
    ["AgreementProposed", "TenantParticipantAdded", "ArbiterReplaced"],
  );
  assert.equal(eventCalls[0].args, undefined);
  assert.deepEqual(eventCalls[1].args, { tenant: account });
  assert.deepEqual(eventCalls[2].args, { newArbiter: account });
});

test("wallet discovery keeps every RPC log range bounded to one chain snapshot", async () => {
  const latestBlock = deploymentBlock + 3_900n;
  let blockNumberCalls = 0;
  const eventCalls: Parameters<AgreementDiscoveryClient["getContractEvents"]>[0][] =
    [];
  const client: AgreementDiscoveryClient = {
    async getBlockNumber() {
      blockNumberCalls += 1;
      return latestBlock;
    },
    async getContractEvents(input) {
      eventCalls.push(input);
      return [];
    },
  };

  assert.deepEqual(await discoverAgreementIds(client, account, config), []);
  assert.equal(blockNumberCalls, 1);
  assert.equal(eventCalls.length, 9);
  for (const call of eventCalls) {
    assert.equal(call.toBlock <= latestBlock, true);
    assert.equal(call.toBlock - call.fromBlock <= 1_900n, true);
  }
});

test("wallet discovery skips log queries before the configured deployment block", async () => {
  let eventCalls = 0;
  const client: AgreementDiscoveryClient = {
    async getBlockNumber() {
      return deploymentBlock - 1n;
    },
    async getContractEvents() {
      eventCalls += 1;
      return [];
    },
  };

  assert.deepEqual(await discoverAgreementIds(client, account, config), []);
  assert.equal(eventCalls, 0);
});
