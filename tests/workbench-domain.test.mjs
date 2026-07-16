import assert from "node:assert/strict";
import test from "node:test";
import {
  comparisonExclusionReasons,
  deriveRunOutcome,
  normalizeRun,
  runIdentityKey
} from "../apps/web-report/workbench/src/domain/run.ts";
import { buildTimeline, categorizeEvent, groupEventsIntoSteps, safeCategoryClass, summarizeEvent } from "../apps/web-report/workbench/src/domain/trace.ts";

function result(overrides = {}) {
  return {
    agentId: "demo-fast",
    variantId: "demo-fast",
    displayLabel: "Demo Fast",
    status: "success",
    durationMs: 1200,
    tokenUsage: 100,
    estimatedCostUsd: 0.02,
    costKnown: true,
    changedFiles: ["src/a.ts"],
    judgeResults: [{ judgeId: "tests", label: "Tests", type: "test-result", success: true }],
    tracePath: "agents/demo-fast/trace.jsonl",
    ...overrides
  };
}

function run(overrides = {}) {
  return {
    runId: "run-001",
    createdAt: "2026-07-15T00:00:00.000Z",
    repository: { path: "D:/repo", revision: "abc123" },
    task: { id: "task-1", title: "Fix bug", schemaVersion: "agentarena.taskpack/v1" },
    scoreMode: "practical",
    results: [result()],
    ...overrides
  };
}

test("all-failed workbench outcome never awards a winner", () => {
  const normalized = normalizeRun(run({
    results: [
      result({ agentId: "a", variantId: "a", status: "failed", judgeResults: [] }),
      result({ agentId: "b", variantId: "b", status: "error", judgeResults: [] })
    ]
  }));
  const outcome = deriveRunOutcome(normalized);

  assert.equal(outcome.execution, "completed");
  assert.equal(outcome.evaluation, "fail");
  assert.equal(outcome.winner, null);
  assert.equal(outcome.qualifiedResults.length, 0);
});

test("mixed outcome ranks only successful evaluated agents", () => {
  const normalized = normalizeRun(run({
    results: [
      result({ agentId: "good", variantId: "good", compositeScore: 88 }),
      result({ agentId: "bad", variantId: "bad", status: "failed", compositeScore: 99 })
    ]
  }));
  const outcome = deriveRunOutcome(normalized);

  assert.equal(outcome.evaluation, "partial");
  assert.equal(outcome.winner?.variantId, "good");
  assert.deepEqual(outcome.qualifiedResults.map((item) => item.variantId), ["good"]);
});

test("unknown cost and missing trace are explicit instead of zero", () => {
  const normalized = normalizeRun(run({
    results: [result({ estimatedCostUsd: undefined, costKnown: false, tracePath: undefined })]
  }));
  const outcome = deriveRunOutcome(normalized);

  assert.equal(normalized.results[0].estimatedCostUsd, null);
  assert.equal(normalized.results[0].traceAvailability, "missing");
  assert.equal(outcome.trust.level, "partial");
  assert.ok(outcome.trust.reasons.includes("cost-unknown"));
  assert.ok(outcome.trust.reasons.includes("trace-missing"));
});

test("run identity key binds run, agent and source", () => {
  const normalized = normalizeRun(run({ source: { kind: "imported", label: "folder import" } }));
  assert.equal(runIdentityKey(normalized, "demo-fast"), "run-001::demo-fast::imported");
});

test("comparison excludes different task, revision and score mode", () => {
  const base = normalizeRun(run());
  const candidate = normalizeRun(run({
    runId: "run-002",
    repository: { path: "D:/repo", revision: "def456" },
    task: { id: "task-2", title: "Other task", schemaVersion: "agentarena.taskpack/v1" },
    scoreMode: "speed"
  }));

  assert.deepEqual(comparisonExclusionReasons(base, candidate), [
    "different-task",
    "different-revision",
    "different-score-mode"
  ]);
});

test("invalid imported payload is marked damaged without inventing results", () => {
  const normalized = normalizeRun({ runId: "broken", results: "not-an-array" });
  const outcome = deriveRunOutcome(normalized);

  assert.equal(normalized.integrity, "damaged");
  assert.deepEqual(normalized.results, []);
  assert.equal(outcome.evaluation, "incomplete");
  assert.equal(outcome.winner, null);
});

// ─── Trace domain (Phase 9) ───

