import assert from "node:assert/strict";
import test from "node:test";

import { buildExecutionEnvironment } from "../packages/core/dist/env.js";

test("buildExecutionEnvironment includes baseline env vars", () => {
  process.env.TEST_BASELINE_VAR = "hello";
  const env = buildExecutionEnvironment(["TEST_BASELINE_VAR"]);
  assert.equal(env.TEST_BASELINE_VAR, "hello");
  delete process.env.TEST_BASELINE_VAR;
});

test("buildExecutionEnvironment blocks dangerous env vars", () => {
  process.env.LD_PRELOAD = "/evil/lib.so";
  const env = buildExecutionEnvironment(["LD_PRELOAD"]);
  assert.equal(env.LD_PRELOAD, undefined);
  delete process.env.LD_PRELOAD;
});

test("buildExecutionEnvironment applies overrides", () => {
  const env = buildExecutionEnvironment([], { CUSTOM_VAR: "override-value" });
  assert.equal(env.CUSTOM_VAR, "override-value");
});

test("buildExecutionEnvironment blocks overrides of dangerous vars", () => {
  const env = buildExecutionEnvironment([], { NODE_OPTIONS: "--inspect" });
  assert.equal(env.NODE_OPTIONS, undefined);
});

test("buildExecutionEnvironment reads AGENTARENA_EXTRA_ENV", () => {
  process.env.AGENTARENA_EXTRA_ENV = "MY_CUSTOM_VAR,ANOTHER_VAR";
  process.env.MY_CUSTOM_VAR = "custom-value";
  process.env.ANOTHER_VAR = "another-value";
  const env = buildExecutionEnvironment([]);
  assert.equal(env.MY_CUSTOM_VAR, "custom-value");
  assert.equal(env.ANOTHER_VAR, "another-value");
  delete process.env.AGENTARENA_EXTRA_ENV;
  delete process.env.MY_CUSTOM_VAR;
  delete process.env.ANOTHER_VAR;
});

test("buildExecutionEnvironment skips undefined env vars", () => {
  const env = buildExecutionEnvironment(["TOTALLY_NONEXISTENT_VAR_12345"]);
  assert.equal(env.TOTALLY_NONEXISTENT_VAR_12345, undefined);
});

test("taskpack allowlists cannot implicitly inherit Git credential helpers", () => {
  const sensitiveNames = ["GIT_ASKPASS", "GIT_SSH_COMMAND", "GCM_INTERACTIVE"];
  const previous = Object.fromEntries(sensitiveNames.map((name) => [name, process.env[name]]));

  try {
    process.env.GIT_ASKPASS = "credential-helper";
    process.env.GIT_SSH_COMMAND = "ssh -i private-key";
    process.env.GCM_INTERACTIVE = "always";

    const env = buildExecutionEnvironment(sensitiveNames);

    assert.equal(env.GIT_ASKPASS, undefined);
    assert.equal(env.GIT_SSH_COMMAND, undefined);
    assert.equal(env.GCM_INTERACTIVE, undefined);
  } finally {
    for (const name of sensitiveNames) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("operators can explicitly pass a Git credential helper", () => {
  const previousExtraEnv = process.env.AGENTARENA_EXTRA_ENV;
  const previousAskpass = process.env.GIT_ASKPASS;

  try {
    process.env.AGENTARENA_EXTRA_ENV = "GIT_ASKPASS";
    process.env.GIT_ASKPASS = "operator-approved-helper";

    const env = buildExecutionEnvironment(["GIT_ASKPASS"]);

    assert.equal(env.GIT_ASKPASS, "operator-approved-helper");
  } finally {
    if (previousExtraEnv === undefined) delete process.env.AGENTARENA_EXTRA_ENV;
    else process.env.AGENTARENA_EXTRA_ENV = previousExtraEnv;
    if (previousAskpass === undefined) delete process.env.GIT_ASKPASS;
    else process.env.GIT_ASKPASS = previousAskpass;
  }
});
