/**
 * Individual scoring metric functions.
 *
 * Each function computes a single score component (0–1) from a benchmark result.
 * These are pure functions with no side effects.
 *
 * Extracted from scoring.ts for independent testability and readability.
 */

import type { BenchmarkRun } from "@agentarena/core";
import { findJudgeByType } from "./report-helpers.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Lint error penalty multiplier (errors are 10x worse than warnings) */
export const LINT_ERROR_WEIGHT = 10;
/** Lint warning penalty multiplier */
export const LINT_WARNING_WEIGHT = 1;

// ---------------------------------------------------------------------------
// Metric functions
// ---------------------------------------------------------------------------

/**
 * Test pass ratio from judge results.
 * Returns 0 if no test judge is present or judge has no totalCount.
 * Returns 1 if judge.success is true but totalCount is 0 (edge: no tests, but judge passed).
 */
export function testPassRatio(result: BenchmarkRun["results"][number]): number {
  const judge = findJudgeByType(result, "test-result");
  if (!judge || typeof judge.totalCount !== "number") {
    return judge?.success ? 1 : 0;
  }
  return judge.totalCount > 0 ? (judge.passedCount ?? 0) / judge.totalCount : judge.success ? 1 : 0;
}

/**
 * Critical judge pass ratio.
 * Returns 1 when there are no critical judges (vacuously true: all 0 of 0 passed).
 */
export function criticalJudgePassRatio(result: BenchmarkRun["results"][number]): number {
  const criticalJudges = result.judgeResults.filter((j) => j.critical === true);
  if (criticalJudges.length === 0) {
    return 1;
  }
  return criticalJudges.filter((j) => j.success).length / criticalJudges.length;
}

/**
 * Non-critical judge pass ratio.
 * Returns 1 when there are no non-critical judges (vacuously true).
 */
export function nonCriticalJudgePassRatio(result: BenchmarkRun["results"][number]): number {
  const nonCriticalJudges = result.judgeResults.filter((j) => j.critical !== true);
  if (nonCriticalJudges.length === 0) {
    return 1;
  }
  return nonCriticalJudges.filter((j) => j.success).length / nonCriticalJudges.length;
}

/** Whether any critical judge failed. */
export function hasCriticalJudgeFailure(result: BenchmarkRun["results"][number]): boolean {
  return result.judgeResults.some((j) => j.critical === true && !j.success);
}

/**
 * fail-to-pass score (Issue Resolution mode).
 * Uses patch-validation judge success rate as proxy.
 * Returns 0 when no patch-validation judges exist.
 */
export function failToPassScore(result: BenchmarkRun["results"][number]): number {
  const patchValidationJudges = (result.judgeResults ?? []).filter(j => j.type === "patch-validation");
  if (patchValidationJudges.length === 0) return 0;
  return patchValidationJudges.filter(j => j.success).length / patchValidationJudges.length;
}

/**
 * pass-to-pass score (Issue Resolution mode).
 * Only uses explicit patch-validation data to avoid double-counting with testPassRatio.
 * Returns 0 when no explicit pass-to-pass data exists.
 */
export function passToPassScore(result: BenchmarkRun["results"][number]): number {
  const patchValidation = result.sweBench?.patchValidationResult;
  if (patchValidation?.passToPassResults && patchValidation.passToPassResults.length > 0) {
    const passed = patchValidation.passToPassResults.filter(r => r.status === "pass").length;
    return passed / patchValidation.passToPassResults.length;
  }
  return 0;
}

/**
 * Lint quality score: 1 / (1 + errors*LINT_ERROR_WEIGHT + warnings*LINT_WARNING_WEIGHT).
 * Returns 0 when no lint judge is present.
 */
export function lintQualityScore(result: BenchmarkRun["results"][number]): number {
  const judge = findJudgeByType(result, "lint-check");
  if (!judge) {
    return 0;
  }
  const errors = judge.errorCount ?? 0;
  const warnings = judge.warningCount ?? 0;
  return 1 / (1 + errors * LINT_ERROR_WEIGHT + warnings * LINT_WARNING_WEIGHT);
}

/** Duration efficiency: fastest / this result's duration (0–1, higher is better). */
export function durationEfficiencyScore(result: BenchmarkRun["results"][number], run: BenchmarkRun): number {
  const durations = run.results.map((entry) => entry.durationMs).filter((value) => value > 0);
  if (durations.length === 0) {
    // All results completed instantly — everyone is equally efficient
    return 1;
  }
  const fastest = Math.min(...durations);
  return fastest / Math.max(result.durationMs, fastest);
}

/** Cost efficiency: cheapest / this result's cost (0–1, higher is better). */
export function costEfficiencyScore(result: BenchmarkRun["results"][number], run: BenchmarkRun): number {
  const costs = run.results.filter((entry) => entry.costKnown && entry.estimatedCostUsd > 0).map((entry) => entry.estimatedCostUsd);
  if (!result.costKnown || result.estimatedCostUsd <= 0 || costs.length === 0) {
    return 0;
  }
  const cheapest = Math.min(...costs);
  return cheapest / Math.max(result.estimatedCostUsd, cheapest);
}

/**
 * Precision score: only applicable when task defines expectedChangedPaths.
 * Returns 0 when not applicable.
 */
export function precisionScore(result: BenchmarkRun["results"][number], run: BenchmarkRun): number {
  const hasExpectedPaths = run.task.expectedChangedPaths && run.task.expectedChangedPaths.length > 0;
  if (!hasExpectedPaths) {
    return 0;
  }
  return Math.max(result.diffPrecision?.score ?? 0, 0);
}

/** Resolution rate score (Issue Resolution mode). Falls back to status boolean. */
export function resolutionRateScore(result: BenchmarkRun["results"][number]): number {
  return result.sweBench?.resolutionRate ?? (result.status === "success" ? 1 : 0);
}

/** Token efficiency score component (Efficiency First / Comprehensive modes). */
export function tokenEfficiencyScoreComponent(result: BenchmarkRun["results"][number]): number {
  return result.tokenEfficiencyScore ?? 0;
}

/** Acceptance rate score (Efficiency First mode). */
export function acceptanceRateScore(result: BenchmarkRun["results"][number]): number {
  return result.cursorBench?.acceptanceRate ?? 0;
}

/** Category score (Rotating Tasks mode). Full mark on success. */
export function categoryScore(result: BenchmarkRun["results"][number]): number {
  return result.status === "success" ? 1 : 0;
}
