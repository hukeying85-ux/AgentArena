import { useCallback, useState } from "preact/hooks";
import type { NormalizedRun } from "../domain/run";

const SESSION_KEY = "agentarena-workbench-compare-v1";

export interface CompareSession {
  baseRunId: string | null;
  selectedRunIds: string[];
  sortMode: string;
}

const emptySession: CompareSession = { baseRunId: null, selectedRunIds: [], sortMode: "created" };

function readSession(): CompareSession {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return { ...emptySession };
    const parsed = JSON.parse(raw) as Partial<CompareSession>;
    return {
      baseRunId: typeof parsed.baseRunId === "string" ? parsed.baseRunId : null,
      selectedRunIds: Array.isArray(parsed.selectedRunIds)
        ? parsed.selectedRunIds.filter((id): id is string => typeof id === "string")
        : [],
      sortMode: typeof parsed.sortMode === "string" ? parsed.sortMode : "created"
    };
  } catch {
    return { ...emptySession };
  }
}

/**
 * Persisted comparison session. Stores only run-id references, so a session
 * degrades gracefully when some referenced runs are no longer loaded.
 */
export function useCompareSession(runs: NormalizedRun[]) {
  const [session, setSession] = useState<CompareSession>(readSession);

  const persist = useCallback((next: CompareSession) => {
    setSession(next);
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
  }, []);

  const setBaseRunId = useCallback((baseRunId: string | null) => {
    persist({ ...session, baseRunId });
  }, [persist, session]);

  const setSortMode = useCallback((sortMode: string) => {
    persist({ ...session, sortMode });
  }, [persist, session]);

  const toggleRun = useCallback((runId: string) => {
    const selected = session.selectedRunIds.includes(runId)
      ? session.selectedRunIds.filter((id) => id !== runId)
      : [...session.selectedRunIds, runId];
    persist({ ...session, selectedRunIds: selected });
  }, [persist, session]);

  const selectedRuns = session.selectedRunIds
    .map((id) => runs.find((run) => run.runId === id))
    .filter((run): run is NormalizedRun => run !== undefined);

  const saveSession = useCallback(() => persist(session), [persist, session]);

  const exportJson = useCallback((): string => {
    return JSON.stringify({ kind: "agentarena.compare/v1", savedAt: new Date().toISOString(), ...session }, null, 2);
  }, [session]);

  const shareText = useCallback((): string => {
    const base = runs.find((run) => run.runId === session.baseRunId);
    const lines: string[] = ["AgentArena comparison session", ""];
    if (base) lines.push(`Base run: ${base.task.title} · ${base.runId}`);
    lines.push(`Selected runs (${selectedRuns.length}):`);
    for (const run of selectedRuns) {
      lines.push(`- ${run.task.title} · ${run.runId} · ${run.source.label}`);
    }
    return lines.join("\n");
  }, [runs, selectedRuns, session.baseRunId]);

  return {
    session,
    selectedRuns,
    setBaseRunId,
    setSortMode,
    toggleRun,
    saveSession,
    exportJson,
    shareText
  };
}
