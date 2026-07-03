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
