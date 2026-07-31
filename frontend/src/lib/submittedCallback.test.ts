import assert from "node:assert/strict";
import test from "node:test";
import { createSubmittedCallbackSlot } from "./submittedCallback.ts";

test("a transaction completion uses its submitted callback exactly once", () => {
  const callbacks = createSubmittedCallbackSlot<string>();
  const calls: string[] = [];
  callbacks.capture((value) => calls.push(`submitted:${value}`));

  const newerRenderCallback = (value: string) => calls.push(`newer:${value}`);
  void newerRenderCallback;
  callbacks.take()?.("receipt");
  callbacks.take()?.("duplicate");

  assert.deepEqual(calls, ["submitted:receipt"]);
});
