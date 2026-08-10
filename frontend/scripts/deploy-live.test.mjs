import assert from "node:assert/strict";
import test from "node:test";
import { executeLiveDeploy } from "./deploy-live.mjs";

const baseOptions = {
  projectId: "appgprj_test",
  distDir: "C:\\candidate\\dist",
  hostingPath: "C:\\candidate\\.openai\\hosting.json",
  distExists: () => true,
  logger: { log() {}, error() {} },
};

test("candidate-only mode never evaluates the currently live site", () => {
  const npmCalls = [];
  const status = executeLiveDeploy({
    ...baseOptions,
    runNpmCommand: (script, args = []) => {
      npmCalls.push([script, args]);
      return 0;
    },
    runPublishCommand: () => {
      throw new Error("publish should not run");
    },
  });

  assert.equal(status, 0);
  assert.deepEqual(npmCalls, [["deploy:pilot-candidate", []]]);
});

test("approved live mode publishes before checking the new deployment", () => {
  const calls = [];
  const status = executeLiveDeploy({
    ...baseOptions,
    baseUrl: "https://example.test",
    publishCommand:
      "publish {project_id} {dist} {hosting_json} {project_id}",
    runNpmCommand: (script, args = []) => {
      calls.push(["npm", script, args]);
      return 0;
    },
    runPublishCommand: (command) => {
      calls.push(["publish", command]);
      return 0;
    },
  });

  assert.equal(status, 0);
  assert.deepEqual(calls, [
    ["npm", "deploy:pilot-candidate", []],
    [
      "publish",
      "publish appgprj_test C:\\candidate\\dist C:\\candidate\\.openai\\hosting.json appgprj_test",
    ],
    ["npm", "pilot:check:artifact", ["https://example.test"]],
  ]);
});

test("live mode requires a verification URL before running any command", () => {
  let commandCount = 0;
  const status = executeLiveDeploy({
    ...baseOptions,
    publishCommand: "publish {project_id}",
    runNpmCommand: () => {
      commandCount += 1;
      return 0;
    },
    runPublishCommand: () => {
      commandCount += 1;
      return 0;
    },
  });

  assert.equal(status, 1);
  assert.equal(commandCount, 0);
});

test("candidate and publish failures stop every dependent step", async (t) => {
  await t.test("candidate failure prevents publication", () => {
    let publishCalls = 0;
    const status = executeLiveDeploy({
      ...baseOptions,
      baseUrl: "https://example.test",
      publishCommand: "publish",
      runNpmCommand: () => 7,
      runPublishCommand: () => {
        publishCalls += 1;
        return 0;
      },
    });

    assert.equal(status, 7);
    assert.equal(publishCalls, 0);
  });

  await t.test("publish failure prevents readiness verification", () => {
    const npmCalls = [];
    const status = executeLiveDeploy({
      ...baseOptions,
      baseUrl: "https://example.test",
      publishCommand: "publish",
      runNpmCommand: (script) => {
        npmCalls.push(script);
        return 0;
      },
      runPublishCommand: () => 9,
    });

    assert.equal(status, 9);
    assert.deepEqual(npmCalls, ["deploy:pilot-candidate"]);
  });
});
