import assert from "node:assert/strict";
import test from "node:test";
import {
  agreementDiscoveryErrorMessage,
  discoverAgreementIds,
  type AgreementDiscoveryClient,
} from "./agreementDiscovery.ts";

const account = "0x1111111111111111111111111111111111111111" as const;
const other = "0x2222222222222222222222222222222222222222" as const;
const zero = "0x0000000000000000000000000000000000000000" as const;
const config = {
  contractAddress: "0x3333333333333333333333333333333333333333" as const,
  abi: [],
};

test("wallet discovery reads each current agreement without scanning historical logs", async () => {
  const calls: Parameters<AgreementDiscoveryClient["readContract"]>[0][] = [];
  const client: AgreementDiscoveryClient = {
    async readContract(input) {
      calls.push(input);
      if (input.functionName === "nextAgreementId") return 4n;
      const id = input.args?.[0] as bigint;
      if (input.functionName === "tenantShareBps") return id === 2n ? 5_000n : 0n;
      if (id === 0n) return { landlord: account, arbiter: zero };
      if (id === 1n) {
        return { landlord: other, arbiter: `0x${account.slice(2).toUpperCase()}` };
      }
      return { landlord: other, arbiter: zero };
    },
  };

  assert.deepEqual(await discoverAgreementIds(client, account, config), [0n, 1n, 2n]);
  assert.equal(calls.filter(({ functionName }) => functionName === "nextAgreementId").length, 1);
  assert.equal(calls.filter(({ functionName }) => functionName === "getAgreement").length, 4);
  assert.equal(calls.filter(({ functionName }) => functionName === "tenantShareBps").length, 4);
  assert.equal(calls.some((call) => "fromBlock" in call || "toBlock" in call), false);
});

test("wallet discovery returns immediately when the contract has no agreements", async () => {
  let calls = 0;
  const client: AgreementDiscoveryClient = {
    async readContract(input) {
      calls += 1;
      assert.equal(input.functionName, "nextAgreementId");
      return 0n;
    },
  };

  assert.deepEqual(await discoverAgreementIds(client, account, config), []);
  assert.equal(calls, 1);
});

test("wallet discovery rejects an unbounded browser scan", async () => {
  const client: AgreementDiscoveryClient = {
    async readContract() {
      return 501n;
    },
  };

  await assert.rejects(
    discoverAgreementIds(client, account, config),
    /safe testnet limit/i,
  );
});

test("wallet discovery failures use consumer language without exposing RPC internals", () => {
  const message = agreementDiscoveryErrorMessage();
  assert.match(message, /couldn't reach Base Sepolia/i);
  assert.match(message, /refresh deposits/i);
  assert.doesNotMatch(message, /eth_getLogs|request body|viem|https:\/\//i);
});
