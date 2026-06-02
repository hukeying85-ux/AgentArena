import { promises as fs } from "node:fs";
import path from "node:path";
import { getAdapter } from "@agentarena/adapters";
import {
  type AdapterPreflightResult,
  type AgentRunResult,
  type BenchmarkCancellation,
  buildExecutionEnvironment,
  type CommandStepResult,
  copyRepository,
  createWorkspaceSandbox,
  type DiffPrecisionSummary,
  type DiffSummary,
  diffSnapshots,
  ensureDirectory,
  isAbortError,
  logger,
  metrics,
  snapshotDirectory,
  type TraceEvent,
  throwIfAborted,
} from "@agentarena/core";
import { runCommandSteps, runJudges } from "@agentarena/judges";
import type { loadTaskPack } from "@agentarena/taskpacks";
import { JsonlTraceRecorder } from "@agentarena/trace";
import { agentExecuteTimeoutMs } from "./concurrency.js";
import {
  buildChangedFiles,
  createBaseResult,
  createCancellationSummary,
  createCancelledRunResult,
  createSkippedRunResult,
  mergeResolvedRuntime,
  summarizeCommandStepFailure
} from "./result-builder.js";
import { buildDiffPrecision, collectChangedFiles } from "./snapshot.js";
import { wrapWithTimeout } from "./timeout-utils.js";
import { debugLog, formatErrorDetails, formatErrorMessage } from "./workspace.js";

const AGENT_EXECUTE_TIMEOUT_GRACE_MS = 5_000;
/** Timeout for teardown commands (30 seconds) */
const TEARDOWN_TIMEOUT_MS = 30_000;

export interface AgentRunContext {
  task: Awaited<ReturnType<typeof loadTaskPack>>;
  adapter: ReturnType<typeof getAdapter>;
  agentOutputPath: string;
  workspacePath: string;
  tracePath: string;
  traceRecorder: JsonlTraceRecorder;
  executionEnvironment: ReturnType<typeof buildExecutionEnvironment>;
  cancellation: BenchmarkCancellation | undefined;
  throwIfCancelled: (stage: string) => void;
  debug: boolean;
}

export async function createAgentRunContext(
  outputPath: string,
  workspaceRootPath: string,
  task: Awaited<ReturnType<typeof loadTaskPack>>,
  preflight: AdapterPreflightResult,
  options: { updateSnapshots?: boolean; cancellation?: BenchmarkCancellation; debug?: boolean }
): Promise<AgentRunContext> {
  const adapter = getAdapter(preflight.baseAgentId);
  const agentOutputPath = path.join(outputPath, "agents", preflight.variantId);
  const workspacePath = path.join(workspaceRootPath, preflight.variantId);
  const tracePath = path.join(agentOutputPath, "trace.jsonl");
  const traceRecorder = new JsonlTraceRecorder(tracePath);
  const executionEnvironment = buildExecutionEnvironment(task.envAllowList);
  const cancellation = options.cancellation;
  const throwIfCancelled = (stage: string) => {
    throwIfAborted(cancellation?.signal, createCancellationSummary(stage));
  };
  return {
    task,
    adapter,
    agentOutputPath,
    workspacePath,
    tracePath,
    traceRecorder,
    executionEnvironment,
    cancellation,
    throwIfCancelled,
    debug: options.debug ?? false
  };
}

