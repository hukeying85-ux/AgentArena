/**
 * Trace domain: parse and group raw trace events into a replayable timeline.
 *
 * Pure functions with no DOM or network dependency, so they can be unit-tested
 * in isolation and reused by both the workbench UI and (potentially) a worker.
 * Ported from the legacy `trace-replay-bridge.js` TraceReplayer, but typed and
 * with no global mutable state.
 */

export interface TraceEvent {
  agentId?: string;
  variantId?: string;
  runId?: string;
  timestamp: string;
  type: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

export type TraceCategory = "setup" | "teardown" | "judge" | "agent" | "snapshot" | "preflight" | "other";

export interface TraceStep {
  index: number;
  timestamp: string;
  events: TraceEvent[];
  summary: string;
  category: TraceCategory;
}

export interface TraceTimeline {
  steps: TraceStep[];
  metadata: {
    agentId: string;
    runId: string | null;
    totalEvents: number;
    startTime: string;
    endTime: string;
    durationMs: number;
    errorCount: number;
    eventTypes: Record<string, number>;
  };
}

export function categorizeEvent(event: TraceEvent): TraceCategory {
  const type = event.type.toLowerCase();
  if (type.startsWith("setup")) return "setup";
  if (type.startsWith("teardown")) return "teardown";
  if (type.startsWith("judge")) return "judge";
  if (type.startsWith("adapter")) return "agent";
  if (type.startsWith("snapshot")) return "snapshot";
  if (type.startsWith("preflight")) return "preflight";
  return "other";
}

export function summarizeEvent(event: TraceEvent): string {
  const prefix = `[${event.type}]`;
  const message = event.message?.slice(0, 200);
  return message ? `${prefix} ${message}` : prefix;
}

export function countErrors(events: TraceEvent[]): number {
  return events.filter(
    (event) =>
      event.type.includes("error") ||
      event.type.includes("failed") ||
      event.type.includes("failure") ||
      event.metadata?.error !== undefined
  ).length;
}

export function countEventTypes(events: TraceEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    counts[event.type] = (counts[event.type] ?? 0) + 1;
  }
  return counts;
}

/**
 * Group events into steps. A new step starts when the gap to the previous event
 * exceeds `stepWindowMs` or the category changes, keeping the timeline readable
 * without one card per micro-event.
 */
export function groupEventsIntoSteps(events: TraceEvent[], stepWindowMs = 100): TraceStep[] {
  if (events.length === 0) return [];

  const steps: TraceStep[] = [];
  let currentStep: TraceStep = {
    index: 0,
    timestamp: events[0].timestamp,
    events: [events[0]],
    summary: summarizeEvent(events[0]),
    category: categorizeEvent(events[0])
  };

  for (let i = 1; i < events.length; i++) {
    const event = events[i];
    const prevTime = new Date(events[i - 1].timestamp).getTime();
    const currTime = new Date(event.timestamp).getTime();
    const category = categorizeEvent(event);

    if (Number.isNaN(prevTime) || Number.isNaN(currTime) || currTime - prevTime > stepWindowMs || category !== currentStep.category) {
      steps.push(currentStep);
      currentStep = {
        index: steps.length,
        timestamp: event.timestamp,
        events: [event],
        summary: summarizeEvent(event),
        category
      };
    } else {
      currentStep.events.push(event);
      if (currentStep.events.length === 2) {
        currentStep.summary = `${currentStep.summary} (+${currentStep.events.length - 1} more)`;
      } else {
        currentStep.summary = `${currentStep.events[0].type} (+${currentStep.events.length - 1} events)`;
      }
    }
  }

  steps.push(currentStep);
  return steps;
}

export function buildTimeline(events: TraceEvent[], options: { stepWindowMs?: number } = {}): TraceTimeline {
  if (events.length === 0) {
    return {
      steps: [],
      metadata: {
        agentId: "unknown",
        runId: null,
        totalEvents: 0,
        startTime: "",
        endTime: "",
        durationMs: 0,
        errorCount: 0,
        eventTypes: {}
      }
    };
  }

  const sorted = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const steps = groupEventsIntoSteps(sorted, options.stepWindowMs ?? 100);
  const startTime = sorted[0].timestamp;
  const endTime = sorted[sorted.length - 1].timestamp;
  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();
  const durationMs = Number.isNaN(startMs) || Number.isNaN(endMs) ? 0 : endMs - startMs;

  return {
    steps,
    metadata: {
      agentId: sorted[0].agentId ?? "unknown",
      runId: sorted[0].runId ?? null,
      totalEvents: sorted.length,
      startTime,
      endTime,
      durationMs,
      errorCount: countErrors(sorted),
      eventTypes: countEventTypes(sorted)
    }
  };
}

/** Safe CSS class fragment for a category label (no untrusted input reaches it). */
export function safeCategoryClass(category: TraceCategory): string {
  return /^[a-z]+$/.test(category) ? category : "other";
}
