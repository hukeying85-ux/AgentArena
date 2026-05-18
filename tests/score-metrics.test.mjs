import assert from "node:assert/strict";
import test from "node:test";

import {
  testPassRatio,
  criticalJudgePassRatio,
  nonCriticalJudgePassRatio,
  hasCriticalJudgeFailure,
  failToPassScore,
  passToPassScore,
  lintQualityScore,
  durationEfficiencyScore,
  costEfficiencyScore,
  precisionScore,
  resolutionRateScore,
  tokenEfficiencyScoreComponent,
  acceptanceRateScore,
  categoryScore,
  LINT_ERROR_WEIGHT,
  LINT_WARNING_WEIGHT,
} from "../packages/report/dist/score-metrics.js";

function makeResult(overrides = {}) {
  return {
    agentId: "test",
    baseAgentId: "test",
    variantId: "default",
    displayLabel: "Test",
    status: "success",
    durationMs: 5000,
    tokenUsage: 1000,
    estimatedCostUsd: 0.05,
    costKnown: true,
    changedFiles: [],
    judgeResults: [],
    ...overrides,
  };
}

function makeRun(results) {
  return {
    runId: "test",
    createdAt: new Date().toISOString(),
    task: { id: "test", title: "Test", prompt: "Fix it" },
    scoreMode: "practical",
    results: results || [makeResult()],
  };
}

// --- LINT_ERROR_WEIGHT / LINT_WARNING_WEIGHT ---

test("LINT_ERROR_WEIGHT is 10", () => {
  assert.equal(LINT_ERROR_WEIGHT, 10);
});

test("LINT_WARNING_WEIGHT is 1", () => {
  assert.equal(LINT_WARNING_WEIGHT, 1);
});

// --- testPassRatio ---

test("testPassRatio returns 0 when no test judge", () => {
  assert.equal(testPassRatio(makeResult()), 0);
});

test("testPassRatio returns 1 when judge has totalCount 0 and success true", () => {
  const result = makeResult({
    judgeResults: [{ type: "test-result", success: true, totalCount: 0, passedCount: 0 }],
  });
  assert.equal(testPassRatio(result), 1);
});

test("testPassRatio computes ratio correctly", () => {
  const result = makeResult({
    judgeResults: [{ type: "test-result", success: false, totalCount: 10, passedCount: 7 }],
  });
  assert.equal(testPassRatio(result), 0.7);
});

// --- criticalJudgePassRatio ---

test("criticalJudgePassRatio returns 1 when no critical judges", () => {
  assert.equal(criticalJudgePassRatio(makeResult()), 1);
});

test("criticalJudgePassRatio computes ratio for critical judges", () => {
  const result = makeResult({
    judgeResults: [
      { type: "test-result", success: true, critical: true },
      { type: "lint-check", success: false, critical: true },
    ],
  });
  assert.equal(criticalJudgePassRatio(result), 0.5);
});

// --- nonCriticalJudgePassRatio ---

test("nonCriticalJudgePassRatio returns 1 when no non-critical judges", () => {
  const result = makeResult({
    judgeResults: [{ type: "test-result", success: true, critical: true }],
  });
  assert.equal(nonCriticalJudgePassRatio(result), 1);
});

// --- hasCriticalJudgeFailure ---

test("hasCriticalJudgeFailure returns false when no critical judges fail", () => {
  const result = makeResult({
    judgeResults: [{ type: "test-result", success: true, critical: true }],
  });
  assert.equal(hasCriticalJudgeFailure(result), false);
});

test("hasCriticalJudgeFailure returns true when a critical judge fails", () => {
  const result = makeResult({
    judgeResults: [{ type: "test-result", success: false, critical: true }],
  });
  assert.equal(hasCriticalJudgeFailure(result), true);
});

// --- lintQualityScore ---

test("lintQualityScore returns 0 when no lint judge", () => {
  assert.equal(lintQualityScore(makeResult()), 0);
});

test("lintQualityScore returns 1 when lint judge has no errors or warnings", () => {
  const result = makeResult({
    judgeResults: [{ type: "lint-check", success: true, errorCount: 0, warningCount: 0 }],
  });
  assert.equal(lintQualityScore(result), 1);
});

