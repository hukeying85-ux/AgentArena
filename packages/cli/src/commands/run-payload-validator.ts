/**
 * Validation of UI run payloads.
 *
 * Extracted to its own module so the test suite can import the exact
 * implementation that ships, rather than maintaining a hand-duplicated
 * mirror that silently drifts (see CRITICAL #13 in fix/stabilize-and-harden review).
 */

import path from "node:path";
import type { UiRunPayload } from "./shared.js";

/**
 * Validate a run payload from the UI.
 * Returns null when valid, or an actionable error message string when invalid.
 *
 * Path checks intentionally take an explicit `cwd` rather than calling `process.cwd()`
 * directly, so unit tests can exercise the function deterministically and so the
 * same code path can be used from contexts that switch working directories.
 */
export function validateRunPayload(runPayload: UiRunPayload, cwd: string = process.cwd()): string | null {
  if (!runPayload.repoPath || typeof runPayload.repoPath !== "string") {
    return "repoPath is required and must be a string.";
  }
  if (!runPayload.taskPath || typeof runPayload.taskPath !== "string") {
    return "taskPath is required and must be a string.";
  }
  // Path containment checks (defense against path traversal — must resolve, not
  // string-prefix-match the raw input).
  const resolvedRepoPath = path.resolve(runPayload.repoPath);
  const resolvedTaskPath = path.resolve(runPayload.taskPath);
  if (!resolvedRepoPath.startsWith(cwd + path.sep) && resolvedRepoPath !== cwd) {
    return "repoPath must be within the current working directory.";
  }
  if (!resolvedTaskPath.startsWith(cwd + path.sep) && resolvedTaskPath !== cwd) {
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
