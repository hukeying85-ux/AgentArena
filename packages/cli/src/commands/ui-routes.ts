import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import type http from "node:http";
import path from "node:path";
import type { getCodexDefaultResolvedRuntime } from "@agentarena/adapters";
import { AgentLogStore, createCancellation, createRunId, isAbortError, isPathInsideWorkspace, metrics } from "@agentarena/core";
import { writeReport } from "@agentarena/report";
import { type BenchmarkProgressEvent, runBenchmark } from "@agentarena/runner";
import { TraceTailer } from "@agentarena/trace";
import {
  checkAuthHeader,
  checkCorsOrigin,
  checkRateLimit,
  detectContentType,
  getClientIp,
  HttpError,
  jsonResponse,
  readRequestBody,
  textResponse,
} from "../server/index.js";
import {
  handleAdaptersList,
  handleAdhocTaskpackDelete,
  handleAdhocTaskpacksList,
  handleAgentDetection,
  handleCheckCompatibility,
  handleCreateAdhocTaskpack,
  handleInstallGuides,
  handlePreflight,
  handleProviderProfileCreate,
  handleProviderProfileDelete,
  handleProviderProfileSecret,
  handleProviderProfilesGet,
  handleProviderProfileUpdate,
  handleQuickPreflight,
  handleTaskpacksList,
  handleUiInfo,
  withErrorHandling,
} from "./api-routes.js";
import { validateRunPayload } from "./run-payload-validator.js";
import {
  normalizeUiSelections,
  resolveReportLocale,
  type UiRunPayload,
  type UiRunStatus,
  WEB_REPORT_DIST_ROOT,
} from "./shared.js";
import { SseConnection } from "./sse.js";

export { WEB_REPORT_DIST_ROOT };

