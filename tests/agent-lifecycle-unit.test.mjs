import assert from "node:assert/strict";
import test from "node:test";

import { wrapWithTimeout } from "../packages/runner/dist/timeout-utils.js";
import { normalizeSelections } from "../packages/runner/dist/normalize-selections.js";
import {
  formatErrorMessage,
  formatErrorDetails,
} from "../packages/runner/dist/workspace.js";
import {
  createBaseResult,
  createCancelledRunResult,
  createSkippedRunResult,
} from "../packages/runner/dist/result-builder.js";

// --- wrapWithTimeout ---

test("wrapWithTimeout resolves when promise completes before timeout", async () => {
  const result = await wrapWithTimeout(
    Promise.resolve("ok"),
    1000,
    "test"
  );
  assert.equal(result, "ok");
});

test("wrapWithTimeout rejects when promise rejects before timeout", async () => {
  await assert.rejects(
    () => wrapWithTimeout(Promise.reject(new Error("fail")), 1000, "test"),
    { message: "fail" }
  );
});

test("wrapWithTimeout rejects with timeout message when promise is too slow", async () => {
  await assert.rejects(
    () => wrapWithTimeout(new Promise(() => {}), 50, "my-label"),
    { message: /my-label.*timed out.*50ms/ }
  );
});

test("wrapWithTimeout clears timer on resolve", async () => {
  // If the timer isn't cleared, the test process would hang
  const result = await wrapWithTimeout(
    new Promise((resolve) => setTimeout(() => resolve("done"), 20)),
    5000,
    "test"
  );
  assert.equal(result, "done");
});

// --- normalizeSelections ---

test("normalizeSelections returns selections from agentIds", () => {
  const result = normalizeSelections({
    agentIds: ["demo-fast", "demo-thorough"],
  });
  assert.equal(result.length, 2);
  assert.equal(result[0].baseAgentId, "demo-fast");
  assert.equal(result[1].baseAgentId, "demo-thorough");
});

test("normalizeSelections deduplicates variant IDs", () => {
  const result = normalizeSelections({
    agents: [
      { baseAgentId: "demo-fast", variantId: "default", displayLabel: "Demo" },
      { baseAgentId: "demo-fast", variantId: "default", displayLabel: "Demo" },
    ],
  });
  assert.equal(result.length, 2);
  assert.equal(result[0].variantId, "default");
  assert.equal(result[1].variantId, "default-2");
  assert.ok(result[1].displayLabel.includes("#2"));
});

test("normalizeSelections preserves unique variant IDs", () => {
  const result = normalizeSelections({
    agents: [
      { baseAgentId: "demo-fast", variantId: "v1", displayLabel: "V1" },
      { baseAgentId: "demo-fast", variantId: "v2", displayLabel: "V2" },
    ],
  });
  assert.equal(result.length, 2);
  assert.equal(result[0].variantId, "v1");
  assert.equal(result[1].variantId, "v2");
});

// --- formatErrorMessage / formatErrorDetails ---

test("formatErrorMessage extracts message from Error", () => {
  const msg = formatErrorMessage(new Error("test error"));
  assert.equal(msg, "test error");
});

test("formatErrorMessage handles non-Error values", () => {
  assert.equal(formatErrorMessage("string error"), "string error");
  // null/undefined become "null"/"undefined" via String()
  assert.equal(formatErrorMessage(null), "null");
  assert.equal(formatErrorMessage(undefined), "undefined");
});

test("formatErrorDetails returns object with message and stack for Error", () => {
  const details = formatErrorDetails(new Error("test"));
  assert.equal(details.message, "test");
  assert.ok(details.stack);
});

test("formatErrorDetails handles non-Error values", () => {
  const details = formatErrorDetails("simple");
  assert.equal(details.message, "simple");
  assert.equal(details.stack, undefined);
});

// --- createCancelledRunResult / createSkippedRunResult ---

test("createCancelledRunResult has cancelled status", () => {
  const result = createCancelledRunResult(
    { agentId: "test", title: "Test", baseAgentId: "test", capabilities: {} },
    "/tmp/trace.jsonl",
    "/tmp/workspace",
    1000,
    [],
    []
  );
  assert.equal(result.status, "cancelled");
});

test("createSkippedRunResult has failed status (skipped uses failed internally)", () => {
  const result = createSkippedRunResult(
    { agentId: "test", title: "Test", baseAgentId: "test", capabilities: {}, summary: "preflight failed" },
    "/tmp/trace.jsonl",
    "/tmp/workspace"
  );
  assert.equal(result.status, "failed");
  assert.ok(result.summary.includes("preflight failed"));
});
