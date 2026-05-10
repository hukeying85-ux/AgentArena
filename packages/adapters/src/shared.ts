import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  AdapterCapability,
  AdapterExecutionContext,
  AdapterPreflightOptions,
  AdapterPreflightResult,
  AgentResolvedRuntime
} from "@agentarena/core";
import { ensureDirectory } from "@agentarena/core";
import type { DemoProfile } from "./adapter-capabilities.js";

export { adapterWarn, formatAdapterError } from "./adapter-diagnostics.js";
export {
  CLAUDE_CODE_CAPABILITY,
  CODEX_CAPABILITY,
  CURSOR_CAPABILITY,
  DEMO_CAPABILITY,
  demoProfiles,
  type CodexConfigDefaults,
  type DemoProfile,
  type InvocationSpec
} from "./adapter-capabilities.js";
export {
  getAdaptersPackageVersion,
  probeClaudeLikeAuth,
  probeClaudeProfileAuth,
  probeHelp,
  probeInvocationVersion
} from "./invocation-probes.js";
export {
  readCodexConfigDefaults,
  resolveClaudeRuntime,
  resolveCodexRuntime
} from "./runtime-resolution.js";

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

export function computeTokenUsage(prompt: string, profile: DemoProfile): number {
  return Math.round(profile.tokenBase + prompt.length * profile.tokenMultiplier);
}

export function buildDemoSummary(context: AdapterExecutionContext, profile: DemoProfile): string {
  return `${profile.title} processed task "${context.task.id}" in ${profile.delayMs}ms using the demo adapter path.`;
}

export async function writeDemoArtifacts(
  context: AdapterExecutionContext,
  profile: DemoProfile
): Promise<string[]> {
  const demoDir = path.join(context.workspacePath, "agentarena-demo");
  await ensureDirectory(demoDir);

  const changedFiles: string[] = [];
  const primaryFilePath = path.join(demoDir, `${context.agentId}.md`);

  const fileBody = [
    `# ${profile.title}`,
    "",
    `Task: ${context.task.title}`,
    "",
    "Prompt:",
    context.task.prompt,
    "",
    "This file was created by the built-in demo adapter to validate the AgentArena execution pipeline."
  ].join("\n");

  await fs.writeFile(primaryFilePath, fileBody, "utf8");
  changedFiles.push("agentarena-demo/" + path.basename(primaryFilePath));

  for (let index = 1; index < profile.extraFiles; index += 1) {
    const jsonPath = path.join(demoDir, `${context.agentId}-${index}.json`);
    await fs.writeFile(
      jsonPath,
      JSON.stringify(
        {
          agentId: context.agentId,
          taskId: context.task.id,
          note: "Extra artifact for diff and report output."
        },
        null,
        2
      ),
      "utf8"
    );
    changedFiles.push("agentarena-demo/" + path.basename(jsonPath));
  }

  return changedFiles;
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
