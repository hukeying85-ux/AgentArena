/**
 * @module sse
 *
 * Server-Sent Events helpers for the UI server.
 *
 * Provides:
 * - writeSseHeaders: set response headers for an SSE stream.
 * - sendSseEvent: format and write a single SSE event frame.
 * - sendSseHeartbeat: write a comment line to keep the connection alive.
 * - SseConnection: wraps a response object with heartbeat timer + close tracking.
 *
 * SSE was chosen over WebSocket because:
 * - One-directional (server → browser) is exactly our need.
 * - Rides the same HTTP port 4320 — no separate protocol/upgrade.
 * - EventSource auto-reconnects natively.
 * - Simpler to test with plain http.get.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

export const SSE_HEARTBEAT_MS = 20_000;

export function writeSseHeaders(res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "Referrer-Policy": "no-referrer",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  // Initial comment to force headers through proxies
  res.write(": connected\n\n");
}

export function sendSseEvent(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function sendSseComment(res: ServerResponse, comment: string): void {
  res.write(`: ${comment}\n\n`);
}

/**
 * Wraps an SSE response with automatic heartbeat and lifecycle management.
 *
 * Usage:
 *   const conn = new SseConnection(res);
 *   conn.send("progress", { ... });
 *   // ... later:
 *   conn.close("done", { ... });
 */
export class SseConnection {
  private timer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(
    private res: ServerResponse,
    private req: IncomingMessage | null = null,
    heartbeatMs: number = SSE_HEARTBEAT_MS
  ) {
    writeSseHeaders(this.res);
    this.startHeartbeat(heartbeatMs);
    // Clean up if the client disconnects. Use req.on('close') as the primary
    // signal — it fires reliably when the client's TCP connection closes
    // (e.g. browser navigation). res.on('close') is a fallback for edge cases.
    if (this.req) {
      this.req.on("close", () => this.handleClientClose());
    } else {
      this.res.on("close", () => this.handleClientClose());
    }
  }

  send(event: string, data: unknown): void {
    if (this.closed) return;
    try {
      sendSseEvent(this.res, event, data);
    } catch {
      this.handleClientClose();
    }
  }

  /** Send a heartbeat comment to keep the connection alive. */
  heartbeat(): void {
    if (this.closed) return;
    try {
      sendSseComment(this.res, `heartbeat ${new Date().toISOString()}`);
    } catch {
      this.handleClientClose();
    }
  }

  /** Gracefully close: send final event, stop heartbeat, end response. */
  close(event: string, data: unknown): void {
    if (this.closed) return;
    this.closed = true;
    this.stopHeartbeat();
    try {
      sendSseEvent(this.res, event, data);
      this.res.end();
    } catch {
      // Response already destroyed
    }
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /**
   * Close + mark as closed without sending a final event.
   * Used by `pruneClosed` to clean up connections whose client disconnected
   * (browser refresh/navigation) without leaking heartbeat timers. No-op if
   * already closed.
   */
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.stopHeartbeat();
  }

  private startHeartbeat(ms: number): void {
    this.timer = setInterval(() => this.heartbeat(), ms);
    // Don't keep the process alive just for heartbeats
    if (this.timer.unref) this.timer.unref();
  }

  private stopHeartbeat(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private handleClientClose(): void {
    this.closed = true;
    this.stopHeartbeat();
  }
}
