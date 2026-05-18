import assert from "node:assert/strict";
import test from "node:test";

import {
  taskIntentSummary,
  summarizeTaskPrompt,
  statusClass,
} from "../apps/web-report/src/task-utils.js";

// --- taskIntentSummary ---

test("taskIntentSummary extracts objective from metadata", () => {
  const task = { metadata: { objective: "Fix the bug", judgeRationale: "Tests pass" }, description: "fallback" };
  const result = taskIntentSummary(task);
  assert.equal(result.objective, "Fix the bug");
  assert.equal(result.rationale, "Tests pass");
});

test("taskIntentSummary falls back to description when no metadata.objective", () => {
  const task = { description: "Fix the bug" };
  const result = taskIntentSummary(task);
  assert.equal(result.objective, "Fix the bug");
});

test("taskIntentSummary returns empty string when no objective or description", () => {
  const task = {};
  const result = taskIntentSummary(task);
  assert.equal(result.objective, "");
});

test("taskIntentSummary extracts repoTypes from metadata", () => {
  const task = { metadata: { repoTypes: ["node", "python"] } };
  const result = taskIntentSummary(task);
  assert.equal(result.repoTypes, "node, python");
});

test("taskIntentSummary defaults repoTypes to generic", () => {
  const task = {};
  const result = taskIntentSummary(task);
  assert.equal(result.repoTypes, "generic");
});

// --- summarizeTaskPrompt ---

test("summarizeTaskPrompt returns n/a for empty input", () => {
  assert.equal(summarizeTaskPrompt(""), "n/a");
  assert.equal(summarizeTaskPrompt(null), "n/a");
  assert.equal(summarizeTaskPrompt(undefined), "n/a");
});

test("summarizeTaskPrompt collapses whitespace", () => {
  assert.equal(summarizeTaskPrompt("  fix   the   bug  "), "fix the bug");
});

test("summarizeTaskPrompt truncates at 160 chars", () => {
  const long = "x".repeat(200);
  const result = summarizeTaskPrompt(long);
  assert.ok(result.length <= 160);
  assert.ok(result.endsWith("..."));
});

test("summarizeTaskPrompt does not truncate short prompts", () => {
  const result = summarizeTaskPrompt("fix the bug");
  assert.equal(result, "fix the bug");
});

// --- statusClass ---

test("statusClass returns status-{value}", () => {
  assert.equal(statusClass("success"), "status-success");
  assert.equal(statusClass("failed"), "status-failed");
  assert.equal(statusClass("cancelled"), "status-cancelled");
});