export async function setupWorkspaceAndPrechecks(
  repoPath: string,
  preflight: AdapterPreflightResult,
  context: AgentRunContext
): Promise<AgentRunResult | undefined> {
  const { agentOutputPath, workspacePath, traceRecorder, throwIfCancelled } = context;

  if (preflight.status === "missing" || preflight.status === "blocked") {
    await ensureDirectory(agentOutputPath);
    await traceRecorder.record({
      agentId: preflight.agentId,
      timestamp: new Date().toISOString(),
      type: "preflight.result",
      message: preflight.summary,
      metadata: {
        status: preflight.status,
        command: preflight.command,
        details: preflight.details
      }
    });
    await traceRecorder.record({
      agentId: preflight.agentId,
      timestamp: new Date().toISOString(),
      type: "agent.skipped",
      message: `Skipped ${preflight.agentId} because preflight status is ${preflight.status}.`,
      metadata: {
        status: preflight.status
      }
    });
    return createSkippedRunResult(preflight, context.tracePath, workspacePath);
  }

  await ensureDirectory(agentOutputPath);

  throwIfCancelled("workspace setup");

  try {
    await copyRepository(repoPath, workspacePath);
  } catch (error) {
    const errorDetails = formatErrorDetails(error);
    await traceRecorder.record({
      agentId: preflight.agentId,
      timestamp: new Date().toISOString(),
      type: "agent.copy_failed",
      message: "Failed to copy repository to workspace.",
      metadata: errorDetails
    });
    return {
      ...createSkippedRunResult(preflight, context.tracePath, workspacePath),
      summary: `Failed to copy repository: ${errorDetails.message}`
    };
  }

  await traceRecorder.record({
    agentId: preflight.agentId,
    timestamp: new Date().toISOString(),
    type: "preflight.result",
    message: preflight.summary,
    metadata: {
      status: preflight.status,
      command: preflight.command,
      details: preflight.details
    }
  });

  return undefined;
}

export async function runSetupCommands(
  preflight: AdapterPreflightResult,
  context: AgentRunContext
): Promise<{ setupResults: CommandStepResult[]; earlyResult?: AgentRunResult }> {
  const { task, workspacePath, traceRecorder, throwIfCancelled, cancellation } = context;

  let setupResults: CommandStepResult[] = [];
  try {
    throwIfCancelled("setup");
    setupResults = await runCommandSteps(task.setupCommands, workspacePath, task.envAllowList, cancellation?.signal);
  } catch (error) {
    if (isAbortError(error)) {
      return {
        setupResults: [],
        earlyResult: createCancelledRunResult(preflight, context.tracePath, workspacePath, formatErrorMessage(error))
      };
    }
    const errorDetails = formatErrorDetails(error);
    await traceRecorder.record({
      agentId: preflight.agentId,
      timestamp: new Date().toISOString(),
      type: "setup.error",
      message: "Setup commands execution failed.",
      metadata: errorDetails
    });
    return {
      setupResults: [],
      earlyResult: {
        ...createSkippedRunResult(preflight, context.tracePath, workspacePath),
        summary: `Setup commands failed: ${errorDetails.message}`,
        setupResults: []
      }
    };
  }

  await traceRecorder.record({
    agentId: preflight.agentId,
    timestamp: new Date().toISOString(),
    type: "setup.finish",
    message:
      setupResults.length === 0
        ? "No setup commands executed."
        : setupResults.every((value) => value.success)
          ? "All setup commands passed."
          : "One or more setup commands failed.",
    metadata: {
      setupResults: setupResults.map((value) => ({
        stepId: value.stepId,
        label: value.label,
        success: value.success,
        exitCode: value.exitCode
      }))
    }
  });

  if (setupResults.some((value) => !value.success)) {
    const failedStep = setupResults.find((value) => !value.success) ?? setupResults[0];
    return {
      setupResults,
      earlyResult: createBaseResult({
        preflight,
        tracePath: context.tracePath,
        workspacePath,
        status: "failed",
        summary: failedStep
          ? summarizeCommandStepFailure("setup", failedStep)
          : "Setup command failed but no result was captured.",
        setupResults
      })
    };
  }

  return { setupResults, earlyResult: undefined };
}

export interface BeforeSnapshotResult {
  snapshot: Map<string, { relativePath: string; hash: string }>;
  reliable: boolean;
  reason?: string;
}

