/**
 * @module ring-buffer
 *
 * Fixed-capacity ring buffer for per-agent log storage.
 *
 * Design decisions:
 * - Pre-allocated array avoids GC churn on every push at high frequency.
 * - `toArray()` returns chronological order (oldest first) regardless of
 *   internal head position, so consumers never need to know about wrap-around.
 * - Generic so the same class stores LogLine (server) or string (browser).
 *
 * Used by:
 * - AgentLogStore (packages/cli server) for authoritative per-agent logs.
 * - app-state.js (browser) for render-state per-agent logs.
 */

export class RingBuffer<T> {
  private buf: (T | undefined)[];
  private head = 0;     // next write index
  private count = 0;    // number of valid items

  constructor(private readonly capacity: number) {
    if (capacity <= 0) throw new Error(`RingBuffer capacity must be > 0, got ${capacity}`);
    this.buf = new Array(capacity);
  }

  push(item: T): void {
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  /** Return items in chronological order (oldest first). */
  toArray(): T[] {
    const out: T[] = [];
    const start = this.count < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      out.push(this.buf[(start + i) % this.capacity] as T);
    }
    return out;
  }

  /** Return the last N items in chronological order, or all if fewer than N. */
  last(n: number): T[] {
    const all = this.toArray();
    return all.slice(-Math.min(n, all.length));
  }

  get size(): number {
    return this.count;
  }

  get capacitySize(): number {
    return this.capacity;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
    this.buf = new Array(this.capacity);
  }
}

/**
 * A single log line captured from an agent's stdout or stderr.
 * Serializable across the SSE/polling boundary.
 */
export interface LogLine {
  seq: number;
  ts: number;            // Date.now() epoch ms —可以用于排序和 stalled 检测
  stream: "stdout" | "stderr";
  text: string;
}

/**
 * Per-agent log store backed by RingBuffer.
 *
 * Centralizes the "append to agent N's buffer and get last K lines" pattern
 * so both the runner (capture) and the UI server (serve) share one implementation.
 */
export class AgentLogStore {
  private map = new Map<string, RingBuffer<LogLine>>();

  constructor(private readonly perAgentCapacity = 1000) {}

  /**
   * Append a log line to the named agent's buffer.
   * Creates the buffer lazily on first write.
   */
  append(agentId: string, line: LogLine): void {
    let rb = this.map.get(agentId);
    if (!rb) {
      rb = new RingBuffer<LogLine>(this.perAgentCapacity);
      this.map.set(agentId, rb);
    }
    rb.push(line);
  }

  /** Return all log lines for an agent in chronological order. */
  get(agentId: string): LogLine[] {
    return this.map.get(agentId)?.toArray() ?? [];
  }

  /** Return the last N log lines for an agent. */
  last(agentId: string, n: number): LogLine[] {
    return this.map.get(agentId)?.last(n) ?? [];
  }

  /** Return all agent IDs that have at least one log line. */
  agentIds(): string[] {
    return [...this.map.keys()];
  }

  /** Return the number of agents with stored logs. */
  get agentCount(): number {
    return this.map.size;
  }

  /**
   * Return the most recent activity timestamp across all agents.
   * Used for stalled detection on the frontend.
   */
  lastActivityEpochMs(agentId: string): number | undefined {
    const lines = this.map.get(agentId)?.last(1);
    return lines?.[0]?.ts;
  }

  clearAgent(agentId: string): void {
    this.map.delete(agentId);
  }

  clearAll(): void {
    this.map.clear();
  }
}
