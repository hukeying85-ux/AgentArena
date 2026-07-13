/**
 * Run state persistence for the UI server.
 *
 * Saves run state to disk so that if the server crashes or restarts,
 * the frontend can recover the last known state instead of being stuck
 * on "running" forever.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { writeJsonAtomic } from "./atomic-write.js";
import { logger } from "./logging.js";

export type UiRunStateName = "idle" | "running" | "done" | "error" | "cancelled" | "cancelling";
export type UiRunPhase = "idle" | "starting" | "preflight" | "benchmark" | "report";

export interface UiRunStateLogEntry {
  timestamp: string;
  phase: UiRunPhase;
  message: string;
  agentId?: string;
  variantId?: string;
  displayLabel?: string;
}

export interface UiRunProgressSnapshot {
  total: number;
  finished: number;
  running: string[];
  failed: number;
  lastActivityByAgent: Record<string, number>;
}

export interface UiRunState {
  state: UiRunStateName;
  phase: UiRunPhase;
  logs: UiRunStateLogEntry[];
  updatedAt: string;
  startedAt?: string;
  repoPath?: string;
  taskPath?: string;
  runId?: string;
  outputPath?: string;
  currentAgentId?: string;
  currentVariantId?: string;
  currentDisplayLabel?: string;
  snapshot?: UiRunProgressSnapshot;
  error?: string;
}

const STATE_FILE_NAME = "run-state.json";

function getStateDir(cwd: string): string {
  return path.join(cwd, ".agentarena", "ui");
}

function getStateFilePath(cwd: string): string {
  return path.join(getStateDir(cwd), STATE_FILE_NAME);
}

/**
 * Persist run state to disk atomically.
 */
export async function saveRunState(cwd: string, state: UiRunState): Promise<void> {
  const dir = getStateDir(cwd);
  await fs.mkdir(dir, { recursive: true });

  const filePath = getStateFilePath(cwd);

  // Only persist essential fields (skip result to avoid huge files)
  const persisted: UiRunState = {
    state: state.state,
    phase: state.phase,
    logs: state.logs.slice(-50),
    updatedAt: state.updatedAt,
    startedAt: state.startedAt,
    repoPath: state.repoPath,
    taskPath: state.taskPath,
    runId: state.runId,
    outputPath: state.outputPath,
    currentAgentId: state.currentAgentId,
    currentVariantId: state.currentVariantId,
    currentDisplayLabel: state.currentDisplayLabel,
    snapshot: state.snapshot,
    error: state.error,
  };

  await writeJsonAtomic(filePath, persisted);
}

const VALID_STATES = new Set<UiRunStateName>(["idle", "running", "done", "error", "cancelled", "cancelling"]);
const VALID_PHASES = new Set<UiRunPhase>(["idle", "starting", "preflight", "benchmark", "report"]);
const MAX_LOG_ENTRIES = 100;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * JSON.parse reviver that strips dangerous keys at every nesting level.
 * Prevents prototype pollution from data like {"logs":[{"__proto__":{...}}]}.
 */
function stripDangerousKeys(key: string, value: unknown): unknown {
  if (FORBIDDEN_KEYS.has(key)) {
    return undefined;
  }
  return value;
}

/**
 * Defense-in-depth recursive cleaner. The reviver above drops `__proto__`/
 * `constructor`/`prototype` at parse time, but a belt-and-suspenders walk after
 * parsing guarantees no dangerous key survives (reviver ordering edge cases,
 * duplicate keys, etc.). Operates in place on the freshly-parsed object.
 */
function sanitizeDangerousKeys(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      sanitizeDangerousKeys(item);
    }
    return;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (FORBIDDEN_KEYS.has(key)) {
        delete record[key];
      } else {
        sanitizeDangerousKeys(record[key]);
      }
    }
  }
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function validateLogEntry(value: unknown): UiRunStateLogEntry | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.timestamp !== "string") return null;
  if (typeof entry.message !== "string") return null;
  if (typeof entry.phase !== "string" || !VALID_PHASES.has(entry.phase as UiRunPhase)) return null;
  if (!isOptionalString(entry.agentId)) return null;
  if (!isOptionalString(entry.variantId)) return null;
  if (!isOptionalString(entry.displayLabel)) return null;
  const result: UiRunStateLogEntry = {
    timestamp: entry.timestamp,
    phase: entry.phase as UiRunPhase,
    message: entry.message,
  };
  if (entry.agentId !== undefined) result.agentId = entry.agentId as string;
  if (entry.variantId !== undefined) result.variantId = entry.variantId as string;
  if (entry.displayLabel !== undefined) result.displayLabel = entry.displayLabel as string;
  return result;
}