export async function createBeforeSnapshot(
  preflight: AdapterPreflightResult,
  context: AgentRunContext
): Promise<BeforeSnapshotResult> {
  const { workspacePath, traceRecorder } = context;

  try {
    return { snapshot: await snapshotDirectory(workspacePath), reliable: true };
  } catch (error) {
    const errorDetails = formatErrorDetails(error);
    await traceRecorder.record({
      agentId: preflight.agentId,
      timestamp: new Date().toISOString(),
      type: "snapshot.before_failed",
      message: "Failed to create before snapshot. Diff will be marked unreliable.",
      metadata: errorDetails
    });
    logger.warn("runner", "snapshot.before_failed", `Before snapshot failed for ${preflight.agentId}: ${errorDetails.message}. Diff marked unreliable.`, {
      agentId: preflight.agentId
    });
    return { snapshot: new Map(), reliable: false, reason: errorDetails.message };
  }
}

export async function executeAgent(
  preflight: AdapterPreflightResult,
  repoPath: string,
  context: AgentRunContext
): Promise<{ adapterResult: Awaited<ReturnType<typeof context.adapter.execute>> | undefined; adapterError: unknown; startedAt: number }> {
  const { adapter, workspacePath, executionEnvironment, traceRecorder, cancellation, task, debug } = context;
  const startedAt = Date.now();
  let adapterResult: Awaited<ReturnType<typeof adapter.execute>> | undefined;
  let adapterError: unknown;
  const adapterTimeoutMs = agentExecuteTimeoutMs();
  const adapterAbortController = new AbortController();
  let adapterTimedOut = false;
  let adapterTimeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const forwardCancellation = () => {
    adapterAbortController.abort();
  };

  debugLog(debug, `  [adapter] Executing ${adapter.title} (${adapter.kind})`);
  debugLog(debug, `  [adapter] Timeout: ${adapterTimeoutMs}ms`);

  metrics.agentExecuteTotal.inc({ agentId: preflight.agentId, adapterKind: adapter.kind });
  logger.info("adapter", "agent.execute", `Starting agent execution: ${adapter.title}`, {
    agentId: preflight.agentId,
    variantId: preflight.variantId,
    metadata: { adapterKind: adapter.kind, timeoutMs: adapterTimeoutMs }
  });

  if (cancellation?.signal) {
    if (cancellation.signal.aborted) {
      forwardCancellation();
    } else {
      cancellation.signal.addEventListener("abort", forwardCancellation, { once: true });
    }
  }

  try {
    adapterTimeoutHandle = setTimeout(() => {
      adapterTimedOut = true;
      adapterAbortController.abort();
    }, adapterTimeoutMs);

    debugLog(debug, `  [adapter] Starting execute...`);
    const executePromise = adapter.execute({
      agentId: preflight.agentId,
      selection: {
        baseAgentId: preflight.baseAgentId,
        variantId: preflight.variantId,
        displayLabel: preflight.displayLabel,
        config: preflight.requestedConfig
      },
      repoPath,
      workspacePath,
      environment: executionEnvironment,
      task,
      signal: adapterAbortController.signal,
      trace: async (event: Omit<TraceEvent, "agentId" | "timestamp">) => {
        await traceRecorder.record({
          ...event,
          agentId: preflight.agentId,
          timestamp: new Date().toISOString()
        });
      },
      sandbox: createWorkspaceSandbox(workspacePath, async (event) => {
        await traceRecorder.record({
          ...event,
          agentId: preflight.agentId,
          timestamp: new Date().toISOString()
        });
      })
    });

    adapterResult = await wrapWithTimeout(
      executePromise,
      adapterTimeoutMs + AGENT_EXECUTE_TIMEOUT_GRACE_MS,
      `${adapter.title} execution shutdown`
    );
  } catch (error) {
    adapterError =
      adapterTimedOut
        ? new Error(`${adapter.title} execution timed out after ${adapterTimeoutMs}ms.`)
        : error;
    
    if (adapterTimedOut) {
      metrics.agentTimeoutTotal.inc({ agentId: preflight.agentId, adapterKind: adapter.kind });
      logger.warn("adapter", "agent.timeout", `${adapter.title} execution timed out`, {
        agentId: preflight.agentId,
        variantId: preflight.variantId,
        metadata: { timeoutMs: adapterTimeoutMs }
      });
    } else {
      logger.error("adapter", "agent.error", `${adapter.title} execution failed`, {
        agentId: preflight.agentId,
        variantId: preflight.variantId,
        error
      });
    }
    
    const errorDetails = formatErrorDetails(error);
    await traceRecorder.record({
      agentId: preflight.agentId,
      timestamp: new Date().toISOString(),
      type: "adapter.error",
      message: adapterTimedOut ? `${adapter.title} execution timed out.` : `${adapter.title} execution failed.`,
      metadata: {
        ...errorDetails,
        timeoutMs: adapterTimedOut ? adapterTimeoutMs : undefined
      }
    });
  } finally {
    if (adapterTimeoutHandle) {
      clearTimeout(adapterTimeoutHandle);
    }
    cancellation?.signal?.removeEventListener("abort", forwardCancellation);
  }

  const durationMs = Date.now() - startedAt;
  debugLog(debug, `  [adapter] Completed in ${durationMs}ms`);
  if (adapterResult) {
    debugLog(debug, `  [adapter] Status: ${adapterResult.status}, tokens: ${adapterResult.tokenUsage}, cost: $${adapterResult.estimatedCostUsd}`);
  }
  if (adapterError) {
    debugLog(debug, `  [adapter] Error: ${formatErrorMessage(adapterError)}`);
  }

  return { adapterResult, adapterError, startedAt };
}

