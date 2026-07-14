import assert from "node:assert/strict";
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  deleteClaudeProviderProfile,
  saveClaudeProviderProfile,
  setClaudeProviderProfileSecret
} from "../packages/adapters/dist/claude-provider-profiles.js";
import { getAdapter } from "../packages/adapters/dist/index.js";
import { handleQuickPreflight } from "../packages/cli/dist/commands/api-routes.js";

async function exists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function createClaudeShim(tempDir) {
  const scriptPath = path.join(tempDir, "claude-shim.mjs");
  const commandPath = process.platform === "win32"
    ? path.join(tempDir, "claude.cmd")
    : path.join(tempDir, "claude");

  await writeFile(
    scriptPath,
    [
      'import { appendFileSync, writeFileSync } from "node:fs";',
      'import { spawn } from "node:child_process";',
      "const args = process.argv.slice(2);",
      "const capture = {",
      "  args,",
      "  cwd: process.cwd(),",
      "  configDir: process.env.CLAUDE_CONFIG_DIR,",
      "  usesPersonalOauth: process.env.CLAUDE_CODE_OAUTH_TOKEN === 'personal-oauth',",
      "  authSource: process.env.ANTHROPIC_AUTH_TOKEN === 'isolated-secret' ? 'isolated' : (process.env.ANTHROPIC_AUTH_TOKEN ? 'other' : 'none'),",
      "  baseUrl: process.env.ANTHROPIC_BASE_URL",
      "};",
      'if (process.env.AGENTARENA_CLAUDE_CAPTURE) { appendFileSync(process.env.AGENTARENA_CLAUDE_CAPTURE, JSON.stringify(capture) + "\\n", "utf8"); }',
      'if (args.includes("--version")) { console.log("2.1.207"); process.exit(0); }',
      'if (args.includes("--help")) {',
      '  console.log("--setting-sources <sources>\\n--strict-mcp-config\\n--no-session-persistence");',
      "  process.exit(0);",
      "}",
      'if (process.env.AGENTARENA_CLAUDE_HOLD_CONFIG_OPEN && args.includes("stream-json")) {',
      '  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { cwd: process.env.CLAUDE_CONFIG_DIR, detached: true, stdio: "ignore" });',
      "  child.unref();",
      '  writeFileSync(process.env.AGENTARENA_CLAUDE_HOLD_CONFIG_OPEN, String(child.pid), "utf8");',
      "}",
      'if (args.includes("stream-json")) {',
      '  console.log(JSON.stringify({ type: "result", subtype: "success", result: "READY", usage: { input_tokens: 1, output_tokens: 1 }, total_cost_usd: 0 }));',
      "} else {",
      '  console.log("READY");',
      "}"
    ].join("\n"),
    "utf8"
  );

  if (process.platform === "win32") {
    await writeFile(commandPath, `@echo off\n"${process.execPath}" "${scriptPath}" %*\n`, "utf8");
  } else {
    await writeFile(commandPath, `#!/usr/bin/env sh\nexec "${process.execPath}" "${scriptPath}" "$@"\n`, "utf8");
    await chmod(commandPath, 0o755);
  }

  return commandPath;
}

