import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

// Import the real implementation that ships with the CLI. Previously this file
// duplicated the function in-tree; that "mirror" silently diverged from the
// shipped code. Now any drift between the test expectations and the production
// path produces a real test failure.
import { validateRunPayload } from "../packages/cli/dist/commands/run-payload-validator.js";

const CWD = process.cwd();

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

test("rejects path-traversal attempt via ../ segments resolving outside cwd", () => {
  assert.ok(validateRunPayload({
    repoPath: path.join(CWD, "..", "evil"),
    taskPath: path.join(CWD, "task.yaml"),
  }));
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

test("explicit cwd parameter is honored for path containment", () => {
  const altCwd = path.join(CWD, "subdir");
  // Repo path that is inside altCwd but outside CWD's parent
  assert.equal(validateRunPayload({
    repoPath: path.join(altCwd, "nested"),
    taskPath: path.join(altCwd, "task.yaml"),
  }, altCwd), null);
});
