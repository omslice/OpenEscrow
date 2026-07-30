import assert from "node:assert/strict";
import test from "node:test";
import { createAccountOperationGuard } from "./accountOperationGuard.ts";

test("account operation guard accepts the identity that started the action", () => {
  let currentIdentity: string | null = "did:privy:account-a";
  const isCurrent = createAccountOperationGuard(
    () => currentIdentity,
    currentIdentity,
  );

  assert.equal(isCurrent(), true);
});

test("account operation guard rejects a newly selected identity", () => {
  let currentIdentity: string | null = "did:privy:account-a";
  const isCurrent = createAccountOperationGuard(
    () => currentIdentity,
    currentIdentity,
  );

  currentIdentity = "did:privy:account-b";
  assert.equal(isCurrent(), false);
});

test("account operation guard fails closed when identity state is unavailable", () => {
  const isCurrent = createAccountOperationGuard(
    () => {
      throw new Error("identity state unavailable");
    },
    "did:privy:account-a",
  );

  assert.equal(isCurrent(), false);
});