async function withTempProvider(fn) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentarena-claude-adapter-isolation-"));
  const originalRoot = process.env.AGENTARENA_CLAUDE_PROFILE_ROOT;
  const originalFile = process.env.AGENTARENA_CLAUDE_PROFILES_FILE;
  const originalPrefix = process.env.AGENTARENA_CLAUDE_SECRET_PREFIX;
  const originalDnsCheck = process.env.AGENTARENA_SKIP_DNS_CHECK;
  let profileId;

  process.env.AGENTARENA_CLAUDE_PROFILE_ROOT = tempDir;
  process.env.AGENTARENA_CLAUDE_PROFILES_FILE = path.join(tempDir, "profiles.json");
  process.env.AGENTARENA_CLAUDE_SECRET_PREFIX = `AgentArena/test/isolation/${Date.now()}/`;
  process.env.AGENTARENA_SKIP_DNS_CHECK = "1";

  try {
    const profile = await saveClaudeProviderProfile({
      name: "Adapter Isolation",
      kind: "openai-proxy",
      apiFormat: "openai-chat-via-proxy",
      baseUrl: "https://api.openai.com/v1",
      primaryModel: "isolated-model"
    });
    profileId = profile.id;
    await setClaudeProviderProfileSecret(profile.id, "isolated-secret");
    await fn(tempDir, profile);
  } finally {
    if (profileId) {
      await setClaudeProviderProfileSecret(profileId, "").catch(() => {});
      await deleteClaudeProviderProfile(profileId).catch(() => {});
    }
    if (originalRoot === undefined) delete process.env.AGENTARENA_CLAUDE_PROFILE_ROOT;
    else process.env.AGENTARENA_CLAUDE_PROFILE_ROOT = originalRoot;
    if (originalFile === undefined) delete process.env.AGENTARENA_CLAUDE_PROFILES_FILE;
    else process.env.AGENTARENA_CLAUDE_PROFILES_FILE = originalFile;
    if (originalPrefix === undefined) delete process.env.AGENTARENA_CLAUDE_SECRET_PREFIX;
    else process.env.AGENTARENA_CLAUDE_SECRET_PREFIX = originalPrefix;
    if (originalDnsCheck === undefined) delete process.env.AGENTARENA_SKIP_DNS_CHECK;
    else process.env.AGENTARENA_SKIP_DNS_CHECK = originalDnsCheck;
    await rm(tempDir, { recursive: true, force: true });
  }
}