function validateProgressSnapshot(value: unknown): UiRunProgressSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Record<string, unknown>;
  if (typeof snapshot.total !== "number" || !Number.isFinite(snapshot.total)) return null;
  if (typeof snapshot.finished !== "number" || !Number.isFinite(snapshot.finished)) return null;
  if (typeof snapshot.failed !== "number" || !Number.isFinite(snapshot.failed)) return null;
  if (!Array.isArray(snapshot.running) || !snapshot.running.every((item) => typeof item === "string")) return null;
  if (!snapshot.lastActivityByAgent || typeof snapshot.lastActivityByAgent !== "object") return null;

  const lastActivityByAgent: Record<string, number> = {};
  for (const [key, timestamp] of Object.entries(snapshot.lastActivityByAgent as Record<string, unknown>)) {
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return null;
    lastActivityByAgent[key] = timestamp;
  }

  return {
    total: snapshot.total,
    finished: snapshot.finished,
    running: snapshot.running,
    failed: snapshot.failed,
    lastActivityByAgent
  };
}

/**
 * Load persisted run state from disk.
 * Returns null if file doesn't exist, is corrupted, or fails validation.
 * Logs at WARN level for parse/validation failures; remains silent on ENOENT
 * (which is the normal "first run" / "no prior state" case).
 */
export async function loadRunState(cwd: string): Promise<UiRunState | null> {
  const filePath = getStateFilePath(cwd);
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code !== "ENOENT") {
      logger.warn("core", "run_state.read_failed", `Failed to read run state at ${filePath}: ${err instanceof Error ? err.message : String(err)}`, {
        error: err
      });
    }
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content, stripDangerousKeys);
    // Belt-and-suspenders: strip any dangerous keys the reviver may have missed.
    sanitizeDangerousKeys(parsed);
  } catch (err) {
    logger.warn("core", "run_state.parse_failed", `Failed to parse run state at ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    logger.warn("core", "run_state.invalid_shape", "Persisted run state is not an object");
    return null;
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.state !== "string" || !VALID_STATES.has(obj.state as UiRunStateName)) {
    logger.warn("core", "run_state.invalid_state", `Persisted run state has invalid \`state\` field: ${String(obj.state)}`);
    return null;
  }
  if (typeof obj.updatedAt !== "string" || Number.isNaN(Date.parse(obj.updatedAt))) {
    logger.warn("core", "run_state.invalid_updated_at", "Persisted run state has invalid `updatedAt` field");
    return null;
  }
  if (obj.phase !== undefined && (typeof obj.phase !== "string" || !VALID_PHASES.has(obj.phase as UiRunPhase))) {
    logger.warn("core", "run_state.invalid_phase", `Persisted run state has invalid \`phase\` field: ${String(obj.phase)}`);
    return null;
  }

  // Validate every optional string field — prior code would later cast unsafely
  // and crash downstream consumers when fields had wrong types.
  for (const field of [
    "startedAt", "repoPath", "taskPath", "runId", "outputPath",
    "currentAgentId", "currentVariantId", "currentDisplayLabel", "error",
  ] as const) {
    if (!isOptionalString(obj[field])) {
      logger.warn("core", "run_state.invalid_field", `Persisted run state has invalid \`${field}\` field type`);
      return null;
    }
  }

  // Validate logs array and each entry. Drops malformed entries rather than
  // failing the whole load (logs are best-effort breadcrumbs).
  let logs: UiRunStateLogEntry[] = [];
  if (obj.logs !== undefined) {
    if (!Array.isArray(obj.logs)) {
      logger.warn("core", "run_state.invalid_logs", "Persisted run state `logs` is not an array");
      return null;
    }
    const validated: UiRunStateLogEntry[] = [];
    for (const entry of obj.logs.slice(-MAX_LOG_ENTRIES)) {
      const result = validateLogEntry(entry);
      if (result) validated.push(result);
    }
    logs = validated;
  }

  const result: UiRunState = {
    state: obj.state as UiRunStateName,
    phase: (obj.phase as UiRunPhase | undefined) ?? "idle",
    logs,
    updatedAt: obj.updatedAt,
  };
  if (obj.startedAt !== undefined) result.startedAt = obj.startedAt as string;
  if (obj.repoPath !== undefined) result.repoPath = obj.repoPath as string;
  if (obj.taskPath !== undefined) result.taskPath = obj.taskPath as string;
  if (obj.runId !== undefined) result.runId = obj.runId as string;
  if (obj.outputPath !== undefined) result.outputPath = obj.outputPath as string;
  if (obj.currentAgentId !== undefined) result.currentAgentId = obj.currentAgentId as string;
  if (obj.currentVariantId !== undefined) result.currentVariantId = obj.currentVariantId as string;
  if (obj.currentDisplayLabel !== undefined) result.currentDisplayLabel = obj.currentDisplayLabel as string;
  if (obj.snapshot !== undefined) {
    const snapshot = validateProgressSnapshot(obj.snapshot);
    if (snapshot) result.snapshot = snapshot;
  }
  if (obj.error !== undefined) result.error = obj.error as string;
  return result;
}

/**
 * Delete persisted run state from disk. Silent on ENOENT, logged on other errors
 * so a locked/permission-denied state file doesn't silently re-recover on next start.
 */
export async function clearRunState(cwd: string): Promise<void> {
  try {
    const filePath = getStateFilePath(cwd);
    await fs.unlink(filePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code !== "ENOENT") {
      logger.warn("core", "run_state.clear_failed", `Failed to clear run state: ${err instanceof Error ? err.message : String(err)}`, {
        error: err
      });
    }
  }
}