export async function runJudgesAndAfterSnapshot(
  preflight: AdapterPreflightResult,
  adapterResult: Awaited<ReturnType<typeof context.adapter.execute>> | undefined,
  beforeSnapshotResult: BeforeSnapshotResult,
  options: Pick<{ updateSnapshots?: boolean }, "updateSnapshots">,
  context: AgentRunContext
): Promise<{ judgeResults: Awaited<ReturnType<typeof runJudges>>; judgeError: unknown; afterSnapshot: Map<string, { relativePath: string; hash: string }>; diff: DiffSummary; changedFiles: string[]; diffPrecision: DiffPrecisionSummary | undefined; diffReliable: boolean }> {
  const { task, workspacePath, traceRecorder, throwIfCancelled, cancellation } = context;

  let judgeResults: Awaited<ReturnType<typeof runJudges>> = [];
  let judgeError: unknown;

  if (adapterResult && adapterResult.status === "success") {
    try {
      throwIfCancelled("judges");
      judgeResults = await runJudges(task.judges, workspacePath, task.envAllowList, {
        updateSnapshots: options.updateSnapshots,
        signal: cancellation?.signal,
        tokenUsage: adapterResult.tokenUsage,
        tokenBudget: task.metadata?.tokenBudget
      });

    } catch (error) {
      judgeError = error;
      if (!isAbortError(error)) {
        const errorDetails = formatErrorDetails(error);
        await traceRecorder.record({
          agentId: preflight.agentId,
          timestamp: new Date().toISOString(),
          type: "judge.error",
          message: "Judges execution failed.",
          metadata: errorDetails
        });
      }
    }
  }

  let afterSnapshot: Map<string, { relativePath: string; hash: string }>;
  let afterReliable = true;
  let afterReason: string | undefined;
  try {
    afterSnapshot = await snapshotDirectory(workspacePath);
  } catch (error) {
    const errorDetails = formatErrorDetails(error);
    await traceRecorder.record({
      agentId: preflight.agentId,
      timestamp: new Date().toISOString(),
      type: "snapshot.after_failed",
      message: "Failed to create after snapshot. Diff will be marked unreliable.",
      metadata: errorDetails
    });
    logger.warn("runner", "snapshot.after_failed", `After snapshot failed for ${preflight.agentId}: ${errorDetails.message}. Diff marked unreliable.`, {
      agentId: preflight.agentId
    });
    afterSnapshot = new Map();
    afterReliable = false;
    afterReason = errorDetails.message;
  }

  const diffReliable = beforeSnapshotResult.reliable && afterReliable;
  const unreliableReason = !diffReliable
    ? (beforeSnapshotResult.reason ?? afterReason ?? "snapshot failed")
    : undefined;
  const diff = diffSnapshots(beforeSnapshotResult.snapshot, afterSnapshot, {
    reliable: diffReliable,
    unreliableReason
  });
  const changedFiles = buildChangedFiles(diff, adapterResult?.changedFilesHint ?? []);
  const diffPrecision = buildDiffPrecision(task.expectedChangedPaths, changedFiles, { reliable: diffReliable });

  return { judgeResults, judgeError, afterSnapshot, diff, changedFiles, diffPrecision, diffReliable };
}

