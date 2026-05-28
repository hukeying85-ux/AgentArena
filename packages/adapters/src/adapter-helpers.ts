import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  type AdapterCapability,
  type AdapterExecutionContext,
  type AdapterPreflightOptions,
  type AdapterPreflightResult,
  type AgentResolvedRuntime,
  logger
} from "@agentarena/core";

const execFileAsync = promisify(execFile);

/**
 * Tagged result mirroring runner/snapshot.ts ChangedFilesResult, but adapter-local
 * to avoid a cross-package import. When `reliable === false`, callers (adapters
 * that build `changedFilesHint`) must NOT treat empty `files` as "agent changed
 * nothing" — the data is missing, not empty.
 *
 * @see {@link ChangedFilesResult} in packages/runner/src/snapshot.ts — identical shape, kept separate to avoid cross-package import.
 */
export interface ChangedFilesHintResult {
  files: string[];
  reliable: boolean;
  reason?: string;
}

export function buildAgentPrompt(context: AdapterExecutionContext): string {
  return [
    `You are running inside AgentArena as adapter "${context.selection.baseAgentId}" and variant "${context.selection.variantId}".`,
    "Work only inside the current workspace.",
    "Complete the task using the existing repository files.",
    "Keep changes minimal and directly relevant.",
    "Do not ask follow-up questions.",
    "Stop after the work is complete.",
    "",
    `Task ID: ${context.task.id}`,
    `Task Title: ${context.task.title}`,
    `Variant Label: ${context.selection.displayLabel}`,
    ...(context.selection.config.model ? [`Requested Model: ${context.selection.config.model}`] : []),
    ...(context.selection.config.reasoningEffort
      ? [`Requested Reasoning Effort: ${context.selection.config.reasoningEffort}`]
      : []),
    "",
    "Task Prompt:",
    context.task.prompt
  ].join("\n");
}

export async function getChangedFilesFromGit(workspacePath: string): Promise<ChangedFilesHintResult> {
  try {
    const { stdout } = await execFileAsync("git", ["diff", "--name-only", "HEAD"], {
      cwd: workspacePath,
      encoding: "utf8"
    });
    return { files: stdout.trim().split("\n").filter(Boolean), reliable: true };
  } catch (error: unknown) {
    const stderr = (error instanceof Error && "stderr" in error) ? String((error as NodeJS.ErrnoException & { stderr?: string }).stderr ?? "") : "";
    const rawCode = (error instanceof Error && "code" in error) ? (error as Record<string, unknown>).code : undefined;
    if (stderr.includes("not a git repository") || rawCode === 128 || rawCode === "128") {
      return { files: [], reliable: true };
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("adapter", "git.diff_failed", `getChangedFilesFromGit failed in ${workspacePath}: ${message}`);
    return { files: [], reliable: false, reason: message };
  }
}

export function createPreflightResult(
  selection: AdapterPreflightOptions["selection"] | undefined,
  agentId: string,
  agentTitle: string,
  adapterKind: "demo" | "external",
  capability: AdapterCapability,
  status: AdapterPreflightResult["status"],
  summary: string,
  resolvedRuntime?: AgentResolvedRuntime,
  command?: string,
  details?: string[]
): AdapterPreflightResult {
  return {
    agentId: selection?.variantId ?? agentId,
    baseAgentId: agentId,
    variantId: selection?.variantId ?? agentId,
    displayLabel: selection?.displayLabel ?? agentTitle,
    requestedConfig: selection?.config ?? {},
    resolvedRuntime,
    agentTitle,
    adapterKind,
    capability,
    status,
    summary,
    command,
    details
  };
}