export function sendApiResponse(
  response: http.ServerResponse,
  apiResponse: { statusCode: number; body: string; headers: Record<string, string> }
): void {
  response.writeHead(apiResponse.statusCode, apiResponse.headers);
  response.end(apiResponse.body);
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("`", "&#96;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export interface ActiveUiRun {
  promise: Promise<unknown>;
  cancel: () => void;
  /** Agent log store for this run — populated when the run starts. */
  agentLogStore?: AgentLogStore;
  /** Live SSE connections subscribed to this run's events. */
  sseConnections?: Set<SseConnection>;
}

/**
 * RUN LIFECYCLE STATE MACHINE
 *
 * The benchmark run goes through these states (activeRunStatus.state):
 *
 *   idle ──POST /api/run──> running ──success──> done
 *                              │
 *                              ├──error──> error
 *                              │
 *                              └──cancel──> cancelling ──abort──> cancelled
 *
 * Transitions:
 * - idle → running:   POST /api/run accepted, runStarting mutex acquired
 * - running → done:   Benchmark completed, report written
 * - running → error:  Benchmark threw an unrecoverable error
 * - running → cancelling: POST /api/run/cancel called
 * - cancelling → cancelled: AbortController fired, run acknowledged abort
 *
 * The `runGeneration` counter prevents stale finally-blocks from overwriting
 * state from a newer run. Each POST /api/run increments the counter; the
 * finally block checks `currentRunGeneration === ctx.runGeneration` before
 * updating state.
 *
 * MUTEX INVARIANT:
 * The `runStarting` flag MUST be set synchronously (before any await) in the
 * POST /api/run handler. This prevents two concurrent requests from both
 * passing the `if (ctx.activeRun || ctx.runStarting)` check during the same
 * event loop tick. Refactoring that inserts an `await` between the check and
 * `setRunStarting(true)` WILL introduce a race condition.
 */
export interface RequestContext {
  host: string;
  port: number;
  isLocalhost: boolean;
  authToken: string;
  codexDefaults: Awaited<ReturnType<typeof getCodexDefaultResolvedRuntime>>;
  activeRun: ActiveUiRun | null;
  setActiveRun: (run: ActiveUiRun | null) => void;
  activeRunStatus: UiRunStatus;
  setActiveRunStatus: (status: UiRunStatus) => void;
  appendRunLog: (entry: Omit<import("./shared.js").UiRunLogEntry, "timestamp">) => void;
  setRunStatus: (status: Partial<UiRunStatus>) => void;
  runGeneration: number;
  incrementRunGeneration: () => number;
  runStarting: boolean;
  setRunStarting: (val: boolean) => void;
  flushSaveRunState: () => Promise<void>;
  /**
   * Persistent per-run log stores. Keyed by runId so logs survive after
   * activeRun is nulled (e.g. for post-run failure diagnosis).
   * Eviction: keeps last MAX_PERSISTED_LOG_RUNS runs.
   */
  agentLogStores: Map<string, AgentLogStore>;
  /** Get log store for a completed run (by runId) */
  getLogStore: (runId: string) => AgentLogStore | undefined;
}

export function createRequestHandler(ctx: RequestContext) {
  return async function handleRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    const requestStartTime = Date.now();
    let requestPath = "/";
    const requestMethod = request.method ?? "GET";
    let responseStatusCode = 200;

    try {
      const requestUrl = new URL(request.url ?? "/", `http://${ctx.host}:${ctx.port}`);
      requestPath = requestUrl.pathname;

      // ─── Middleware: Rate limiting ───
      if (requestUrl.pathname.startsWith("/api/")) {
        const clientIp = getClientIp(request);
        const rateLimitResult = checkRateLimit(clientIp, requestUrl.pathname);
        if (!rateLimitResult.allowed) {
          const retryAfterSeconds = Math.ceil((rateLimitResult.retryAfterMs ?? 1000) / 1000);
          response.writeHead(429, {
            "Content-Type": "application/json; charset=utf-8",
            "Retry-After": String(retryAfterSeconds),
            "Cache-Control": "no-store"
          });
          response.end(JSON.stringify({
            error: "Rate limit exceeded. Please wait before retrying.",
            retryAfterSeconds
          }));
          return;
        }
      }

      // ─── Middleware: CORS protection ───
      const origin = request.headers.origin;
      if (!checkCorsOrigin(origin, ctx.host, ctx.port)) {
        sendApiResponse(response, jsonResponse({ error: "Cross-origin requests are not allowed." }, 403));
        return;
      }

      // ─── Middleware: Token authentication ───
      const clientIp = getClientIp(request);
      if (!checkAuthHeader(requestUrl, request.method, ctx.isLocalhost, ctx.authToken, request.headers.authorization, clientIp)) {
        sendApiResponse(response, jsonResponse({ error: "Authentication required. Pass token via Authorization: Bearer <token> header." }, 401));
        return;
      }

      // ─── API Routes ───

      // GET /api/ui-info
      if (request.method === "GET" && requestUrl.pathname === "/api/ui-info") {
        sendApiResponse(response, await withErrorHandling(handleUiInfo(ctx.codexDefaults, ctx.host, ctx.port, ctx.isLocalhost)));
        return;
      }

      // GET /api/adapters
      if (request.method === "GET" && requestUrl.pathname === "/api/adapters") {
        sendApiResponse(response, await withErrorHandling(handleAdaptersList()));
        return;
      }

      // POST /api/preflight
      if (request.method === "POST" && requestUrl.pathname === "/api/preflight") {
        const rawBody = await readRequestBody(request);
        sendApiResponse(response, await withErrorHandling(handlePreflight(rawBody)));
        return;
      }

      // POST /api/quick-preflight
      if (request.method === "POST" && requestUrl.pathname === "/api/quick-preflight") {
        const rawBody = await readRequestBody(request);
        sendApiResponse(response, await withErrorHandling(handleQuickPreflight(rawBody)));
        return;
      }

      // GET /api/provider-profiles
      if (request.method === "GET" && requestUrl.pathname === "/api/provider-profiles") {
        sendApiResponse(response, await withErrorHandling(handleProviderProfilesGet()));
        return;
      }

      // POST /api/provider-profiles
      if (request.method === "POST" && requestUrl.pathname === "/api/provider-profiles") {
        const rawBody = await readRequestBody(request);
        sendApiResponse(response, await withErrorHandling(handleProviderProfileCreate(rawBody)));
        return;
      }

      // /api/provider-profiles/:id and /api/provider-profiles/:id/secret
      const providerProfileMatch = requestUrl.pathname.match(/^\/api\/provider-profiles\/([^/]+)(?:\/(secret))?$/);
      if (providerProfileMatch) {
        const profileId = decodeURIComponent(providerProfileMatch[1]);
        const action = providerProfileMatch[2];

        if (request.method === "PUT" && !action) {
          const rawBody = await readRequestBody(request);
          sendApiResponse(response, await withErrorHandling(handleProviderProfileUpdate(profileId, rawBody)));
          return;
        }

        if (request.method === "DELETE" && !action) {
          sendApiResponse(response, await withErrorHandling(handleProviderProfileDelete(profileId)));
          return;
        }

        if (request.method === "POST" && action === "secret") {
          const rawBody = await readRequestBody(request);
          sendApiResponse(response, await withErrorHandling(handleProviderProfileSecret(profileId, rawBody)));
          return;
        }
      }

      // POST /api/create-adhoc-taskpack
      if (request.method === "POST" && requestUrl.pathname === "/api/create-adhoc-taskpack") {
        const rawBody = await readRequestBody(request);
        sendApiResponse(response, await withErrorHandling(handleCreateAdhocTaskpack(rawBody)));
        return;
      }

      // POST /api/check-compatibility
      if (request.method === "POST" && requestUrl.pathname === "/api/check-compatibility") {
        const rawBody = await readRequestBody(request);
        sendApiResponse(response, await withErrorHandling(handleCheckCompatibility(rawBody)));
        return;
      }

      // GET /api/adhoc-taskpacks
      if (request.method === "GET" && requestUrl.pathname === "/api/adhoc-taskpacks") {
        sendApiResponse(response, await handleAdhocTaskpacksList());
        return;
      }

      // DELETE /api/adhoc-taskpacks/:id
      if (request.method === "DELETE" && requestUrl.pathname.startsWith("/api/adhoc-taskpacks/")) {
        const adhocId = decodeURIComponent(requestUrl.pathname.slice("/api/adhoc-taskpacks/".length));
        sendApiResponse(response, await handleAdhocTaskpackDelete(adhocId));
        return;
      }

      // GET /api/taskpacks
      if (request.method === "GET" && requestUrl.pathname === "/api/taskpacks") {
        sendApiResponse(response, await handleTaskpacksList(requestUrl.searchParams));
        return;
      }

      // GET /api/agent-detection — EchoBird-style agent detection
      if (request.method === "GET" && requestUrl.pathname === "/api/agent-detection") {
        sendApiResponse(response, await withErrorHandling(handleAgentDetection()));
        return;
      }

      // GET /api/install-guides — install guide definitions for all agents
      if (request.method === "GET" && requestUrl.pathname === "/api/install-guides") {
        sendApiResponse(response, await withErrorHandling(handleInstallGuides()));
        return;
      }

      // GET /api/metrics — Prometheus metrics endpoint
      if (request.method === "GET" && requestUrl.pathname === "/api/metrics") {
        const { exportAllMetrics } = await import("@agentarena/core");
        const metricsText = exportAllMetrics();
        response.writeHead(200, {
          "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
          "Cache-Control": "no-store"
        });
        response.end(metricsText);
        return;
      }

      // GET /api/run-status
      if (request.method === "GET" && requestUrl.pathname === "/api/run-status") {
        sendApiResponse(response, jsonResponse(ctx.activeRunStatus));
        return;
      }

      // GET /api/agent-logs?agentId=xxx&limit=50[&runId=xxx] — per-agent log lines
      // Supports both live (activeRun) and post-run (persisted by runId) queries.
      if (request.method === "GET" && requestUrl.pathname === "/api/agent-logs") {
        const agentId = requestUrl.searchParams.get("agentId") ?? "";
        const runId = requestUrl.searchParams.get("runId") ?? "";
        const limit = Number.parseInt(requestUrl.searchParams.get("limit") ?? "200", 10);
        // Try active run first (live), then fall back to persisted store (post-run)
        const store = ctx.activeRun?.agentLogStore ?? (runId ? ctx.getLogStore(runId) : undefined);
        if (!store) {
          sendApiResponse(response, jsonResponse({ logs: [] }));
          return;
        }
        const logs = store.last(agentId, Number.isFinite(limit) ? Math.min(limit, 1000) : 200);
        sendApiResponse(response, jsonResponse({ agentId, logs }));
        return;
      }

      // GET /api/run-stream?token=xxx — SSE live event stream
      if (request.method === "GET" && requestUrl.pathname === "/api/run-stream") {
        const token = requestUrl.searchParams.get("token") ?? "";
        if (token !== ctx.authToken) {
          response.writeHead(401, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
          response.end("Unauthorized");
          return;
        }
        // SSE connections are tracked on the active run and closed when the
        // run completes. If no run is active, send a single snapshot event.
        // Pass request for reliable client-disconnect detection.
        const conn = new SseConnection(response, request);
        if (ctx.activeRun) {
          ctx.activeRun.sseConnections?.add(conn);
          // Send current snapshot immediately on connect
          conn.send("snapshot", ctx.activeRunStatus);
        } else {
          // No active run — send current status and close
          conn.send("snapshot", ctx.activeRunStatus);
          conn.close("no-run", { message: "No active benchmark run." });
        }
        // Return without calling end() — SseConnection manages the response lifecycle.
        return;
      }

      // POST /api/run — kept in-line due to deep state coupling
      if (request.method === "POST" && requestUrl.pathname === "/api/run") {
        // Mutex guard: In Node.js's single-threaded event loop, the check and assignment
        // below are atomic within a single synchronous block. However, the await for
        // readRequestBody() yields control, during which another request could pass the
        // activeRun check. We use the runStarting flag set synchronously before any await
        // to prevent this race condition.
        if (ctx.activeRun || ctx.runStarting) {
          sendApiResponse(response, jsonResponse({ error: "A benchmark run is already in progress." }, 409));
          return;
        }
        // Synchronously acquire the mutex before any async operations
        ctx.setRunStarting(true);

        let rawBody: string;
        try {
          rawBody = await readRequestBody(request);
        } catch (readError) {
          ctx.setRunStarting(false);
          throw readError;
        }
        let runPayload: UiRunPayload;
        try {
          runPayload = JSON.parse(rawBody) as UiRunPayload;
        } catch {
          ctx.setRunStarting(false);
          sendApiResponse(response, jsonResponse({ error: "Invalid JSON in request body." }, 400));
          return;
        }

        const validationError = validateRunPayload(runPayload);
        if (validationError) {
          ctx.setRunStarting(false);
          sendApiResponse(response, jsonResponse({ error: validationError }, 400));
          return;
        }

        const selections = normalizeUiSelections(runPayload);
        if (selections.length === 0) {
          ctx.setRunStarting(false);
          sendApiResponse(response, jsonResponse({ error: "At least one agent selection is required." }, 400));
          return;
        }
        const outputPath = path.resolve(runPayload.outputPath || path.join(process.cwd(), ".agentarena", "ui-runs"));

        // Reset status to clean state before starting a new run
        const freshStatus: UiRunStatus = {
          state: "idle",
          phase: "idle",
          logs: [],
          updatedAt: new Date().toISOString()
        };
        ctx.setActiveRunStatus(freshStatus);
        // This is a new-run boundary — flush before resetting so any pending
        // debounced save from the previous run lands first.
        await ctx.flushSaveRunState();

        ctx.setRunStatus({
          state: "running",
          phase: "starting",
          startedAt: new Date().toISOString(),
          repoPath: runPayload.repoPath,
          taskPath: runPayload.taskPath,
          outputPath
        });
        ctx.appendRunLog({
          phase: "starting",
          message: `Starting benchmark for ${selections.length} selection(s).`
        });

        const cancellationController = new AbortController();
        const cancellation = createCancellation(cancellationController.signal);
        const currentRunGeneration = ctx.incrementRunGeneration();
        const uiRunId = createRunId();

        // SSE connection tracking + agent log store — declared in outer scope
        // so the finally block (which runs even on error) can close connections
        // and the SSE endpoint can access the log store immediately.
        const runSseConnections = new Set<SseConnection>();
        const agentLogStore = new AgentLogStore(1000);

        // Trace tailers — one per running agent, emits real-time trace records via SSE
        const traceTailers = new Map<string, { tailer: TraceTailer; variantId: string }>();

        const activeRun = {
          cancel: () => cancellationController.abort(),
          sseConnections: runSseConnections,
          agentLogStore,
          promise: (async () => {
          // Mutex is now transferred to activeRun; clear the starting flag
          ctx.setRunStarting(false);
          try {
            const benchmark = await runBenchmark({
              runId: uiRunId,
              repoPath: runPayload.repoPath,
              taskPath: runPayload.taskPath,
              agentIds: selections.map((selection) => selection.baseAgentId),
              agents: selections,
              outputPath,
              probeAuth: runPayload.probeAuth,
              updateSnapshots: runPayload.updateSnapshots,
              cleanupWorkspaces: runPayload.cleanupWorkspaces,
              maxConcurrency: runPayload.maxConcurrency,
              scoreMode: runPayload.scoreMode,
              tokenBudget: runPayload.tokenBudget ? (Number(runPayload.tokenBudget) || undefined) : undefined,
              cancellation,
              enableActivityEvents: true,
              agentLogStore,
              onProgress: (event: BenchmarkProgressEvent) => {
                const phase =
                  event.phase === "starting" || event.phase === "preflight"
                    ? event.phase
                    : event.phase === "report"
                      ? "report"
                      : event.phase === "agent-activity"
                        ? "benchmark"
                        : "benchmark";
                ctx.setRunStatus({
                  phase,
                  currentAgentId:
                    event.phase === "agent-start" || event.phase === "agent-finish"
                      ? event.agentId
                      : ctx.activeRunStatus.currentAgentId,
                  currentVariantId:
                    event.phase === "agent-start" || event.phase === "agent-finish"
                      ? event.variantId
                      : ctx.activeRunStatus.currentVariantId,
                  currentDisplayLabel:
                    event.phase === "agent-start" || event.phase === "agent-finish"
                      ? event.displayLabel
                      : ctx.activeRunStatus.currentDisplayLabel,
                  snapshot: event.snapshot ?? ctx.activeRunStatus.snapshot
                });
                ctx.appendRunLog({
                  phase,
                  message: event.message,
                  agentId: event.agentId,
                  variantId: event.variantId,
                  displayLabel: event.displayLabel
                });

                // Prune connections whose client disconnected (browser refresh) so
                // the Set doesn't accumulate stale references during long runs.
                // Safe to mutate a Set during for..of iteration.
                for (const conn of runSseConnections) {
                  if (conn.isClosed) {
                    runSseConnections.delete(conn);
                  }
                }
                // Broadcast to all connected SSE clients
                for (const conn of runSseConnections) {
                  if (conn.isClosed) continue;
                  if (event.phase === "agent-activity") {
                    conn.send("activity", {
                      agentId: event.agentId,
                      variantId: event.variantId,
                      displayLabel: event.displayLabel,
                      line: event.line,
                      seq: event.seq,
                      stream: event.stream,
                      ts: Date.now()
                    });
                  } else {
                    conn.send("progress", {
                      phase: event.phase,
                      message: event.message,
                      agentId: event.agentId,
                      variantId: event.variantId,
                      displayLabel: event.displayLabel,
                      snapshot: event.snapshot,
                      ts: Date.now()
                    });
                  }
                }

                // Trace tailer lifecycle — start on agent-start, stop on agent-finish
                if (event.phase === "agent-start" && event.variantId && outputPath) {
                  const tracePath = path.join(outputPath, "agents", event.variantId, "trace.jsonl");
                  // Only start if not already tailing this variant
                  if (!traceTailers.has(event.variantId)) {
                    const tailer = new TraceTailer(tracePath, (record) => {
                      // Broadcast new trace records to all SSE clients
                      for (const conn of runSseConnections) {
                        if (conn.isClosed) continue;
                        conn.send("trace-record", {
                          agentId: event.agentId,
                          variantId: event.variantId,
                          displayLabel: event.displayLabel,
                          record,
                          ts: Date.now()
                        });
                      }
                    });
                    tailer.start();
                    traceTailers.set(event.variantId, { tailer, variantId: event.variantId });
                  }
                }
                if (event.phase === "agent-finish" && event.variantId) {
                  const entry = traceTailers.get(event.variantId);
                  if (entry) {
                    entry.tailer.stop();  // grace tick flushes trailing records
                    traceTailers.delete(event.variantId);
                  }
                }
              }
            });

            // Persist the log store BEFORE activeRun is nulled in finally.
            // This enables /api/agent-logs?runId=xxx to work post-run.
            ctx.agentLogStores.set(uiRunId, agentLogStore);
            // Evict oldest if over capacity (keep last 10 runs)
            const MAX_PERSISTED = 10;
            if (ctx.agentLogStores.size > MAX_PERSISTED) {
              const oldest = ctx.agentLogStores.keys().next().value;
              if (oldest) ctx.agentLogStores.delete(oldest);
            }

            // Store references so SSE endpoint and /api/agent-logs can access them
            if (ctx.activeRun) {
              ctx.activeRun.agentLogStore = agentLogStore;
              ctx.activeRun.sseConnections = runSseConnections;
            }

            const runCancelled =
              cancellationController.signal.aborted || benchmark.results.some((result) => result.status === "cancelled");
            if (runCancelled) {
              ctx.appendRunLog({
                phase: ctx.activeRunStatus.phase,
                message: "Run cancelled."
              });
              ctx.setRunStatus({
                state: "cancelled",
                phase: "idle",
                error: undefined,
                currentAgentId: undefined,
                currentVariantId: undefined,
                currentDisplayLabel: undefined,
                result: undefined
              });
              return;
            }

            ctx.setRunStatus({
              phase: "report",
              currentAgentId: undefined,
              currentVariantId: undefined,
              currentDisplayLabel: undefined
            });
            ctx.appendRunLog({
              phase: "report",
              message: "Writing report artifacts."
            });
            const report = await writeReport(benchmark, {
              locale: resolveReportLocale(process.env.AGENTARENA_LOCALE)
            });
            ctx.appendRunLog({
              phase: "report",
              message: "Report artifacts are ready."
            });
            const run = JSON.parse(await fs.readFile(report.jsonPath, "utf8"));
            const markdown = await fs.readFile(report.markdownPath, "utf8");
            ctx.setRunStatus({
              state: "done",
              phase: "idle",
              result: { run, markdown, report }
            });
          } catch (runError) {
            const errorMessage = runError instanceof Error ? runError.message : String(runError);
            ctx.appendRunLog({
              phase: ctx.activeRunStatus.phase,
              message: isAbortError(runError) ? "Run cancelled." : `Run failed: ${errorMessage}`
            });
            ctx.setRunStatus(
              isAbortError(runError)
                ? {
                    state: "cancelled",
                    phase: "idle",
                    error: undefined,
                    currentAgentId: undefined,
                    currentVariantId: undefined,
                    currentDisplayLabel: undefined
                  }
                : {
                    state: "error",
                    error: errorMessage
                  }
            );
          } finally {
            // Stop all trace tailers (they were tracking this run)
            for (const [, entry] of traceTailers) {
              try { entry.tailer.stop(); } catch { /* ignore */ }
            }
            traceTailers.clear();
            // Close all SSE connections (they were tracking this run)
            for (const conn of runSseConnections) {
              if (!conn.isClosed) {
                try { conn.close("done", { runId: uiRunId }); } catch { /* ignore */ }
              }
            }
            runSseConnections.clear();
            // Only update state if this is still the current run (not stale from a cancel/restart)
            if (currentRunGeneration === ctx.runGeneration) {
              if (ctx.activeRunStatus.state !== "cancelling" && ctx.activeRunStatus.state !== "cancelled" && ctx.activeRunStatus.state !== "error") {
                ctx.setActiveRunStatus({ ...ctx.activeRunStatus, state: "done" });
              }
              ctx.setActiveRun(null);
              // Clear persisted state on completion
              const { clearRunState } = await import("@agentarena/core");
              clearRunState(process.cwd()).catch(() => {});
            }
          }
        })()
        };

        ctx.setActiveRun(activeRun);

        sendApiResponse(response, jsonResponse({ accepted: true }, 202));
        return;
      }

      // POST /api/run/cancel
      if (request.method === "POST" && requestUrl.pathname === "/api/run/cancel") {
        if (!ctx.activeRun) {
          sendApiResponse(response, jsonResponse({ error: "No benchmark run in progress." }, 409));
          return;
        }
        ctx.activeRun.cancel();
        ctx.setActiveRunStatus({ ...ctx.activeRunStatus, state: "cancelling" });
        // Don't set activeRun = null here — let the old run's finally block handle it.
        // Setting it null here would allow a new run to start while the old one is still
        // cleaning up, causing state corruption via the stale finally block.
        ctx.appendRunLog({ phase: ctx.activeRunStatus.phase, message: "Cancellation requested by user." });
        sendApiResponse(response, jsonResponse({ cancelled: true }));
        return;
      }

      // ─── Static file serving ───

      if (request.method === "GET") {
        // SECURITY: resolve the web root via realpath once so symlink / \\?\ long-path
        // forms cannot escape the containment check below.
        const rootReal = await fs.realpath(WEB_REPORT_DIST_ROOT).catch(() => WEB_REPORT_DIST_ROOT);
        let filePath = requestUrl.pathname === "/" ? path.join(WEB_REPORT_DIST_ROOT, "index.html") : path.join(WEB_REPORT_DIST_ROOT, requestUrl.pathname.replace(/^\/+/, ""));
        filePath = path.normalize(filePath);
        // Re-resolve the target via realpath (falls back to the normalized path if
        // it does not exist yet, e.g. SPA routes) so symlink escapes are caught.
        const fileReal = await fs.realpath(filePath).catch(() => filePath);
        const insideWorkspace = await isPathInsideWorkspace(rootReal, fileReal);
        if (!insideWorkspace) {
          sendApiResponse(response, textResponse("Forbidden", 403));
          return;
        }

        try {
          let body = await fs.readFile(filePath);

          // SECURITY: Auth token injection for localhost UX (nonce-based CSP)
          //
          // Acceptable trade-off for a localhost-only dev tool:
          // - The meta tag and inline script exist briefly in the HTML response.
          // - A per-request CSP nonce restricts script execution to only the
          //   cleanup script; any injected <script> without the nonce is blocked.
          // - The meta tag is the FIRST thing the script reads, and .remove()
          //   is called immediately after copying to sessionStorage.
          // - sessionStorage is tab-scoped (not persisted across tabs or restarts).
          // - The server only injects this for 127.0.0.1/localhost connections.
          // - Risk: brief token visibility in raw HTTP response body (localhost only).
          //   Mitigated by: localhost binding + CORS + CSP nonce + no-cache headers.
          // - The token is NOT persisted in saved pages, screenshots, or printouts.
          const isInjectingToken = ctx.isLocalhost && filePath.endsWith("index.html") && ctx.authToken;
          const cspNonce = isInjectingToken ? randomBytes(16).toString("base64") : "";

          if (isInjectingToken) {
            let html = body.toString("utf8");
            const metaTag = `<meta name="agentarena-auth-token" content="${escapeHtmlAttribute(ctx.authToken)}">`;
            // Nonce restricts execution to this single script tag only.
            // The first action is reading + removing the meta tag so no other
            // script (even same-origin) can access it after this point.
            const cleanupScript = `<script nonce="${cspNonce}">(function(){var m=document.querySelector('meta[name="agentarena-auth-token"]');if(m){try{sessionStorage.setItem('agentarena-auth-token',m.getAttribute('content'))}catch(e){/* ignore: sessionStorage may be unavailable */}m.remove()}})();</script>`;
            // Inject meta tag and its cleanup script immediately before </head>
            // so they execute before any app scripts.
            const injection = `  ${metaTag}\n  ${cleanupScript}\n`;
            if (html.includes("</head>")) {
              html = html.replace("</head>", `${injection}</head>`);
            } else {
              html = injection + html;
            }
            body = Buffer.from(html, "utf8");
          }

          const scriptSrcPolicy = cspNonce
            ? `script-src 'self' 'nonce-${cspNonce}'`
            : "script-src 'self'";

          response.writeHead(200, {
            "Content-Type": detectContentType(filePath),
            "Cache-Control": "no-store",
            "Content-Security-Policy": `default-src 'self'; ${scriptSrcPolicy}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://raw.githubusercontent.com`,
            "X-Frame-Options": "DENY",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
          });
          response.end(body);
          return;
        } catch {
          sendApiResponse(response, textResponse("Not Found", 404));
          return;
        }
      }

      const methodNotAllowed = textResponse("Method Not Allowed", 405);
      response.writeHead(methodNotAllowed.statusCode, methodNotAllowed.headers);
      response.end(methodNotAllowed.body);
    } catch (error) {
      const statusCode = error instanceof HttpError ? error.statusCode : 500;
      responseStatusCode = statusCode;
      const message = statusCode >= 500 ? "Internal server error" : (error instanceof Error ? error.message : String(error));
      const payload = jsonResponse({ error: message }, statusCode);
      response.writeHead(payload.statusCode, payload.headers);
      response.end(payload.body);
    } finally {
      const durationSeconds = (Date.now() - requestStartTime) / 1000;
      const actualStatusCode = response.statusCode || responseStatusCode;
      metrics.httpRequestsTotal.inc({ method: requestMethod, path: requestPath, status: String(actualStatusCode) });
      metrics.httpRequestDuration.observe({ method: requestMethod, path: requestPath }, durationSeconds);
    }
  };
}
