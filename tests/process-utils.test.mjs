import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_AGENT_TIMEOUT_MS,
  formatTimeoutMessage,
  safeNumber,
  sleep,
  runProcess,
} from "../packages/adapters/dist/process-utils.js";

test("DEFAULT_AGENT_TIMEOUT_MS is 15 minutes", () => {
  assert.equal(DEFAULT_AGENT_TIMEOUT_MS, 15 * 60 * 1_000);
});

test("formatTimeoutMessage includes timeout value", () => {
  const msg = formatTimeoutMessage(5000);
  assert.ok(msg.includes("5000"));
  assert.ok(msg.includes("timed out"));
});

test("safeNumber returns 0 for undefined", () => {
  assert.equal(safeNumber(undefined), 0);
});

test("safeNumber returns 0 for NaN", () => {
  assert.equal(safeNumber(NaN), 0);
});

test("safeNumber returns 0 for Infinity", () => {
  assert.equal(safeNumber(Infinity), 0);
});

test("safeNumber returns value for valid numbers", () => {
  assert.equal(safeNumber(42), 42);
  assert.equal(safeNumber(0), 0);
  assert.equal(safeNumber(-1), -1);
});

test("sleep resolves after duration", async () => {
  const start = Date.now();
  await sleep(50);
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 40, `Expected >= 40ms, got ${elapsed}ms`);
});

test("sleep throws on pre-aborted signal", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => sleep(1000, controller.signal));
});

test("sleep throws when signal aborts during sleep", async () => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(() => sleep(5000, controller.signal));
});

test("runProcess collects stdout", async () => {
  const result = await runProcess(
    process.execPath,
    ["-e", "console.log('hello')"],
    process.cwd(),
    5000
  );
  assert.equal(result.exitCode, 0);
  assert.ok(result.stdout.includes("hello"));
  assert.equal(result.timedOut, false);
});

test("runProcess collects stderr", async () => {
  const result = await runProcess(
    process.execPath,
    ["-e", "console.error('warn')"],
    process.cwd(),
    5000
  );
  assert.equal(result.exitCode, 0);
  assert.ok(result.stderr.includes("warn"));
});

test("runProcess reports non-zero exit code", async () => {
  const result = await runProcess(
    process.execPath,
    ["-e", "process.exit(42)"],
    process.cwd(),
    5000
  );
  assert.equal(result.exitCode, 42);
});

test("runProcess times out for long-running process", async () => {
  const result = await runProcess(
    process.execPath,
    ["-e", "setTimeout(() => {}, 60000)"],
    process.cwd(),
    200
  );
  assert.equal(result.timedOut, true);
});

test("runProcess respects abort signal", async () => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 100);
  const result = await runProcess(
    process.execPath,
    ["-e", "setTimeout(() => {}, 60000)"],
    process.cwd(),
    30000,
    undefined,
    controller.signal
  );
  assert.ok(result.exitCode !== 0 || result.timedOut || result.error);
});

test("runProcess handles command not found", async () => {
  const result = await runProcess(
    "nonexistent-command-xyz-12345",
    [],
    process.cwd(),
    5000
  );
  assert.ok(result.exitCode !== 0 || result.error);
});
