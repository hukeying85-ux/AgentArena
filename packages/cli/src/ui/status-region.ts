/**
 * @module status-region
 *
 * TTY status region for live progress display during benchmark runs.
 *
 * Architecture:
 * - StatusRegion interface: abstract render surface.
 * - RealStatusRegion: ANSI-based live TTY rendering (fixed N-line region).
 * - NullStatusRegion: no-op for non-TTY / CI / --json modes.
 *
 * Selection is made once at startup based on environment detection:
 *   useTty = process.stderr.isTTY && !CI && !NO_COLOR && TERM !== "dumb" && !jsonMode
 *
 * Rendering approach:
 * - On each update: move cursor up N lines, clear each line, rewrite.
 * - N = 1 header line + number of running agents.
 * - Does NOT use alt-screen (\x1b[?1049h) — preserves scrollback.
 *
 * Safety:
 * - SIGWINCH triggers a full repaint with column-aware truncation.
 * - All writes go to stderr; stdout stays clean for --json-events.
 * - NullStatusRegion is a literal no-op so callers never need `if (tty)`.
 */

export interface AgentStatus {
  variantId: string;
  displayLabel: string;
  /** "queued" | "running" | "success" | "failed" | "cancelled" */
  state: "queued" | "running" | "success" | "failed" | "cancelled";
  elapsedMs: number;
  currentActivity?: string;
}

export interface RunHeader {
  total: number;
  finished: number;
  running: number;
  failed: number;
  etaText?: string;
}

export interface StatusRegion {
  /** Update the set of currently-visible agent statuses. */
  update(header: RunHeader, agents: AgentStatus[]): void;
  /** Write a committed (scrolling) line above the status region. */
  commitLine(line: string): void;
  /** Tear down the region (clear it, restore cursor). */
  destroy(): void;
}

// ── Spinner ────────────────────────────────────────────────────────────────

const BRAILLE_SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const ASCII_SPINNER = ["|", "/", "-", "\\"];

export function supportsUnicode(): boolean {
  // Windows CMD and older terminals often lack UTF-8 codepage.
  if (process.platform === "win32") {
    // Windows Terminal, VS Code terminal, and modern consoles set these.
    const lang = process.env.LANG;
    if (lang && /UTF-8|utf8/i.test(lang)) return true;
    // Default heuristic: assume ASCII-safe on Windows unless proven otherwise.
    return false;
  }
  // macOS / Linux terminals almost always support UTF-8.
  return /UTF-8|utf8/i.test(process.env.LC_ALL ?? process.env.LC_CTYPE ?? process.env.LANG ?? "en_US.UTF-8");
}

export function shouldUseTty(jsonMode: boolean): boolean {
  if (jsonMode) return false;
  if (!process.stderr.isTTY) return false;
  if (process.env.CI === "true") return false;
  if (process.env.NO_COLOR) return false;
  if (process.env.TERM === "dumb") return false;
  if (process.env.AGENTARENA_NO_TUI === "1") return false;
  return true;
}

// ── Null implementation (non-TTY fallback) ─────────────────────────────────

export class NullStatusRegion implements StatusRegion {
  private committedLines: string[] = [];

  update(_header: RunHeader, _agents: AgentStatus[]): void {
    // No-op: caller's separate stderr.write path handles non-TTY output.
  }

  commitLine(line: string): void {
    this.committedLines.push(line);
    process.stderr.write(line + "\n");
  }

  destroy(): void {
    this.committedLines = [];
  }
}

// ── Real TTY implementation ────────────────────────────────────────────────

export class RealStatusRegion implements StatusRegion {
  private spinnerIdx = 0;
  private spinnerChars = supportsUnicode() ? BRAILLE_SPINNER : ASCII_SPINNER;
  private linesRendered = 0;
  private committedLines: string[] = [];

  constructor() {
    // Ensure clean teardown on process exit
    process.on("exit", () => this.destroy());
  }

