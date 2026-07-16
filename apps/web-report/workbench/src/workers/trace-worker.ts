import { buildTimeline, type TraceEvent, type TraceTimeline } from "../domain/trace";

export interface TraceWorkerRequest {
  events?: TraceEvent[];
  text?: string;
}

export interface TraceWorkerResponse {
  steps: TraceTimeline["steps"];
  metadata: TraceTimeline["metadata"];
  first500: TraceTimeline["steps"];
  totalSteps: number;
}

const FRIST_SCREEN_STEPS = 500;
const MAIN_THREAD_THRESHOLD = 2000;

export function isLargeTrace(eventCount: number): boolean {
  return eventCount > MAIN_THREAD_THRESHOLD;
}

function parseEvents(text: string): TraceEvent[] {
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        const parsed = JSON.parse(line) as TraceEvent;
        return parsed && typeof parsed.type === "string" ? parsed : null;
      } catch {
        return null;
      }
    })
    .filter((item): item is TraceEvent => item !== null);
}

function buildResponse(events: TraceEvent[]): TraceWorkerResponse {
  const timeline = buildTimeline(events);
  return {
    steps: timeline.steps,
    metadata: timeline.metadata,
    first500: timeline.steps.slice(0, FRIST_SCREEN_STEPS),
    totalSteps: timeline.steps.length
  };
}

self.onmessage = (event: MessageEvent<TraceWorkerRequest>) => {
  const data = event.data;
  const events = data.events ?? (data.text ? parseEvents(data.text) : []);
  const response = buildResponse(events);
  (self as unknown as Worker).postMessage(response);
};
