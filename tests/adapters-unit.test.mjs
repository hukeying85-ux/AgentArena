import assert from "node:assert/strict";
import test from "node:test";

import { __testUtils } from "../packages/adapters/dist/index.js";

const {
  parseCodexEvents,
  parseClaudeEvents,
  parseGeminiEvents,
  agentTimeoutMs,
  formatTimeoutMessage,
  terminateProcessTree,
  readCodexConfigDefaults
} = __testUtils;

test("agentTimeoutMs returns a positive number", () => {
  const timeout = agentTimeoutMs();
  assert.ok(typeof timeout === "number");
  assert.ok(timeout > 0);
});

test("agentTimeoutMs respects AGENTARENA_AGENT_TIMEOUT_MS env var", () => {
  const original = process.env.AGENTARENA_AGENT_TIMEOUT_MS;
  try {
    process.env.AGENTARENA_AGENT_TIMEOUT_MS = "30000";
    const timeout = agentTimeoutMs();
    assert.equal(timeout, 30000);
  } finally {
    if (original !== undefined) {
      process.env.AGENTARENA_AGENT_TIMEOUT_MS = original;
    } else {
      delete process.env.AGENTARENA_AGENT_TIMEOUT_MS;
    }
  }
});

test("formatTimeoutMessage produces human-readable message", () => {
  const message = formatTimeoutMessage(60000);
  assert.ok(message.includes("60000"));
  assert.ok(message.includes("timed out"));
});

test("terminateProcessTree handles invalid PID gracefully", async () => {
  // Should not throw for invalid PID
  await assert.doesNotReject(() => terminateProcessTree(0));
  await assert.doesNotReject(() => terminateProcessTree(-1));
});

test("terminateProcessTree handles non-existent PID gracefully", async () => {
  // Use a PID that's very unlikely to exist
  await assert.doesNotReject(() => terminateProcessTree(999999999));
});

// Test event parsing
test("parseClaudeEvents handles empty input", () => {
  const result = parseClaudeEvents("");
  assert.equal(result.tokenUsage, 0);
  assert.equal(result.estimatedCostUsd, 0);
  assert.equal(result.costKnown, false);
});

test("parseClaudeEvents parses valid JSON events", () => {
  const input = JSON.stringify({ type: "assistant", message: { content: "hello" } });
  const result = parseClaudeEvents(input);
  assert.equal(typeof result.tokenUsage, "number");
  assert.ok(result.tokenUsage >= 0);
});

test("parseCodexEvents handles empty input", () => {
  const result = parseCodexEvents("");
  assert.equal(result.tokenUsage, 0);
  assert.ok(Array.isArray(result.changedFilesHint));
});

test("parseGeminiEvents handles empty input", () => {
  const result = parseGeminiEvents("");
  assert.equal(result.tokenUsage, 0);
  assert.equal(result.estimatedCostUsd, 0);
  assert.equal(result.costKnown, false);
});

// Test runtime resolution
test("readCodexConfigDefaults returns an object", async () => {
  const defaults = await readCodexConfigDefaults();
  assert.ok(defaults !== null);
  assert.equal(typeof defaults, "object");
});
