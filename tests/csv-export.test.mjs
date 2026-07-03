import assert from "node:assert/strict";
import test from "node:test";

import { generateCsv } from "../packages/report/dist/csv-export.js";

function makeRun(overrides) {
  return {
    runId: "csv-test",
    createdAt: "2026-01-01T00:00:00Z",
    repoPath: ".",
    outputPath: "./output",
    task: { id: "test", title: "Test" },
    results: [],
    ...overrides,
  };
}

test("generateCsv produces header row", () => {
  const run = makeRun();
  const csv = generateCsv(run);
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Agent/);
  assert.match(lines[0], /Composite Score/);
  assert.match(lines[0], /Duration \(ms\)/);
});

test("generateCsv escapes commas in fields", () => {
  const run = makeRun({
    results: [{
      agentId: "a1",
      displayLabel: "Agent, Special",
      baseAgentId: "a1",
      variantId: "v1",
      status: "success",
      summary: "ok",
      compositeScore: 80,
      durationMs: 1000,
      tokenUsage: 500,
      estimatedCostUsd: 0.01,
      costKnown: true,
      changedFiles: [],
      judgeResults: [],
      resolvedRuntime: { effectiveModel: "claude", effectiveAgentVersion: "1.0", providerSource: "official", providerProfileName: "Official" },
    }],
  });
  const csv = generateCsv(run);
  assert.match(csv, /"Agent, Special"/);
});

test("generateCsv escapes formula-injection characters", () => {
  const run = makeRun({
    results: [{
      agentId: "a1",
      displayLabel: "=SUM(A1:A10)",
      baseAgentId: "a1",
      variantId: "v1",
      status: "success",
      summary: "ok",
      compositeScore: 50,
      durationMs: 1000,
      tokenUsage: 500,
      estimatedCostUsd: 0.01,
      costKnown: true,
      changedFiles: [],
      judgeResults: [],
      resolvedRuntime: {},
    }],
  });
  const csv = generateCsv(run);
  assert.match(csv, /'=SUM\(A1:A10\)/);
});

test("generateCsv handles empty results", () => {
  const run = makeRun();
  const csv = generateCsv(run);
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 1);
});