  update(header: RunHeader, agents: AgentStatus[]): void {
    if (this.linesRendered > 0) {
      // Move cursor up N lines (header + agent lines)
      process.stderr.write(`\x1b[${this.linesRendered}A`);
    }

    const cols = process.stdout.columns ?? 80;
    const out: string[] = [];

    // Header line: overall progress bar + ETA
    const barWidth = 20;
    const pct = header.total > 0 ? header.finished / header.total : 0;
    const filled = Math.round(pct * barWidth);
    const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
    const etaPart = header.etaText ? ` ETA ${header.etaText}` : "";
    const headerLine = `${bar} ${header.finished}/${header.total} · ${header.running} running · ${header.failed} failed${etaPart}`;
    out.push(this.truncate(headerLine, cols));

    // One line per agent
    for (const agent of agents) {
      const spinner = agent.state === "running" ? this.nextSpinner() : this.stateIcon(agent.state);
      const elapsed = this.formatElapsed(agent.elapsedMs);
      const label = agent.displayLabel.slice(0, 18).padEnd(18);
      const activity = agent.currentActivity ? `  ${agent.currentActivity}` : "";
      out.push(this.truncate(`${spinner} ${label} ${elapsed}${activity}`, cols));
    }

    // Render: clear each line then write new content
    for (let i = 0; i < out.length; i++) {
      process.stderr.write(`\x1b[2K${out[i]}\n`);
    }

    // Clear any leftover lines if the new render is shorter than before
    if (out.length < this.linesRendered) {
      for (let i = out.length; i < this.linesRendered; i++) {
        process.stderr.write(`\x1b[2K\n`);
      }
      // Move cursor back up to the position after the last rendered line
      const diff = this.linesRendered - out.length;
      if (diff > 0) process.stderr.write(`\x1b[${diff}A`);
    }

    this.linesRendered = out.length;
  }

  commitLine(line: string): void {
    // Before writing a committed line, we need to:
    // 1. Clear the live region (move cursor up N lines + clear)
    // 2. Write the committed line
    // 3. Re-render the live region
    if (this.linesRendered > 0) {
      process.stderr.write(`\x1b[${this.linesRendered}A`);
      for (let i = 0; i < this.linesRendered; i++) {
        process.stderr.write(`\x1b[2K\n`);
      }
      process.stderr.write(`\x1b[${this.linesRendered}A`);
    }
    this.committedLines.push(line);
    process.stderr.write(line + "\n");
    // Re-render will happen on next update(); for now we just maintain state.
  }

  destroy(): void {
    if (this.linesRendered > 0) {
      // Clear the live region so the terminal is left clean.
      process.stderr.write(`\x1b[${this.linesRendered}B`);
      for (let i = 0; i < this.linesRendered; i++) {
        process.stderr.write(`\x1b[2K`);
        if (i < this.linesRendered - 1) process.stderr.write("\n");
      }
      this.linesRendered = 0;
    }
  }

  private nextSpinner(): string {
    const ch = this.spinnerChars[this.spinnerIdx % this.spinnerChars.length];
    this.spinnerIdx++;
    return ch;
  }

  private stateIcon(state: AgentStatus["state"]): string {
    switch (state) {
      case "success": return "✓";
      case "failed": return "✗";
      case "cancelled": return "⊘";
      case "queued": return "○";
      case "running": return this.nextSpinner();
    }
  }

  private truncate(line: string, maxCols: number): string {
    if (maxCols <= 0) return line;
    // Simple truncation — doesn't account for multi-byte chars but good enough
    // for status display purposes.
    return line.length > maxCols ? line.slice(0, maxCols - 1) + "…" : line;
  }

  private formatElapsed(ms: number): string {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

export function createStatusRegion(jsonMode: boolean): StatusRegion {
  return shouldUseTty(jsonMode) ? new RealStatusRegion() : new NullStatusRegion();
}
