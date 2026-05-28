import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildDiffPrecision, collectChangedFiles } from "../packages/runner/dist/snapshot.js";

/**
 * Behavior tests for the snapshot/diff reliability contract that drives
 * benchmark scoring correctness. Each test asserts the OUTCOME callers
 * depend on (reliable boolean, undefined precision when unreliable),
 * not the internal implementation.
 *
 * Prior to the fix/stabilize-and-harden review, these functions returned
 * `[]` on every failure path, causing failed git operations to silently
 * produce zero-precision scores — corrupting benchmark results.
 */

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agentarena-snapshot-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// --- collectChangedFiles tagged result ---

test("collectChangedFiles returns reliable=true with empty files when path is not a git repo", async () => {
  await withTempDir(async (dir) => {
    const result = await collectChangedFiles(dir);
    // Non-git directory is a legitimate "no diff information" case, not an error.
    assert.equal(result.reliable, true);
    assert.deepEqual(result.files, []);
  });
});

test("collectChangedFiles returns reliable=false when workspace path does not exist", async () => {
  await withTempDir(async (dir) => {
    const result = await collectChangedFiles(path.join(dir, "definitely-does-not-exist"));
    // ENOENT on the workspace is a real failure — must be marked unreliable so
    // downstream scoring doesn't pretend the agent changed zero files.
    assert.equal(result.reliable, false);
    assert.ok(result.reason && result.reason.length > 0);
    assert.deepEqual(result.files, []);
  });
});

// --- buildDiffPrecision honors reliability flag ---

test("buildDiffPrecision returns undefined when reliable=false even with expected paths", () => {
  const precision = buildDiffPrecision(["src/**"], ["src/foo.ts"], { reliable: false });
  // CRITICAL: previously this would have scored 1.0 against an unreliable diff,
  // corrupting the composite score. Now it must skip the metric entirely.
  assert.equal(precision, undefined);
});

test("buildDiffPrecision computes precision normally when reliable=true", () => {
  const precision = buildDiffPrecision(
    ["src/**"],
    ["src/foo.ts", "src/bar.ts", "docs/readme.md"],
    { reliable: true }
  );
  assert.ok(precision);
  // 2 of 3 changed files matched the expected `src/**` scope.
  assert.equal(precision.score, 2 / 3);
  assert.equal(precision.totalChangedFiles, 3);
});

test("buildDiffPrecision computes precision normally when reliable option omitted (back-compat)", () => {
  // Legacy callers (test fixtures, older code paths) didn't pass an options
  // argument. Verify the default is still "score normally" for backward
  // compatibility with the original API surface.
  const precision = buildDiffPrecision(["*.ts"], ["a.ts", "b.ts"]);
  assert.ok(precision);
  assert.equal(precision.score, 1);
});

test("buildDiffPrecision still returns undefined when expectedChangedPaths is empty", () => {
  // Independent of reliability — no expectations = no precision to score.
  const precision = buildDiffPrecision([], ["a.ts"], { reliable: true });
  assert.equal(precision, undefined);
});

test("buildDiffPrecision still returns undefined when expectedChangedPaths is undefined", () => {
  const precision = buildDiffPrecision(undefined, ["a.ts"], { reliable: true });
  assert.equal(precision, undefined);
});