test("lintQualityScore penalizes errors more than warnings", () => {
  const withError = makeResult({
    judgeResults: [{ type: "lint-check", success: false, errorCount: 1, warningCount: 0 }],
  });
  const withWarning = makeResult({
    judgeResults: [{ type: "lint-check", success: false, errorCount: 0, warningCount: 1 }],
  });
  assert.ok(lintQualityScore(withWarning) > lintQualityScore(withError));
});

// --- durationEfficiencyScore ---

test("durationEfficiencyScore returns 0 when no results", () => {
  const run = makeRun([]);
  assert.equal(durationEfficiencyScore(makeResult(), run), 0);
});

test("durationEfficiencyScore returns 1 when this is the fastest", () => {
  const result = makeResult({ durationMs: 1000 });
  const run = makeRun([result, makeResult({ agentId: "b", durationMs: 2000 })]);
  assert.equal(durationEfficiencyScore(result, run), 1);
});

test("durationEfficiencyScore returns < 1 when slower than fastest", () => {
  const fast = makeResult({ agentId: "fast", durationMs: 1000 });
  const slow = makeResult({ agentId: "slow", durationMs: 2000 });
  const run = makeRun([fast, slow]);
  assert.equal(durationEfficiencyScore(slow, run), 0.5);
});

// --- costEfficiencyScore ---

test("costEfficiencyScore returns 0 when cost not known", () => {
  const result = makeResult({ costKnown: false });
  const run = makeRun([result]);
  assert.equal(costEfficiencyScore(result, run), 0);
});

test("costEfficiencyScore returns 1 when cheapest", () => {
  const cheap = makeResult({ agentId: "cheap", costKnown: true, estimatedCostUsd: 0.01 });
  const expensive = makeResult({ agentId: "expensive", costKnown: true, estimatedCostUsd: 0.1 });
  const run = makeRun([cheap, expensive]);
  assert.equal(costEfficiencyScore(cheap, run), 1);
});

// --- precisionScore ---

test("precisionScore returns 0 when no expectedChangedPaths", () => {
  const run = makeRun();
  assert.equal(precisionScore(makeResult(), run), 0);
});

test("precisionScore returns diffPrecision score when paths defined", () => {
  const run = makeRun();
  run.task.expectedChangedPaths = ["src/index.ts"];
  const result = makeResult({ diffPrecision: { score: 0.8 } });
  assert.equal(precisionScore(result, run), 0.8);
});

// --- resolutionRateScore ---

test("resolutionRateScore falls back to status", () => {
  assert.equal(resolutionRateScore(makeResult({ status: "success" })), 1);
  assert.equal(resolutionRateScore(makeResult({ status: "failed" })), 0);
});

test("resolutionRateScore uses sweBench.resolutionRate when available", () => {
  const result = makeResult({ sweBench: { resolutionRate: 0.75 } });
  assert.equal(resolutionRateScore(result), 0.75);
});

// --- tokenEfficiencyScoreComponent ---

test("tokenEfficiencyScoreComponent returns 0 when not set", () => {
  assert.equal(tokenEfficiencyScoreComponent(makeResult()), 0);
});

test("tokenEfficiencyScoreComponent returns value when set", () => {
  assert.equal(tokenEfficiencyScoreComponent(makeResult({ tokenEfficiencyScore: 0.9 })), 0.9);
});

// --- acceptanceRateScore ---

test("acceptanceRateScore returns 0 when not set", () => {
  assert.equal(acceptanceRateScore(makeResult()), 0);
});

test("acceptanceRateScore returns value when set", () => {
  assert.equal(acceptanceRateScore(makeResult({ cursorBench: { acceptanceRate: 0.85 } })), 0.85);
});

// --- categoryScore ---

test("categoryScore returns 1 for success", () => {
  assert.equal(categoryScore(makeResult({ status: "success" })), 1);
});

test("categoryScore returns 0 for failed", () => {
  assert.equal(categoryScore(makeResult({ status: "failed" })), 0);
});

// --- failToPassScore / passToPassScore ---

test("failToPassScore returns 0 when no patch-validation judges", () => {
  assert.equal(failToPassScore(makeResult()), 0);
});

test("failToPassScore computes ratio for patch-validation judges", () => {
  const result = makeResult({
    judgeResults: [
      { type: "patch-validation", success: true },
      { type: "patch-validation", success: false },
    ],
  });
  assert.equal(failToPassScore(result), 0.5);
});

test("passToPassScore returns 0 when no data", () => {
  assert.equal(passToPassScore(makeResult()), 0);
});