function parseCapture(contents) {
  return contents.trim().split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

async function stopHeldProcess(pidPath) {
  if (!(await exists(pidPath))) return;
  const pid = Number.parseInt(await readFile(pidPath, "utf8"), 10);
  if (!Number.isInteger(pid)) return;
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    return;
  }
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test("third-party Claude preflight and execution use isolated config without touching the source project", async () => {
  await withTempProvider(async (tempDir, profile) => {
    const sourcePath = path.join(tempDir, "source");
    const workspacePath = path.join(tempDir, "workspace");
    const personalConfig = path.join(tempDir, "personal-config");
    const capturePath = path.join(tempDir, "capture.jsonl");
    const settingsPath = path.join(sourcePath, ".claude", "settings.local.json");
    const originalCwd = process.cwd();
    const originalClaudeBin = process.env.AGENTARENA_CLAUDE_BIN;
    const originalCapture = process.env.AGENTARENA_CLAUDE_CAPTURE;
    const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;
    const originalOauth = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    const originalAuthToken = process.env.ANTHROPIC_AUTH_TOKEN;
    const originalSkipPermissions = process.env.AGENTARENA_SKIP_PERMISSIONS;

    await mkdir(path.dirname(settingsPath), { recursive: true });
    await mkdir(workspacePath, { recursive: true });
    await mkdir(personalConfig, { recursive: true });
    await writeFile(settingsPath, '{"marker":"keep-me"}\n', "utf8");
    const shimPath = await createClaudeShim(tempDir);

    try {
      process.env.AGENTARENA_CLAUDE_BIN = shimPath;
      process.env.AGENTARENA_CLAUDE_CAPTURE = capturePath;
      process.env.CLAUDE_CONFIG_DIR = personalConfig;
      process.env.CLAUDE_CODE_OAUTH_TOKEN = "personal-oauth";
      process.env.ANTHROPIC_AUTH_TOKEN = "personal-token";
      process.env.AGENTARENA_SKIP_PERMISSIONS = "1";
      process.chdir(sourcePath);

      const adapter = getAdapter("claude-code");
      const selection = {
        baseAgentId: "claude-code",
        variantId: "claude-isolated",
        displayLabel: "Claude Isolated",
        config: { providerProfileId: profile.id },
        configSource: "test"
      };
      const preflight = await adapter.preflight({ probeAuth: true, selection });
      assert.equal(preflight.status, "ready", preflight.summary);
      assert.equal(await readFile(settingsPath, "utf8"), '{"marker":"keep-me"}\n');

      const executionEnvironment = { ...process.env };
      delete executionEnvironment.CLAUDE_CONFIG_DIR;
      delete executionEnvironment.CLAUDE_CODE_OAUTH_TOKEN;
      delete executionEnvironment.ANTHROPIC_AUTH_TOKEN;
      const result = await adapter.execute({
        agentId: "claude-code",
        selection,
        repoPath: sourcePath,
        workspacePath,
        environment: executionEnvironment,
        task: {
          schemaVersion: "agentarena.taskpack/v1",
          id: "claude-isolation",
          title: "Claude Isolation",
          prompt: "No-op.",
          envAllowList: [],
          setupCommands: [],
          judges: [],
          teardownCommands: []
        },
        trace: async () => {}
      });
      assert.equal(result.status, "success", result.summary);
      assert.equal(await exists(path.join(workspacePath, ".claude", "settings.local.json")), false);

      const captures = parseCapture(await readFile(capturePath, "utf8"));
      assert.equal(captures.length >= 2, true);
      for (const capture of captures) {
        assert.notEqual(capture.cwd, sourcePath);
        assert.notEqual(capture.configDir, personalConfig);
        assert.equal(capture.usesPersonalOauth, false, JSON.stringify(capture));
        assert.equal(capture.authSource, "isolated");
        assert.equal(capture.baseUrl, "https://api.openai.com/v1");
        assert.equal(capture.args.includes("--setting-sources"), true);
        assert.equal(capture.args.includes("--strict-mcp-config"), true);
        assert.equal(await exists(capture.configDir), false);
      }
    } finally {
      process.chdir(originalCwd);
      if (originalClaudeBin === undefined) delete process.env.AGENTARENA_CLAUDE_BIN;
      else process.env.AGENTARENA_CLAUDE_BIN = originalClaudeBin;
      if (originalCapture === undefined) delete process.env.AGENTARENA_CLAUDE_CAPTURE;
      else process.env.AGENTARENA_CLAUDE_CAPTURE = originalCapture;
      if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
      if (originalOauth === undefined) delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
      else process.env.CLAUDE_CODE_OAUTH_TOKEN = originalOauth;
      if (originalAuthToken === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN;
      else process.env.ANTHROPIC_AUTH_TOKEN = originalAuthToken;
      if (originalSkipPermissions === undefined) delete process.env.AGENTARENA_SKIP_PERMISSIONS;
      else process.env.AGENTARENA_SKIP_PERMISSIONS = originalSkipPermissions;
    }
  });
});

test("official Claude execution uses the active local configuration without generating workspace settings", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentarena-claude-official-local-"));
  const workspacePath = path.join(tempDir, "workspace");
  const personalConfig = path.join(tempDir, "personal-config");
  const capturePath = path.join(tempDir, "capture.jsonl");
  const originalClaudeBin = process.env.AGENTARENA_CLAUDE_BIN;
  const originalCapture = process.env.AGENTARENA_CLAUDE_CAPTURE;
  const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;
  const originalOauth = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  const originalSkipPermissions = process.env.AGENTARENA_SKIP_PERMISSIONS;

  try {
    await mkdir(workspacePath, { recursive: true });
    await mkdir(personalConfig, { recursive: true });
    const shimPath = await createClaudeShim(tempDir);
    process.env.AGENTARENA_CLAUDE_BIN = shimPath;
    process.env.AGENTARENA_CLAUDE_CAPTURE = capturePath;
    process.env.CLAUDE_CONFIG_DIR = personalConfig;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "personal-oauth";
    process.env.AGENTARENA_SKIP_PERMISSIONS = "1";
    const executionEnvironment = { ...process.env };
    delete executionEnvironment.CLAUDE_CONFIG_DIR;
    delete executionEnvironment.CLAUDE_CODE_OAUTH_TOKEN;

    const adapter = getAdapter("claude-code");
    const result = await adapter.execute({
      agentId: "claude-code",
      selection: {
        baseAgentId: "claude-code",
        variantId: "claude-official",
        displayLabel: "Claude Official",
        config: { providerProfileId: "claude-official" },
        configSource: "test"
      },
      repoPath: tempDir,
      workspacePath,
      environment: executionEnvironment,
      task: {
        schemaVersion: "agentarena.taskpack/v1",
        id: "claude-official",
        title: "Claude Official",
        prompt: "No-op.",
        envAllowList: [],
        setupCommands: [],
        judges: [],
        teardownCommands: []
      },
      trace: async () => {}
    });

    assert.equal(result.status, "success", result.summary);
    assert.equal(await exists(path.join(workspacePath, ".claude", "settings.local.json")), false);
    const [capture] = parseCapture(await readFile(capturePath, "utf8"));
    assert.equal(capture.configDir, personalConfig);
    assert.equal(capture.usesPersonalOauth, true);
    assert.equal(capture.args.includes("--setting-sources"), false);
    assert.equal(capture.args.includes("--strict-mcp-config"), false);
    assert.equal(await exists(personalConfig), true);
  } finally {
    if (originalClaudeBin === undefined) delete process.env.AGENTARENA_CLAUDE_BIN;
    else process.env.AGENTARENA_CLAUDE_BIN = originalClaudeBin;
    if (originalCapture === undefined) delete process.env.AGENTARENA_CLAUDE_CAPTURE;
    else process.env.AGENTARENA_CLAUDE_CAPTURE = originalCapture;
    if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
    if (originalOauth === undefined) delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    else process.env.CLAUDE_CODE_OAUTH_TOKEN = originalOauth;
    if (originalSkipPermissions === undefined) delete process.env.AGENTARENA_SKIP_PERMISSIONS;
    else process.env.AGENTARENA_SKIP_PERMISSIONS = originalSkipPermissions;
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("third-party Claude quick preflight reports the stored Provider secret instead of host login state", async () => {
  await withTempProvider(async (tempDir, profile) => {
    const originalClaudeBin = process.env.AGENTARENA_CLAUDE_BIN;
    const originalSkipPermissions = process.env.AGENTARENA_SKIP_PERMISSIONS;
    const shimPath = await createClaudeShim(tempDir);

    try {
      process.env.AGENTARENA_CLAUDE_BIN = shimPath;
      process.env.AGENTARENA_SKIP_PERMISSIONS = "1";
      const response = await handleQuickPreflight(JSON.stringify({
        baseAgentId: "claude-code",
        displayLabel: "Claude Isolated",
        config: { providerProfileId: profile.id }
      }));
      const body = JSON.parse(response.body);

      assert.equal(response.statusCode, 200);
      assert.equal(body.authConfigured, true);
      assert.match(body.authHint, /isolated Provider secret is stored/i);
      assert.equal(body.overallStatus, "ready");
    } finally {
      if (originalClaudeBin === undefined) delete process.env.AGENTARENA_CLAUDE_BIN;
      else process.env.AGENTARENA_CLAUDE_BIN = originalClaudeBin;
      if (originalSkipPermissions === undefined) delete process.env.AGENTARENA_SKIP_PERMISSIONS;
      else process.env.AGENTARENA_SKIP_PERMISSIONS = originalSkipPermissions;
    }
  });
});

test("Claude preflight and direct execution block when unattended permissions were not explicitly enabled", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentarena-claude-permission-gate-"));
  const workspacePath = path.join(tempDir, "workspace");
  const capturePath = path.join(tempDir, "capture.jsonl");
  const originalClaudeBin = process.env.AGENTARENA_CLAUDE_BIN;
  const originalCapture = process.env.AGENTARENA_CLAUDE_CAPTURE;
  const originalSkipPermissions = process.env.AGENTARENA_SKIP_PERMISSIONS;

  try {
    await mkdir(workspacePath, { recursive: true });
    process.env.AGENTARENA_CLAUDE_BIN = await createClaudeShim(tempDir);
    process.env.AGENTARENA_CLAUDE_CAPTURE = capturePath;
    delete process.env.AGENTARENA_SKIP_PERMISSIONS;

    const adapter = getAdapter("claude-code");
    const selection = {
      baseAgentId: "claude-code",
      variantId: "claude-official",
      displayLabel: "Claude Official",
      config: { providerProfileId: "claude-official" },
      configSource: "test"
    };
    const preflight = await adapter.preflight({ probeAuth: false, selection });
    assert.equal(preflight.status, "blocked");
    assert.match(preflight.summary, /unattended permissions/i);
    const preflightCaptureCount = parseCapture(await readFile(capturePath, "utf8")).length;

    const result = await adapter.execute({
      agentId: "claude-code",
      selection,
      repoPath: tempDir,
      workspacePath,
      environment: { ...process.env },
      task: {
        schemaVersion: "agentarena.taskpack/v1",
        id: "claude-permission-gate",
        title: "Claude Permission Gate",
        prompt: "No-op.",
        envAllowList: [],
        setupCommands: [],
        judges: [],
        teardownCommands: []
      },
      trace: async () => {}
    });
    assert.equal(result.status, "failed");
    assert.match(result.summary, /AGENTARENA_SKIP_PERMISSIONS=1/i);
    assert.equal(parseCapture(await readFile(capturePath, "utf8")).length, preflightCaptureCount);
  } finally {
    if (originalClaudeBin === undefined) delete process.env.AGENTARENA_CLAUDE_BIN;
    else process.env.AGENTARENA_CLAUDE_BIN = originalClaudeBin;
    if (originalCapture === undefined) delete process.env.AGENTARENA_CLAUDE_CAPTURE;
    else process.env.AGENTARENA_CLAUDE_CAPTURE = originalCapture;
    if (originalSkipPermissions === undefined) delete process.env.AGENTARENA_SKIP_PERMISSIONS;
    else process.env.AGENTARENA_SKIP_PERMISSIONS = originalSkipPermissions;
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("third-party Claude quick preflight exposes the unattended permission gate", async () => {
  await withTempProvider(async (tempDir, profile) => {
    const originalClaudeBin = process.env.AGENTARENA_CLAUDE_BIN;
    const originalSkipPermissions = process.env.AGENTARENA_SKIP_PERMISSIONS;

    try {
      process.env.AGENTARENA_CLAUDE_BIN = await createClaudeShim(tempDir);
      delete process.env.AGENTARENA_SKIP_PERMISSIONS;
      const response = await handleQuickPreflight(JSON.stringify({
        baseAgentId: "claude-code",
        displayLabel: "Claude Isolated",
        config: { providerProfileId: profile.id }
      }));
      const body = JSON.parse(response.body);

      assert.equal(response.statusCode, 200);
      assert.equal(body.overallStatus, "blocked");
      assert.match(body.summary, /unattended permissions/i);
    } finally {
      if (originalClaudeBin === undefined) delete process.env.AGENTARENA_CLAUDE_BIN;
      else process.env.AGENTARENA_CLAUDE_BIN = originalClaudeBin;
      if (originalSkipPermissions === undefined) delete process.env.AGENTARENA_SKIP_PERMISSIONS;
      else process.env.AGENTARENA_SKIP_PERMISSIONS = originalSkipPermissions;
    }
  });
});

test(
  "third-party Claude preflight reports isolated runtime cleanup failures",
  { skip: process.platform !== "win32" ? "Windows-specific locked-directory behavior" : false },
  async () => {
    await withTempProvider(async (tempDir, profile) => {
      const capturePath = path.join(tempDir, "cleanup-preflight-capture.jsonl");
      const pidPath = path.join(tempDir, "cleanup-preflight.pid");
      const originalClaudeBin = process.env.AGENTARENA_CLAUDE_BIN;
      const originalCapture = process.env.AGENTARENA_CLAUDE_CAPTURE;
      const originalHold = process.env.AGENTARENA_CLAUDE_HOLD_CONFIG_OPEN;
      const originalSkipPermissions = process.env.AGENTARENA_SKIP_PERMISSIONS;

      try {
        process.env.AGENTARENA_CLAUDE_BIN = await createClaudeShim(tempDir);
        process.env.AGENTARENA_CLAUDE_CAPTURE = capturePath;
        process.env.AGENTARENA_CLAUDE_HOLD_CONFIG_OPEN = pidPath;
        process.env.AGENTARENA_SKIP_PERMISSIONS = "1";
        const adapter = getAdapter("claude-code");
        const preflight = await adapter.preflight({
          probeAuth: true,
          selection: {
            baseAgentId: "claude-code",
            variantId: "claude-cleanup-preflight",
            displayLabel: "Claude Cleanup Preflight",
            config: { providerProfileId: profile.id },
            configSource: "test"
          }
        });

        assert.equal(preflight.status, "blocked");
        assert.match(preflight.summary, /clean.*runtime/i);
      } finally {
        await stopHeldProcess(pidPath);
        if (await exists(capturePath)) {
          for (const capture of parseCapture(await readFile(capturePath, "utf8"))) {
            if (capture.configDir) await rm(capture.configDir, { recursive: true, force: true }).catch(() => {});
          }
        }
        if (originalClaudeBin === undefined) delete process.env.AGENTARENA_CLAUDE_BIN;
        else process.env.AGENTARENA_CLAUDE_BIN = originalClaudeBin;
        if (originalCapture === undefined) delete process.env.AGENTARENA_CLAUDE_CAPTURE;
        else process.env.AGENTARENA_CLAUDE_CAPTURE = originalCapture;
        if (originalHold === undefined) delete process.env.AGENTARENA_CLAUDE_HOLD_CONFIG_OPEN;
        else process.env.AGENTARENA_CLAUDE_HOLD_CONFIG_OPEN = originalHold;
        if (originalSkipPermissions === undefined) delete process.env.AGENTARENA_SKIP_PERMISSIONS;
        else process.env.AGENTARENA_SKIP_PERMISSIONS = originalSkipPermissions;
      }
    });
  }
);

test(
  "third-party Claude execution fails when isolated runtime cleanup fails",
  { skip: process.platform !== "win32" ? "Windows-specific locked-directory behavior" : false },
  async () => {
    await withTempProvider(async (tempDir, profile) => {
      const workspacePath = path.join(tempDir, "cleanup-workspace");
      const capturePath = path.join(tempDir, "cleanup-execute-capture.jsonl");
      const pidPath = path.join(tempDir, "cleanup-execute.pid");
      const originalClaudeBin = process.env.AGENTARENA_CLAUDE_BIN;
      const originalCapture = process.env.AGENTARENA_CLAUDE_CAPTURE;
      const originalHold = process.env.AGENTARENA_CLAUDE_HOLD_CONFIG_OPEN;
      const originalSkipPermissions = process.env.AGENTARENA_SKIP_PERMISSIONS;

      try {
        await mkdir(workspacePath, { recursive: true });
        process.env.AGENTARENA_CLAUDE_BIN = await createClaudeShim(tempDir);
        process.env.AGENTARENA_CLAUDE_CAPTURE = capturePath;
        process.env.AGENTARENA_CLAUDE_HOLD_CONFIG_OPEN = pidPath;
        process.env.AGENTARENA_SKIP_PERMISSIONS = "1";
        const adapter = getAdapter("claude-code");
        const result = await adapter.execute({
          agentId: "claude-code",
          selection: {
            baseAgentId: "claude-code",
            variantId: "claude-cleanup-execute",
            displayLabel: "Claude Cleanup Execute",
            config: { providerProfileId: profile.id },
            configSource: "test"
          },
          repoPath: tempDir,
          workspacePath,
          environment: { ...process.env },
          task: {
            schemaVersion: "agentarena.taskpack/v1",
            id: "claude-cleanup-execute",
            title: "Claude Cleanup Execute",
            prompt: "No-op.",
            envAllowList: [],
            setupCommands: [],
            judges: [],
            teardownCommands: []
          },
          trace: async () => {}
        });

        assert.equal(result.status, "failed");
        assert.match(result.summary, /clean.*runtime/i);
      } finally {
        await stopHeldProcess(pidPath);
        if (await exists(capturePath)) {
          for (const capture of parseCapture(await readFile(capturePath, "utf8"))) {
            if (capture.configDir) await rm(capture.configDir, { recursive: true, force: true }).catch(() => {});
          }
        }
        if (originalClaudeBin === undefined) delete process.env.AGENTARENA_CLAUDE_BIN;
        else process.env.AGENTARENA_CLAUDE_BIN = originalClaudeBin;
        if (originalCapture === undefined) delete process.env.AGENTARENA_CLAUDE_CAPTURE;
        else process.env.AGENTARENA_CLAUDE_CAPTURE = originalCapture;
        if (originalHold === undefined) delete process.env.AGENTARENA_CLAUDE_HOLD_CONFIG_OPEN;
        else process.env.AGENTARENA_CLAUDE_HOLD_CONFIG_OPEN = originalHold;
        if (originalSkipPermissions === undefined) delete process.env.AGENTARENA_SKIP_PERMISSIONS;
        else process.env.AGENTARENA_SKIP_PERMISSIONS = originalSkipPermissions;
      }
    });
  }
);
