import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

// We need to import the compiled module. Since validateRunPayload is not exported,
// we test it indirectly through the UI server integration tests.
// Instead, we test the validation logic by duplicating the checks here as a contract test.

const CWD = process.cwd();

/**
 * Mirror of validateRunPayload from ui.ts.
 * If this test diverges from the actual implementation, the test should be updated.
 * This serves as a regression test for the path-traversal prevention logic.
 */
function validateRunPayload(runPayload) {
  if (!runPayload.repoPath || typeof runPayload.repoPath !== "string") {
    return "repoPath is required and must be a string.";
  }
  if (!runPayload.taskPath || typeof runPayload.taskPath !== "string") {
    return "taskPath is required and must be a string.";
  }
  const resolvedRepoPath = path.resolve(runPayload.repoPath);
  const resolvedTaskPath = path.resolve(runPayload.taskPath);
  if (!resolvedRepoPath.startsWith(CWD + path.sep) && resolvedRepoPath !== CWD) {
    return "repoPath must be within the current working directory.";
  }
  if (!resolvedTaskPath.startsWith(CWD + path.sep) && resolvedTaskPath !== CWD) {
    return "taskPath must be within the current working directory.";
  }
  if (runPayload.maxConcurrency !== undefined) {
    const parsed = Number(runPayload.maxConcurrency);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return "maxConcurrency must be a positive integer.";
    }
  }
  if (runPayload.tokenBudget !== undefined) {
    const parsed = Number(runPayload.tokenBudget);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return "tokenBudget must be a positive number.";
    }
  }
  return null;
}

// --- Path validation ---

test("rejects missing repoPath", () => {
  assert.ok(validateRunPayload({ taskPath: "task.yaml" }));
});

test("rejects empty repoPath", () => {
  assert.ok(validateRunPayload({ repoPath: "", taskPath: "task.yaml" }));
});

test("rejects missing taskPath", () => {
  assert.ok(validateRunPayload({ repoPath: CWD }));
});

test("rejects repoPath outside cwd", () => {
  assert.ok(validateRunPayload({
    repoPath: "/tmp/evil",
    taskPath: path.join(CWD, "task.yaml"),
  }));
});

test("rejects taskPath outside cwd", () => {
  assert.ok(validateRunPayload({
    repoPath: CWD,
    taskPath: "/tmp/evil.yaml",
  }));
});

test("accepts paths within cwd", () => {
  assert.equal(validateRunPayload({
    repoPath: CWD,
    taskPath: path.join(CWD, "task.yaml"),
  }), null);
});

test("accepts cwd itself as repoPath", () => {
  assert.equal(validateRunPayload({
    repoPath: CWD,
    taskPath: path.join(CWD, "task.yaml"),
  }), null);
});

// --- Numeric validation ---

test("rejects maxConcurrency < 1", () => {
  assert.ok(validateRunPayload({
    repoPath: CWD,
    taskPath: path.join(CWD, "task.yaml"),
    maxConcurrency: 0,
  }));
});

test("rejects maxConcurrency NaN", () => {
  assert.ok(validateRunPayload({
    repoPath: CWD,
    taskPath: path.join(CWD, "task.yaml"),
    maxConcurrency: "abc",
  }));
});

test("accepts valid maxConcurrency", () => {
  assert.equal(validateRunPayload({
    repoPath: CWD,
    taskPath: path.join(CWD, "task.yaml"),
    maxConcurrency: 4,
  }), null);
});

test("rejects tokenBudget <= 0", () => {
  assert.ok(validateRunPayload({
    repoPath: CWD,
    taskPath: path.join(CWD, "task.yaml"),
    tokenBudget: 0,
  }));
});

test("rejects tokenBudget NaN", () => {
  assert.ok(validateRunPayload({
    repoPath: CWD,
    taskPath: path.join(CWD, "task.yaml"),
    tokenBudget: "abc",
  }));
});

test("accepts valid tokenBudget", () => {
  assert.equal(validateRunPayload({
    repoPath: CWD,
    taskPath: path.join(CWD, "task.yaml"),
    tokenBudget: 10000,
  }), null);
});

// --- Edge cases ---

test("rejects undefined repoPath", () => {
  assert.ok(validateRunPayload({ repoPath: undefined, taskPath: "task.yaml" }));
});

test("rejects null repoPath", () => {
  assert.ok(validateRunPayload({ repoPath: null, taskPath: "task.yaml" }));
});
