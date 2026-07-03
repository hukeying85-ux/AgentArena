import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { TraceReplayer } from "../packages/trace/dist/replay.js";
import { JsonlTraceRecorder } from "../packages/trace/dist/index.js";

test("TraceReplayer builds timeline from events", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "trace-replay-"));
  const tracePath = path.join(dir, "trace.jsonl");
  try {
    const recorder = new JsonlTraceRecorder(tracePath);
    await recorder.record({ type: "adapter.start", timestamp: "2026-01-01T00:00:00.000Z", message: "start", agentId: "a1" });
    await recorder.record({ type: "adapter.end", timestamp: "2026-01-01T00:00:01.000Z", message: "end", agentId: "a1" });
    await recorder.close();

    const replayer = new TraceReplayer(tracePath);
    const timeline = await replayer.buildTimeline();

    assert.equal(timeline.steps.length, 2);
    assert.equal(timeline.metadata.totalEvents, 2);
    assert.equal(timeline.metadata.agentId, "a1");
    assert.equal(timeline.metadata.errorCount, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("TraceReplayer groups events within time window", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "trace-replay-"));
  const tracePath = path.join(dir, "trace.jsonl");
  try {
    const recorder = new JsonlTraceRecorder(tracePath);
    await recorder.record({ type: "adapter.start", timestamp: "2026-01-01T00:00:00.000Z", message: "a", agentId: "a1" });
    await recorder.record({ type: "adapter.tool_call", timestamp: "2026-01-01T00:00:00.050Z", message: "b", agentId: "a1" });
    await recorder.record({ type: "adapter.end", timestamp: "2026-01-01T00:00:02.000Z", message: "c", agentId: "a1" });
    await recorder.close();

    const replayer = new TraceReplayer(tracePath);
    const timeline = await replayer.buildTimeline({ stepWindowMs: 100 });

    assert.equal(timeline.steps.length, 2);
    assert.equal(timeline.steps[0].events.length, 2);
    assert.equal(timeline.steps[1].events.length, 1);
    assert.equal(timeline.steps[0].category, "agent");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("TraceReplayer counts error events", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "trace-replay-"));
  const tracePath = path.join(dir, "trace.jsonl");
  try {
    const recorder = new JsonlTraceRecorder(tracePath);
    await recorder.record({ type: "adapter.start", timestamp: "2026-01-01T00:00:00.000Z", message: "ok", agentId: "a1" });
    await recorder.record({ type: "adapter.error", timestamp: "2026-01-01T00:00:01.000Z", message: "fail", agentId: "a1" });
    await recorder.close();

    const replayer = new TraceReplayer(tracePath);
    const timeline = await replayer.buildTimeline();

    assert.equal(timeline.metadata.errorCount, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("TraceReplayer applies filter", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "trace-replay-"));
  const tracePath = path.join(dir, "trace.jsonl");
  try {
    const recorder = new JsonlTraceRecorder(tracePath);
    await recorder.record({ type: "adapter.start", timestamp: "2026-01-01T00:00:00.000Z", message: "a", agentId: "a1" });
    await recorder.record({ type: "judge.result", timestamp: "2026-01-01T00:00:01.000Z", message: "b", agentId: "a1" });
    await recorder.record({ type: "adapter.end", timestamp: "2026-01-01T00:00:02.000Z", message: "c", agentId: "a1" });
    await recorder.close();

    const replayer = new TraceReplayer(tracePath);
    const timeline = await replayer.buildTimeline({ filter: { type: ["adapter.start", "adapter.end"] } });

    assert.equal(timeline.metadata.totalEvents, 2);
    assert.deepEqual(Object.keys(timeline.metadata.eventTypes).sort(), ["adapter.end", "adapter.start"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("JsonlTraceRecorder buffered write flushes on close", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "trace-buffer-"));
  const tracePath = path.join(dir, "trace.jsonl");
  try {
    const recorder = new JsonlTraceRecorder(tracePath, 10);
    await recorder.record({ type: "test.a", timestamp: "2026-01-01T00:00:00.000Z", message: "a", agentId: "a1" });
    await recorder.record({ type: "test.b", timestamp: "2026-01-01T00:00:01.000Z", message: "b", agentId: "a1" });
    await recorder.close();

    const replayer = new TraceReplayer(tracePath);
    const timeline = await replayer.buildTimeline();
    assert.equal(timeline.metadata.totalEvents, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("JsonlTraceRecorder buffered write auto-flushes when buffer full", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "trace-buffer-"));
  const tracePath = path.join(dir, "trace.jsonl");
  try {
    const recorder = new JsonlTraceRecorder(tracePath, 3);
    for (let i = 0; i < 5; i++) {
      await recorder.record({ type: "test.event", timestamp: `2026-01-01T00:00:0${i}.000Z`, message: `e${i}`, agentId: "a1" });
    }
    await recorder.close();

    const replayer = new TraceReplayer(tracePath);
    const timeline = await replayer.buildTimeline();
    assert.equal(timeline.metadata.totalEvents, 5);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("TraceReplayer buildTimeline with empty trace", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "trace-replay-"));
  const tracePath = path.join(dir, "trace.jsonl");
  try {
    const recorder = new JsonlTraceRecorder(tracePath);
    await recorder.close();

    const replayer = new TraceReplayer(tracePath);
    const timeline = await replayer.buildTimeline();

    assert.equal(timeline.steps.length, 0);
    assert.equal(timeline.metadata.totalEvents, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
