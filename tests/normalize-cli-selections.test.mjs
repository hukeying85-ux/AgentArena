import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCliSelections } from "../packages/cli/dist/commands/shared.js";

function makeParsed(overrides = {}) {
  return {
    agentIds: [],
    codexModel: undefined,
    codexReasoning: undefined,
    claudeModel: undefined,
    claudeProfile: undefined,
    geminiModel: undefined,
    aiderModel: undefined,
    kiloModel: undefined,
    opencodeModel: undefined,
    qwenModel: undefined,
    copilotModel: undefined,
    ...overrides,
  };
}

// --- codex ---

test("codex extracts model and reasoningEffort", () => {
  const result = normalizeCliSelections(
    makeParsed({
      agentIds: ["codex"],
      codexModel: "o3",
      codexReasoning: "high",
    })
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].baseAgentId, "codex");
  assert.equal(result[0].config.model, "o3");
  assert.equal(result[0].config.reasoningEffort, "high");
  assert.equal(result[0].configSource, "cli");
});

test("codex with no config has undefined configSource", () => {
  const result = normalizeCliSelections(makeParsed({ agentIds: ["codex"] }));
  assert.equal(result[0].configSource, undefined);
});

// --- claude-code ---

test("claude-code extracts model and providerProfileId", () => {
  const result = normalizeCliSelections(
    makeParsed({
      agentIds: ["claude-code"],
      claudeModel: "sonnet",
      claudeProfile: "work",
    })
  );
  assert.equal(result[0].config.model, "sonnet");
  assert.equal(result[0].config.providerProfileId, "work");
  assert.equal(result[0].configSource, "cli");
});

test("claude-code with no config has undefined configSource", () => {
  const result = normalizeCliSelections(makeParsed({ agentIds: ["claude-code"] }));
  assert.equal(result[0].configSource, undefined);
});

// --- gemini-cli ---

test("gemini-cli extracts model", () => {
  const result = normalizeCliSelections(
    makeParsed({ agentIds: ["gemini-cli"], geminiModel: "gemini-2.5-pro" })
  );
  assert.equal(result[0].config.model, "gemini-2.5-pro");
  assert.equal(result[0].configSource, "cli");
});

// --- aider ---

test("aider extracts model", () => {
  const result = normalizeCliSelections(
    makeParsed({ agentIds: ["aider"], aiderModel: "gpt-4o" })
  );
  assert.equal(result[0].config.model, "gpt-4o");
  assert.equal(result[0].configSource, "cli");
});

// --- kilo-cli ---

test("kilo-cli extracts model", () => {
  const result = normalizeCliSelections(
    makeParsed({ agentIds: ["kilo-cli"], kiloModel: "claude-sonnet" })
  );
  assert.equal(result[0].config.model, "claude-sonnet");
  assert.equal(result[0].configSource, "cli");
});

// --- opencode ---

test("opencode extracts model", () => {
  const result = normalizeCliSelections(
    makeParsed({ agentIds: ["opencode"], opencodeModel: "gpt-4o" })
  );
  assert.equal(result[0].config.model, "gpt-4o");
  assert.equal(result[0].configSource, "cli");
});

// --- qwen-code ---

test("qwen-code extracts model", () => {
  const result = normalizeCliSelections(
    makeParsed({ agentIds: ["qwen-code"], qwenModel: "qwen-max" })
  );
  assert.equal(result[0].config.model, "qwen-max");
  assert.equal(result[0].configSource, "cli");
});

// --- copilot ---

test("copilot extracts model", () => {
  const result = normalizeCliSelections(
    makeParsed({ agentIds: ["copilot"], copilotModel: "gpt-4o" })
  );
  assert.equal(result[0].config.model, "gpt-4o");
  assert.equal(result[0].configSource, "cli");
});

// --- unknown agent ---

test("unknown agent gets empty config and undefined configSource", () => {
  const result = normalizeCliSelections(
    makeParsed({ agentIds: ["unknown-agent"] })
  );
  assert.deepEqual(result[0].config, {});
  assert.equal(result[0].configSource, undefined);
});

// --- multiple agents ---

test("multiple agents each get their own config", () => {
  const result = normalizeCliSelections(
    makeParsed({
      agentIds: ["codex", "claude-code", "demo-fast"],
      codexModel: "o3",
      claudeModel: "sonnet",
    })
  );
  assert.equal(result.length, 3);
  assert.equal(result[0].config.model, "o3");
  assert.equal(result[1].config.model, "sonnet");
  assert.deepEqual(result[2].config, {});
});

// --- whitespace trimming ---

test("model values are trimmed", () => {
  const result = normalizeCliSelections(
    makeParsed({ agentIds: ["codex"], codexModel: "  o3  " })
  );
  assert.equal(result[0].config.model, "o3");
});

test("empty string model becomes undefined", () => {
  const result = normalizeCliSelections(
    makeParsed({ agentIds: ["codex"], codexModel: "  " })
  );
  assert.equal(result[0].config.model, undefined);
});
