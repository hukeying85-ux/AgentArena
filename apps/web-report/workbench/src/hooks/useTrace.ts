import { useEffect, useState } from "preact/hooks";
import { apiFetch } from "../api/client";
import type { NormalizedAgentResult, NormalizedRun } from "../domain/run";
import { buildTimeline, type TraceEvent, type TraceTimeline } from "../domain/trace";

export type TraceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; timeline: TraceTimeline; truncated: boolean }
  | { status: "missing" }
  | { status: "error"; message: string };

interface TraceResponse {
  runId: string;
  variantId: string;
  totalEvents: number;
  returnedEvents: number;
  truncated: boolean;
  events: TraceEvent[];
}

/**
 * Load the execution trace for a given run + agent result.
 *
 * - Demo runs use a bundled sample file under /workbench/public so replay works
 *   fully offline (no backend needed).
 * - Real / imported runs load through the backend /api/trace endpoint, which
 *   resolves the file from the workspace run output dir and binds identity to
 *   runId + variantId (no relative-path guessing, no cross-wiring).
 *
 * Every failure degrades to a textual state — replay never throws into the page.
 */
export function useTrace(run: NormalizedRun | null, result: NormalizedAgentResult | null): TraceState {
  const [state, setState] = useState<TraceState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    const variantId = result?.variantId ?? null;
    const runId = run?.runId ?? null;

    if (!run || !result || !variantId || result.traceAvailability === "missing") {
      setState({ status: "missing" });
      return;
    }

    const loadBuiltIn = async () => {
      const res = await fetch(`trace-${variantId}.jsonl`, { cache: "no-store" });
      if (!res.ok) throw new Error(`builtin-trace-${res.status}`);
      const text = await res.text();
      const events = text.split("\n").filter((line) => line.trim()).map((line) => {
        try { return JSON.parse(line) as TraceEvent; } catch { return null; }
      }).filter((item): item is TraceEvent => item !== null && typeof item.type === "string");
      return events;
    };

    const loadRemote = async () => {
      const data = await apiFetch<TraceResponse>(`/api/trace?runId=${encodeURIComponent(runId ?? "")}&variantId=${encodeURIComponent(variantId)}`);
      return data.events;
    };

    const source = run.source.kind === "demo" ? loadBuiltIn() : loadRemote();

    source.then((events) => {
      if (cancelled) return;
      if (events.length === 0) { setState({ status: "missing" }); return; }
      setState({ status: "ready", timeline: buildTimeline(events), truncated: events.length >= 10_000 });
    }).catch((error: unknown) => {
      if (cancelled) return;
      const message = error instanceof Error ? error.message : String(error);
      // A 404 from the backend means the trace file is genuinely absent.
      if (message.includes("trace-missing") || message.includes("404")) {
        setState({ status: "missing" });
      } else {
        setState({ status: "error", message });
      }
    });

    return () => { cancelled = true; };
  }, [run, result]);

  return state;
}
