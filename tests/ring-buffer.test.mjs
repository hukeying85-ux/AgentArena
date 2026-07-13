import assert from "node:assert/strict";
import { test } from "node:test";
import { AgentLogStore, RingBuffer } from "../packages/core/dist/ring-buffer.js";

test("RingBuffer: basic push and toArray", () => {
  const rb = new RingBuffer(3);
  rb.push("a");
  rb.push("b");
  assert.deepEqual(rb.toArray(), ["a", "b"]);
});

test("RingBuffer: overflow overwrites oldest", () => {
  const rb = new RingBuffer(2);
  rb.push("a");
  rb.push("b");
  rb.push("c");
  assert.deepEqual(rb.toArray(), ["b", "c"]);
});

test("RingBuffer: last() returns most recent N items", () => {
  const rb = new RingBuffer(5);
  rb.push(1);
  rb.push(2);
  rb.push(3);
  assert.deepEqual(rb.last(2), [2, 3]);
  assert.deepEqual(rb.last(10), [1, 2, 3]);
});

test("RingBuffer: clear() empties the buffer", () => {
  const rb = new RingBuffer(3);
  rb.push("a");
  rb.push("b");
  rb.clear();
  assert.equal(rb.size, 0);
  assert.deepEqual(rb.toArray(), []);
});

test("RingBuffer: throws on zero capacity", () => {
  assert.throws(() => new RingBuffer(0), /capacity must be > 0/);
});

test("AgentLogStore: append and get per agent", () => {
  const store = new AgentLogStore(100);
  store.append("agent1", { seq: 0, ts: 1000, stream: "stdout", text: "hello" });
  store.append("agent1", { seq: 1, ts: 1001, stream: "stdout", text: "world" });
  store.append("agent2", { seq: 0, ts: 1000, stream: "stderr", text: "error" });

  assert.equal(store.get("agent1").length, 2);
  assert.equal(store.get("agent2").length, 1);
  assert.equal(store.get("nonexistent").length, 0);
});

test("AgentLogStore: per-agent capacity limit", () => {
  const store = new AgentLogStore(2);
  store.append("a1", { seq: 0, ts: 1, stream: "stdout", text: "line1" });
  store.append("a1", { seq: 1, ts: 2, stream: "stdout", text: "line2" });
  store.append("a1", { seq: 2, ts: 3, stream: "stdout", text: "line3" });

  const lines = store.get("a1");
  assert.equal(lines.length, 2);
  assert.equal(lines[0].text, "line2");
  assert.equal(lines[1].text, "line3");
});

test("AgentLogStore: last() returns last N lines", () => {
  const store = new AgentLogStore(100);
  for (let i = 0; i < 10; i++) {
    store.append("a1", { seq: i, ts: i, stream: "stdout", text: `line${i}` });
  }
  const last3 = store.last("a1", 3);
  assert.equal(last3.length, 3);
  assert.equal(last3[2].text, "line9");
});

test("AgentLogStore: agentIds() returns all agents with logs", () => {
  const store = new AgentLogStore(100);
  store.append("a1", { seq: 0, ts: 1, stream: "stdout", text: "x" });
  store.append("a2", { seq: 0, ts: 1, stream: "stdout", text: "y" });
  const ids = store.agentIds().sort();
  assert.deepEqual(ids, ["a1", "a2"]);
});

test("AgentLogStore: clearAgent() removes one agent", () => {
  const store = new AgentLogStore(100);
  store.append("a1", { seq: 0, ts: 1, stream: "stdout", text: "x" });
  store.append("a2", { seq: 0, ts: 1, stream: "stdout", text: "y" });
  store.clearAgent("a1");
  assert.equal(store.get("a1").length, 0);
  assert.equal(store.get("a2").length, 1);
});