export async function runTeardownCommands(
  preflight: AdapterPreflightResult,
  adapterError: unknown,
  judgeError: unknown,
  context: AgentRunContext,
  signal?: AbortSignal
): Promise<{ teardownResults: CommandStepResult[]; teardownError: unknown }> {
  const { task, workspacePath, traceRecorder, cancellation } = context;

  let teardownResults: CommandStepResult[] = [];
  let teardownError: unknown;
  const teardownShouldIgnoreCancellation =
    cancellation?.signal?.aborted === true || isAbortError(adapterError) || isAbortError(judgeError);

  try {
    const effectiveSignal = teardownShouldIgnoreCancellation
      ? signal
      : (signal ?? cancellation?.signal);
    teardownResults = await runCommandSteps(
      task.teardownCommands,
      workspacePath,
      task.envAllowList,
      effectiveSignal
    );
  } catch (error) {
    if (!isAbortError(error)) {
      teardownError = error;
      const errorDetails = formatErrorDetails(error);
      await traceRecorder.record({
        agentId: preflight.agentId,
        timestamp: new Date().toISOString(),
        type: "teardown.error",
        message: "Teardown commands execution failed.",
        metadata: errorDetails
      });
    }
  }

  return { teardownResults, teardownError };
}

export async function recordFinalEvents(
  preflight: AdapterPreflightResult,
  judgeResults: Awaited<ReturnType<typeof runJudges>>,
  judgeError: unknown,
  teardownResults: CommandStepResult[],
  teardownError: unknown,
  success: boolean,
  context: AgentRunContext
): Promise<void> {
  await context.traceRecorder.record({
    agentId: preflight.agentId,
    timestamp: new Date().toISOString(),
    type: "judge.finish",
    message: success ? "All judges passed" : "One or more judges failed",
    metadata: {
      judgeResults: judgeResults.map((value) => ({
        label: value.label,
        success: value.success,
        exitCode: value.exitCode
      })),
      judgeError: judgeError ? formatErrorMessage(judgeError) : undefined
    }
  });

  await context.traceRecorder.record({
    agentId: preflight.agentId,
    timestamp: new Date().toISOString(),
    type: "teardown.finish",
    message:
      teardownResults.length === 0
        ? "No teardown commands executed."
        : teardownResults.every((value) => value.success)
          ? "All teardown commands passed."
          : "One or more teardown commands failed.",
    metadata: {
      teardownResults: teardownResults.map((value) => ({
        stepId: value.stepId,
        label: value.label,
        success: value.success,
        exitCode: value.exitCode
      })),
      teardownError: teardownError ? formatErrorMessage(teardownError) : undefined
    }
  });
}

