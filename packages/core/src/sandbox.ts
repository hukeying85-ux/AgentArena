/**
 * Workspace path boundary validation for agent execution.
 *
 * IMPORTANT: Advisory Isolation Only
 *
 * This sandbox validates that file paths stay within the workspace directory.
 * It does NOT provide:
 * - Process-level isolation (no containers, no namespaces)
 * - Network isolation
 * - Filesystem mount restrictions
 * - Privilege separation
 *
 * An adapter can bypass this sandbox entirely by not calling validate().
 * The sandbox catches accidental path escapes in well-behaved adapters,
 * not malicious code.
 *
 * SECURITY WARNING: Do NOT rely on this sandbox for defense against
 * adversarial agents. For untrusted code execution, use OS-level
 * isolation (containers, VMs, seccomp, namespaces). This module is
 * a convenience layer for catching accidental misconfigurations only.
 *
 * Modes:
 * - "off": no validation (returns true always)
 * - "warn": logs violation + trace event, returns false, does not throw
 * - "strict" (default): throws Error on violation
 */

import { logger } from "./logging.js";
import { isPathInsideWorkspace } from "./paths.js";
import type { TraceEventType } from "./types/benchmark.js";

export type SandboxMode = "off" | "warn" | "strict";

/**
 * Subset of TraceEvent that the sandbox is allowed to emit.
 * Narrowing to `TraceEventType` ensures any new sandbox event name has to be
 * added to the closed TraceEventType union before the code will compile.
 */
type SandboxTraceFn = (event: {
  type: TraceEventType;
  message: string;
  metadata?: Record<string, unknown>;
}) => Promise<void>;

/**
 * Validate that a target path is within the workspace boundary.
 * Logs violations via the trace function.
 *
 * @returns true if the path is inside the workspace, false otherwise
 */
export async function validateWorkspacePath(
  workspacePath: string,
  targetPath: string,
  context: string,
  trace: SandboxTraceFn | undefined,
  mode: SandboxMode = "strict"
): Promise<boolean> {
  if (mode === "off") return true;

  const inside = await isPathInsideWorkspace(workspacePath, targetPath);
  if (!inside) {
    const message = `[sandbox] Path access outside workspace blocked: ${context} attempted to access "${targetPath}" (workspace: "${workspacePath}")`;
    if (trace) {
      await trace({
        type: "sandbox.violation",
        message,
        metadata: { context, targetPath, workspacePath, mode }
      }).catch((err: unknown) => {
        logger.error("core", "sandbox.trace_write_failed", `Sandbox trace write failed: ${err instanceof Error ? err.message : String(err)}`, {
          error: err
        });
      });
    }
    if (mode === "strict") {
      throw new Error(message);
    }
    logger.warn("core", "sandbox.violation", message, {
      metadata: { context, targetPath, workspacePath, mode }
    });
    return false;
  }
  return true;
}

/**
 * Create a sandboxed file access helper bound to a specific workspace.
 */
export function createWorkspaceSandbox(
  workspacePath: string,
  trace: SandboxTraceFn | undefined,
  mode: SandboxMode = "strict"
) {
  return {
    async validate(targetPath: string, context: string): Promise<boolean> {
      return validateWorkspacePath(workspacePath, targetPath, context, trace, mode);
    },
    async validateOrThrow(targetPath: string, context: string): Promise<void> {
      await validateWorkspacePath(workspacePath, targetPath, context, trace, "strict");
    }
  };
}
