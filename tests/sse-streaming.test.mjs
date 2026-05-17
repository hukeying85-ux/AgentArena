import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI_ENTRY = path.join(REPO_ROOT, "packages", "cli", "dist", "index.js");

function getPort(output) {
  const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
  return match ? Number(match[1]) : null;
}

function waitForOutput(proc, pattern, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for pattern: ${pattern}`)), timeoutMs);
    proc.stdout.on("data", (data) => {
      output += data.toString();
      if (output.includes(pattern)) {
        clearTimeout(timer);
        resolve(output);
      }
    });
    proc.stderr.on("data", (data) => {
      output += data.toString();
      if (output.includes(pattern)) {
        clearTimeout(timer);
        resolve(output);
      }
    });
  });
}

function request(port, method, pathname, body, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method,
      headers: { "Content-Type": "application/json" }
    };
    if (token) options.headers.Authorization = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

let serverProc;
let port;
let authToken;
let tempDir;

test.before(async () => {
  // Use a temp directory to avoid polluting the repo's .agentarena state
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentarena-sse-"));
  await fs.cp(path.join(REPO_ROOT, "examples"), path.join(tempDir, "examples"), { recursive: true });

  const BASE_PORT = 5800 + Math.floor(Math.random() * 200);
  authToken = "progress-test-" + Date.now();

  serverProc = spawn(process.execPath, [
    CLI_ENTRY, "ui",
    "--port", String(BASE_PORT),
    "--auth-token", authToken
  ], { cwd: tempDir, stdio: ["pipe", "pipe", "pipe"] });

  const output = await waitForOutput(serverProc, "http://127.0.0.1:");
  port = getPort(output);
  if (!port) throw new Error("Could not extract port from server output");
});

test.after(async () => {
  if (serverProc) serverProc.kill("SIGTERM");
  if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

test("GET /api/run-status returns JSON with known state", { timeout: 20_000 }, async () => {
  const res = await request(port, "GET", "/api/run-status", null, authToken);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body, "Should return a body");
  assert.ok(typeof res.body === "object", "Body should be an object");
  assert.ok(typeof res.body.state === "string", "Should have a state field");
});

test("GET /api/run-status without auth works on localhost", { timeout: 20_000 }, async () => {
  const res = await request(port, "GET", "/api/run-status", null, null);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body);
});

test("POST /api/run/cancel without active run returns appropriate status", { timeout: 20_000 }, async () => {
  const res = await request(port, "POST", "/api/run/cancel", {}, authToken);

  // Should return 200 or 409 (no active run)
  assert.ok([200, 409].includes(res.statusCode), `Unexpected status: ${res.statusCode}`);
});

test("POST /api/run returns 202 and accepts the request", { timeout: 30_000 }, async () => {
  const res = await request(port, "POST", "/api/run", {
    repoPath: tempDir,
    taskPath: path.join(tempDir, "examples", "taskpacks", "demo-repo-health.json"),
    agents: ["demo-fast"],
    scoreMode: "practical"
  }, authToken);

  assert.equal(res.statusCode, 202);
  assert.ok(res.body.accepted === true, "Should accept the run request");

  // Wait briefly then check status
  await new Promise(r => setTimeout(r, 2000));

  const statusRes = await request(port, "GET", "/api/run-status", null, authToken);
  assert.equal(statusRes.statusCode, 200);
  assert.ok(typeof statusRes.body.state === "string", "Should have state");

  // Cancel the run to clean up
  await request(port, "POST", "/api/run/cancel", {}, authToken);
  // Wait for cancellation to complete
  await new Promise(r => setTimeout(r, 1000));
});

test("POST /api/run concurrent requests return 409", { timeout: 30_000 }, async () => {
  const res1 = await request(port, "POST", "/api/run", {
    repoPath: tempDir,
    taskPath: path.join(tempDir, "examples", "taskpacks", "demo-repo-health.json"),
    agents: ["demo-fast"],
    scoreMode: "practical"
  }, authToken);

  if (res1.statusCode === 202) {
    const res2 = await request(port, "POST", "/api/run", {
      repoPath: tempDir,
      taskPath: path.join(tempDir, "examples", "taskpacks", "demo-repo-health.json"),
      agents: ["demo-fast"],
      scoreMode: "practical"
    }, authToken);

    assert.equal(res2.statusCode, 409);
    assert.ok(res2.body.error?.includes("already in progress"));

    // Cancel and wait
    await request(port, "POST", "/api/run/cancel", {}, authToken);
    await new Promise(r => setTimeout(r, 1000));
  } else {
    assert.equal(res1.statusCode, 409);
  }
});