export function buildFinalResult(
  preflight: AdapterPreflightResult,
  adapterResult: Awaited<ReturnType<typeof context.adapter.execute>> | undefined,
  adapterError: unknown,
  startedAt: number,
  setupResults: CommandStepResult[],
  judgeResults: Awaited<ReturnType<typeof runJudges>>,
  teardownResults: CommandStepResult[],
  diff: DiffSummary,
  changedFiles: string[],
  collectedFiles: string[],
  diffPrecision: DiffPrecisionSummary | undefined,
  cancelled: boolean,
  success: boolean,
  context: AgentRunContext
): AgentRunResult {
  const { adapter, workspacePath, tracePath, task } = context;
  const durationMs = Date.now() - startedAt;

  if (cancelled) {
    return createBaseResult({
      preflight,
      tracePath,
      workspacePath,
      status: "cancelled",
      summary: createCancellationSummary("agent execution"),
      durationMs,
      changedFiles,
      changedFilesHint: collectedFiles,
      setupResults,
      judgeResults,
      teardownResults,
      diff,
      diffPrecision
    });
  }

  if (adapterError) {
    const errorMessage = formatErrorMessage(adapterError);
    return createBaseResult({
      preflight,
      tracePath,
      workspacePath,
      status: "failed",
      summary: `${adapter.title} crashed: ${errorMessage}`,
      durationMs,
      changedFiles,
      changedFilesHint: collectedFiles,
      setupResults,
      diff,
      diffPrecision
    });
  }

  if (!adapterResult) {
    return createBaseResult({
      preflight,
      tracePath,
      workspacePath,
      status: "failed",
      summary: `${adapter.title} did not return a result.`,
      durationMs,
      changedFiles,
      changedFilesHint: collectedFiles,
      setupResults,
      diff,
      diffPrecision
    });
  }

  const tokenUsage = adapterResult.tokenUsage;
  const tokenBudget = task.metadata?.tokenBudget;
  const tokenUsageBreakdown = adapterResult.tokenUsageBreakdown;
  const tokenEfficiencyScore =
    tokenUsage && tokenBudget && Number.isFinite(tokenBudget) && Number.isFinite(tokenUsage) && tokenBudget > 0
      ? Math.min(1, tokenBudget / tokenUsage)
      : undefined;

  const patchValidationJudgeResult = judgeResults.find(
    (result) => result.type === "patch-validation"
  );
  const patchValidationResult = patchValidationJudgeResult
    ? {
        resolved: patchValidationJudgeResult.success,
        failToPassResults: [],
        passToPassResults: []
      }
    : undefined;

  const resolutionRate = patchValidationResult?.resolved !== undefined
    ? (patchValidationResult.resolved ? 1 : 0)
    : undefined;

  const sweBench = patchValidationResult !== undefined
    ? { patchValidationResult, resolutionRate }
    : undefined;

  const taskCategory = task.metadata?.taskCategories?.[0];
  const contaminationChecked = task.metadata?.antiContamination !== undefined;
  const difficultyGeneration = task.metadata?.difficultyEvolution?.generation;

  const liveBench = taskCategory !== undefined || contaminationChecked !== undefined || difficultyGeneration !== undefined
    ? { taskCategory, contaminationChecked, difficultyGeneration }
    : undefined;

  const finalStatus = success ? "success" : "failed";
  const durationSeconds = durationMs / 1000;
  
  metrics.agentStatusTotal.inc({ status: finalStatus, agentId: preflight.agentId, adapterKind: adapter.kind });
  metrics.agentDurationSeconds.observe({ agentId: preflight.agentId, status: finalStatus }, durationSeconds);
  
  if (adapterResult.tokenUsage) {
    metrics.agentTokenUsage.observe({ agentId: preflight.agentId }, adapterResult.tokenUsage);
  }
  
  if (adapterResult.estimatedCostUsd && adapterResult.costKnown) {
    metrics.agentCostUsd.observe({ agentId: preflight.agentId }, adapterResult.estimatedCostUsd);
  }
  
  const passedJudges = judgeResults.filter(j => j.success).length;
  const totalJudges = judgeResults.length;
  if (totalJudges > 0) {
    metrics.judgePassRate.set({ agentId: preflight.agentId }, passedJudges / totalJudges);
  }
  
  logger.info("adapter", "agent.complete", `Agent execution completed: ${adapter.title}`, {
    agentId: preflight.agentId,
    variantId: preflight.variantId,
    metadata: {
      status: finalStatus,
      durationMs,
      tokenUsage: adapterResult.tokenUsage,
      costUsd: adapterResult.estimatedCostUsd,
      judgesPassed: passedJudges,
      judgesTotal: totalJudges
    }
  });

  return createBaseResult({
    preflight,
    tracePath,
    workspacePath,
    status: success ? "success" : "failed",
    summary: adapterResult.summary,
    durationMs,
    tokenUsage: adapterResult.tokenUsage,
    estimatedCostUsd: adapterResult.estimatedCostUsd,
    costKnown: adapterResult.costKnown,
    changedFiles,
    changedFilesHint: collectedFiles,
    setupResults,
    judgeResults,
    teardownResults,
    diff,
    diffPrecision,
    resolvedRuntime: mergeResolvedRuntime(adapterResult.resolvedRuntime, preflight.resolvedRuntime),
    tokenUsageBreakdown,
    tokenEfficiencyScore,
    sweBench,
    liveBench
  });
}

