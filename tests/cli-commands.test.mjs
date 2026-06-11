import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI_ENTRY = path.join(REPO_ROOT, "packages", "cli", "dist", "index.js");

async function runCli(args, cwd, envOverrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_ENTRY, ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...envOverrides }
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}

// 1. Argument Validation Tests

test("agentarena --help prints help and exits 0", async () => {
  // Arrange
  const args = ["--help"];

  // Act
  const result = await runCli(args, process.cwd());

  // Assert
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /Commands:/);
});

test("agentarena run missing --repo exits 1", async () => {
  // Arrange
  const args = ["run", "--task", "task.yaml", "--agents", "demo-fast"];

  // Act
  const result = await runCli(args, process.cwd());

  // Assert
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Missing required argument: --repo/);
});

test("agentarena run missing --task exits 1", async () => {
  // Arrange
  const args = ["run", "--repo", ".", "--agents", "demo-fast"];

  // Act
  const result = await runCli(args, process.cwd());

  // Assert
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Missing required argument: --task/);
});

test("agentarena run missing --agents exits 1", async () => {
  // Arrange
  const args = ["run", "--repo", ".", "--task", "task.yaml"];

  // Act
  const result = await runCli(args, process.cwd());

  // Assert
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Missing required argument: --agents/);
});

test("agentarena run invalid argument exits 1", async () => {
  // Arrange
  const args = ["run", "--repo", ".", "--task", "task.yaml", "--agents", "demo-fast", "--invalid-flag"];

  // Act
  const result = await runCli(args, process.cwd());

  // Assert
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unknown argument: --invalid-flag/);
});

// 2. List Adapters Command

test("agentarena list-adapters prints adapters", async () => {
  // Arrange
  const args = ["list-adapters"];

  // Act
  const result = await runCli(args, process.cwd());

  // Assert
  assert.equal(result.code, 0);
  assert.match(result.stdout, /AgentArena Adapters/);
  assert.match(result.stdout, /demo-fast/);
  assert.match(result.stdout, /codex/);
});

// 3. Doctor Command

test("agentarena doctor runs successfully", async () => {
  // Arrange
  const args = ["doctor", "--agents", "demo-fast"];

  // Act
  const result = await runCli(args, process.cwd());

  // Assert
  assert.equal(result.code, 0);
  assert.match(result.stdout, /AgentArena Doctor/);
  assert.match(result.stdout, /ready/);
});

// 4. Init Taskpack Command

test("agentarena init-taskpack creates file", async () => {
  // Arrange
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentarena-cli-"));
  const outputPath = path.join(tempDir, "task.yaml");
  const args = ["init-taskpack", "--template", "repo-health", "--output", outputPath];

  try {
    // Act
    const result = await runCli(args, process.cwd());

    // Assert
    assert.equal(result.code, 0);
    assert.match(result.stdout, /AgentArena task pack created/);

    const content = await readFile(outputPath, "utf8");
    assert.match(content, /schemaVersion: agentarena.taskpack\/v1/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

// 5. Error Handling

test("agentarena run invalid repo path exits 1", async () => {
  // Arrange
  const args = ["run", "--repo", "/path/to/nonexistent/repo", "--task", "task.yaml", "--agents", "demo-fast"];

  // Act
  const result = await runCli(args, process.cwd());

  // Assert
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Error/);
});

test("agentarena run invalid task file exits 1", async () => {
  // Arrange
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentarena-cli-"));
  const repoPath = path.join(tempDir, "repo");
  await mkdir(repoPath, { recursive: true });
  const args = ["run", "--repo", repoPath, "--task", "/path/to/nonexistent/task.yaml", "--agents", "demo-fast"];

  try {
    // Act
    const result = await runCli(args, process.cwd());

    // Assert
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Error/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
