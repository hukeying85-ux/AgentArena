/**
 * @module tailer
 *
 * Polling-based JSONL trace file tailer.
 *
 * Design decisions:
 * - Polling (not fs.watch): fs.watch is unreliable cross-platform (missed events
 *   on Linux/macOS, no content events on Windows). Polling with a tracked byte
 *   offset is deterministic and testable.
 * - Partial line buffering: a line being written when we poll is buffered until
 *   the next newline arrives, preventing JSON.parse errors.
 * - Grace tick: after stop() is called, one final tick flushes trailing records
 *   written just before the agent process exits.
 *
 * Usage:
 *   const tailer = new TraceTailer("/path/to/trace.jsonl", (record) => {
 *     console.log(record.type, record.message);
 *   });
 *   tailer.start();
 *   // ... later:
 *   tailer.stop();
 */

import { promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";

export type TraceRecord = Record<string, unknown>;

export interface TraceTailerOptions {
  /** Polling interval in ms. Default 250. */
  intervalMs?: number;
  /** If true, perform one final read after stop() to flush trailing data. Default true. */
  graceTick?: boolean;
}

export class TraceTailer {
  private offset = 0;
  private partial = "";
  private timer: NodeJS.Timeout | null = null;
  private activeTick: Promise<void> | null = null;

  constructor(
    private readonly filePath: string,
    private readonly onRecord: (record: TraceRecord) => void,
    private readonly options: TraceTailerOptions = {}
  ) {}

  start(): void {
    if (this.timer) return; // already running
    const interval = this.options.intervalMs ?? 250;
    this.timer = setInterval(() => {
      void this.tick();
    }, interval);
    if (this.timer.unref) this.timer.unref();
    // Immediate first tick
    void this.tick();
  }

  stop(): void {
    if (this.options.graceTick !== false) {
      // One final tick to flush trailing records
      void this.tick().then(() => this.cleanup()).catch(() => this.cleanup());
    } else {
      this.cleanup();
    }
  }

  private cleanup(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): Promise<void> {
    if (this.activeTick) return this.activeTick;
    this.activeTick = this.readAvailable().finally(() => {
      this.activeTick = null;
    });
    return this.activeTick;
  }

  private async readAvailable(): Promise<void> {
    let fh: FileHandle | undefined;
    try {
      const stat = await fs.stat(this.filePath);
      if (stat.size <= this.offset) return; // no new data

      fh = await fs.open(this.filePath, "r");
      const buf = Buffer.alloc(stat.size - this.offset);
      await fh.read(buf, 0, buf.length, this.offset);
      await fh.close();
      fh = undefined;

      this.offset = stat.size;
      this.partial += buf.toString("utf8");

      // Split on newlines; keep the last (potentially incomplete) segment
      const lines = this.partial.split("\n");
      this.partial = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          this.onRecord(JSON.parse(line) as TraceRecord);
        } catch {
          // Malformed line; skip. In practice this should not happen because
          // the trace recorder writes valid JSON per line.
        }
      }
    } catch (error) {
      const errCode = (error as NodeJS.ErrnoException | undefined)?.code;
      if (errCode === "ENOENT") {
        // File does not exist yet; the agent has not started writing.
        // Reset offset so we detect the file when it appears.
        this.offset = 0;
      }
      // Other errors (EACCES, etc.); silently skip this tick.
    } finally {
      await fh?.close().catch(() => {});
    }
  }
}