// wrapWithTimeout and normalizeSelections moved to dedicated modules

/**
 * Execute a single agent run through the full benchmark pipeline.
 *
 * STATE MACHINE (implicit — no state variable, each phase returns or continues):
 *
 *   1. createAgentRunContext   — allocate workspace, trace recorder, abort controller
 *   2. setupWorkspaceAndPrechecks — copy repo, check preflight status
 *      → returns early if preflight blocked
 *   3. runSetupCommands        — run task setup commands
 *      → returns early if any setup command fails
 *   4. createBeforeSnapshot    — snapshot workspace before agent runs
 *   5. executeAgent            — run adapter with timeout + cancellation
 *   6. collectChangedFiles     — git diff for changed file detection
 *   7. runJudgesAndAfterSnapshot — run judges + after-snapshot + diff
 *   8. runTeardownCommands     — cleanup commands (ALWAYS runs, even on cancel)
 *   9. buildFinalResult        — assemble the result object
 *
 * CRITICAL BEHAVIORS:
 *
 * - Teardown failure marks the ENTIRE run as failed, even if agent + all judges
 *   passed. This is intentional: a failing cleanup script indicates an
 *   environment problem that invalidates the benchmark.
 *
 * - Cancellation is a three-layer system:
 *   (a) BenchmarkCancellation.signal → forwarded to adapter's AbortController
 *   (b) Adapter timeout → SIGTERM → grace period → SIGKILL
 *   (c) Teardown ignores cancellation if adapter/judges already aborted
 *       (teardownShouldIgnoreCancellation), ensuring cleanup always runs
 *
 * - Timeout is double-layered:
 *   (a) Adapter gets agentTimeoutMs() + 5s grace period (AGENT_EXECUTE_TIMEOUT_GRACE_MS)
 *   (b) Teardown gets TEARDOWN_TIMEOUT_MS (30s)
 *
 * - changedFilesHint (agent-claimed) vs changedFiles (git diff):
 *   If git is unreliable (snapshot failed), the hint becomes the primary source.
 *   The diffReliable flag tracks this but is NOT surfaced to the user in the UI.
 *
 * - success requires ALL of: adapter succeeded, no adapter error, no judge error,
 *   all judges passed, no teardown error, all teardown passed.
 */
