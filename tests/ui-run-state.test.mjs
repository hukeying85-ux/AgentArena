import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { UiRunStateController } from "../packages/cli/dist/commands/ui-run-state.js";

test("UiRunStateController owns start reservation, bounded logs, and restart recovery", async () => {
  const workingDirectory = await mkdtemp(path.join(os.tmpdir(), "agentarena-ui-state-"));
  try {
    const state = new UiRunStateController(workingDirectory, { logLimit: 2 });
    await state.restore();

    assert.equal(state.tryReserveStart(), true);
    assert.equal(state.tryReserveStart(), false);
    state.releaseStartReservation();
    assert.equal(state.tryReserveStart(), true);

    state.setStatus({ state: "running", phase: "starting" });
    state.appendLog({ phase: "starting", message: "first" });
    state.appendLog({ phase: "starting", message: "second" });
    state.appendLog({ phase: "starting", message: "third" });
    await state.flush();
    assert.deepEqual(state.status.logs.map((entry) => entry.message), ["second", "third"]);

    const restored = new UiRunStateController(workingDirectory, { logLimit: 2 });
    await restored.restore();
    assert.equal(restored.status.state, "error");
    assert.equal(restored.status.phase, "idle");
    assert.match(restored.status.error ?? "", /restarted/i);
    assert.deepEqual(restored.status.logs.map((entry) => entry.message), ["second", "third"]);
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
});



test("UiRunStateController serializes an in-flight debounced save before flush", async () => {
  const workingDirectory = await mkdtemp(path.join(os.tmpdir(), "agentarena-ui-state-"));
  let releaseFirstSave;
  let markFirstSaveStarted;
  const firstSaveStarted = new Promise((resolve) => { markFirstSaveStarted = resolve; });
  const firstSaveGate = new Promise((resolve) => { releaseFirstSave = resolve; });
  const savedStates = [];

  try {
    const state = new UiRunStateController(workingDirectory, {
      saveDebounceMs: 0,
      saveState: async (_cwd, persistedState) => {
        savedStates.push(persistedState.state);
        if (savedStates.length === 1) {
          markFirstSaveStarted();
          await firstSaveGate;
        }
      }
    });

    state.setStatus({ state: "running", phase: "benchmark" });
    await Promise.race([
      firstSaveStarted,
      new Promise((_, reject) => setTimeout(() => reject(new Error("debounced save did not start")), 250))
    ]);

    state.setStatus({ state: "done", phase: "report" });
    let flushSettled = false;
    const flushPromise = state.flush().then(() => { flushSettled = true; });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(flushSettled, false, "flush must wait for the in-flight save");

    releaseFirstSave();
    await flushPromise;
    assert.deepEqual(savedStates, ["running", "done"]);
  } finally {
    releaseFirstSave?.();
    await rm(workingDirectory, { recursive: true, force: true });
  }
});