function event(overrides = {}) {
  return {
    agentId: "demo-thorough",
    timestamp: "2026-07-15T08:00:01.000Z",
    type: "adapter.start",
    message: "Starting adapter",
    ...overrides
  };
}

test("categorizeEvent maps adapter/setup/judge/preflight prefixes", () => {
  assert.equal(categorizeEvent(event({ type: "setup.finish" })), "setup");
  assert.equal(categorizeEvent(event({ type: "teardown.cleanup" })), "teardown");
  assert.equal(categorizeEvent(event({ type: "judge.tests" })), "judge");
  assert.equal(categorizeEvent(event({ type: "adapter.tool_use" })), "agent");
  assert.equal(categorizeEvent(event({ type: "snapshot.write" })), "snapshot");
  assert.equal(categorizeEvent(event({ type: "preflight.result" })), "preflight");
  assert.equal(categorizeEvent(event({ type: "something.else" })), "other");
});

test("summarizeEvent prefixes type and truncates long messages", () => {
  assert.equal(summarizeEvent(event({ message: "hello world" })), "[adapter.start] hello world");
  assert.equal(summarizeEvent(event({ message: "x".repeat(300) })).length, "[adapter.start] ".length + 200);
  assert.equal(summarizeEvent(event({ message: undefined })), "[adapter.start]");
});

test("groupEventsIntoSteps splits on category change and time gap", () => {
  const steps = groupEventsIntoSteps([
    event({ timestamp: "2026-07-15T08:00:01.000Z", type: "adapter.start" }),
    event({ timestamp: "2026-07-15T08:00:01.050Z", type: "adapter.tool_use", message: "read" }),
    event({ timestamp: "2026-07-15T08:00:05.000Z", type: "judge.tests", message: "check" })
  ], 100);
  assert.equal(steps.length, 2);
  assert.equal(steps[0].events.length, 2);
  assert.equal(steps[0].category, "agent");
  assert.equal(steps[1].category, "judge");
  assert.match(steps[0].summary, /\+1 more/);
});

test("buildTimeline computes metadata and error counts", () => {
  const timeline = buildTimeline([
    event({ timestamp: "2026-07-15T08:00:01.000Z", type: "adapter.start" }),
    event({ timestamp: "2026-07-15T08:00:02.000Z", type: "adapter.error", message: "boom", metadata: {} }),
    event({ timestamp: "2026-07-15T08:00:09.500Z", type: "judge.tests" })
  ]);
  assert.equal(timeline.metadata.totalEvents, 3);
  assert.equal(timeline.metadata.errorCount, 1);
  assert.equal(timeline.metadata.agentId, "demo-thorough");
  assert.equal(timeline.metadata.durationMs, 8500);
  assert.equal(timeline.metadata.eventTypes["adapter.start"], 1);
});

test("buildTimeline handles empty event list", () => {
  const timeline = buildTimeline([]);
  assert.equal(timeline.steps.length, 0);
  assert.equal(timeline.metadata.totalEvents, 0);
  assert.equal(timeline.metadata.agentId, "unknown");
});

test("safeCategoryClass rejects unsafe input", () => {
  assert.equal(safeCategoryClass("agent"), "agent");
  assert.equal(safeCategoryClass("bad<class"), "other");
});


test("normalizeRun reads persisted file diffs when present", () => {
  const normalized = normalizeRun(run({
    results: [result({
      changedFiles: ["src/a.ts", "src/b.ts"],
      fileDiffs: [
        { path: "src/a.ts", text: "--- a.ts\n+++ a.ts\n@@ -1 +1 @@\n-old\n+new" },
        { path: "src/b.ts", hunks: ["@@ -1 +1 @@", "-x", "+y"] }
      ]
    })]
  }));
  const fileDiffs = normalized.results[0].fileDiffs;
  assert.equal(fileDiffs.length, 2);
  assert.equal(fileDiffs[0].path, "src/a.ts");
  assert.ok(fileDiffs[0].text.includes("+new"));
  assert.deepEqual(fileDiffs[1].hunks, ["@@ -1 +1 @@", "-x", "+y"]);
});

test("normalizeRun degrades to file list when no diffs stored", () => {
  const normalized = normalizeRun(run({ results: [result({ changedFiles: ["src/a.ts"] })] }));
  assert.equal(normalized.results[0].fileDiffs, undefined);
  assert.deepEqual(normalized.results[0].changedFiles, ["src/a.ts"]);
});