export async function runAgent(
  repoPath: string,
  outputPath: string,
  workspaceRootPath: string,
  task: Awaited<ReturnType<typeof loadTaskPack>>,
  preflight: AdapterPreflightResult,
  options: { updateSnapshots?: boolean; cancellation?: BenchmarkCancellation; debug?: boolean }
): Promise<AgentRunResult> {
  const context = await createAgentRunContext(outputPath, workspaceRootPath, task, preflight, options);
  debugLog(context.debug, `Starting agent ${preflight.displayLabel} (${preflight.variantId})`);
  debugLog(context.debug, `  workspace: ${context.workspacePath}`);
  debugLog(context.debug, `  trace: ${context.tracePath}`);
  debugLog(context.debug, `  timeout: ${agentExecuteTimeoutMs()}ms`);

  try {
  const earlyResult1 = await setupWorkspaceAndPrechecks(repoPath, preflight, context);
  if (earlyResult1) {
    return earlyResult1;
  }

  const { setupResults, earlyResult: earlyResult2 } = await runSetupCommands(preflight, context);
  if (earlyResult2) {
    return earlyResult2;
  }

  const beforeSnapshotResult = await createBeforeSnapshot(preflight, context);

  const { adapterResult, adapterError, startedAt } = await executeAgent(preflight, repoPath, context);

  const collectedResult = await collectChangedFiles(context.workspacePath);
  const collectedFiles = collectedResult.files;

  const { judgeResults, judgeError, diff, changedFiles, diffPrecision } = await runJudgesAndAfterSnapshot(
    preflight,
    adapterResult,
    beforeSnapshotResult,
    options,
    context
  );

  let teardownResults: CommandStepResult[] = [];
  let teardownError: unknown;
  const teardownTimeout = TEARDOWN_TIMEOUT_MS;
  let teardownTimedOut = false;
  const teardownAbortController = new AbortController();
  const teardownTimeoutHandle = setTimeout(() => {
    teardownTimedOut = true;
    teardownAbortController.abort();
  }, teardownTimeout);
  try {
    ({ teardownResults, teardownError } = await runTeardownCommands(
      preflight,
      adapterError,
      judgeError,
      context,
      teardownAbortController.signal
    ));
  } catch (error) {
    teardownError = error;
    const errorDetails = formatErrorDetails(error);
    await context.traceRecorder.record({
      agentId: preflight.agentId,
      timestamp: new Date().toISOString(),
      type: "teardown.error",
      message: "Teardown commands execution failed.",
      metadata: errorDetails
    });
  } finally {
    clearTimeout(teardownTimeoutHandle);
  }
  if (teardownTimedOut && !teardownError) {
    teardownError = new Error("Teardown timeout");
    const errorDetails = formatErrorDetails(teardownError);
    await context.traceRecorder.record({
      agentId: preflight.agentId,
      timestamp: new Date().toISOString(),
      type: "teardown.error",
      message: "Teardown commands timed out.",
      metadata: errorDetails
    });
  }

  const cancelled =
    isAbortError(adapterError) ||
    isAbortError(judgeError) ||
    isAbortError(teardownError) ||
    context.cancellation?.signal?.aborted === true;
  const success =
    !cancelled &&
    adapterResult?.status === "success" &&
    !adapterError &&
    !judgeError &&
    judgeResults.every((value) => value.success) &&
    !teardownError &&
    teardownResults.every((value) => value.success);

  await recordFinalEvents(preflight, judgeResults, judgeError, teardownResults, teardownError, success, context);

  return buildFinalResult(
    preflight,
    adapterResult,
    adapterError,
    startedAt,
    setupResults,
    judgeResults,
    teardownResults,
    diff,
    changedFiles,
    collectedFiles,
    diffPrecision,
    cancelled,
    success,
    context
  );
  } finally {
    // Clean up intermediate files on cancellation
    if (context.cancellation?.signal?.aborted) {
      try {
        const intermediateFiles = [
          context.tracePath,
          path.join(context.agentOutputPath, "before-snapshot.json"),
          path.join(context.agentOutputPath, "after-snapshot.json"),
        ];
        for (const filePath of intermediateFiles) {
          try {
            await fs.unlink(filePath);
          } catch (error) {
            const errCode = (error as NodeJS.ErrnoException | undefined)?.code;
            if (errCode !== "ENOENT") {
              logger.debug("runner", "cleanup.intermediate_failed", `Failed to delete intermediate file: ${error instanceof Error ? error.message : String(error)}`, {
                metadata: { filePath }
              });
            }
          }
        }
      } catch (error) {
        logger.debug("runner", "cleanup.intermediate_failed", `Intermediate file cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    await context.traceRecorder.close().catch((closeError: unknown) => {
      logger.warn("runner", "trace.close_failed", `Failed to close trace recorder: ${closeError instanceof Error ? closeError.message : String(closeError)}`);
    });
  }
}
