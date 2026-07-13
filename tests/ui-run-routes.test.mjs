import assert from "node:assert/strict";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { handleUiRunRequest } from "../packages/cli/dist/commands/ui-run-routes.js";

test("run start releases its reservation when the pre-run state flush fails", async () => {
  const payload = JSON.stringify({
    repoPath: process.cwd(),
    taskPath: path.join(process.cwd(), "examples", "taskpacks", "demo-repo-health.json"),
    agents: [{ baseAgentId: "demo-fast" }]
  });
  const request = Readable.from([payload]);
  request.method = "POST";
  const response = {
    writeHead() {},
    end() {}
  };
  let releases = 0;
  const ctx = {
    authToken: "test-token",
    activeRun: null,
    setActiveRun() {},
    activeRunStatus: { state: "idle", phase: "idle", logs: [], updatedAt: new Date().toISOString() },
    setActiveRunStatus(status) { this.activeRunStatus = status; },
    appendRunLog() {},
    setRunStatus() {},
    runGeneration: 0,
    incrementRunGeneration: () => 1,
    tryReserveStart: () => true,
    releaseStartReservation: () => { releases += 1; },
    flushSaveRunState: async () => { throw new Error("simulated state flush failure"); },
    rememberLogStore() {},
    getLogStore() { return undefined; },
    clearPersistedRunState: async () => {}
  };

  await assert.rejects(
    () => handleUiRunRequest(request, response, new URL("http://127.0.0.1/api/run"), ctx),
    /simulated state flush failure/
  );
  assert.equal(releases, 1);
});
