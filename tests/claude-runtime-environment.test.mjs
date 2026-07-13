import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  deleteClaudeProviderProfile,
  saveClaudeProviderProfile,
  setClaudeProviderProfileSecret
} from "../packages/adapters/dist/claude-provider-profiles.js";

async function exists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function withTempProvider(fn) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentarena-claude-runtime-test-"));
  const originalRoot = process.env.AGENTARENA_CLAUDE_PROFILE_ROOT;
  const originalFile = process.env.AGENTARENA_CLAUDE_PROFILES_FILE;
  const originalDnsCheck = process.env.AGENTARENA_SKIP_DNS_CHECK;
  let profileId;

  process.env.AGENTARENA_CLAUDE_PROFILE_ROOT = tempDir;
  process.env.AGENTARENA_CLAUDE_PROFILES_FILE = path.join(tempDir, "claude-provider-profiles.json");
  process.env.AGENTARENA_SKIP_DNS_CHECK = "1";

  try {
    const profile = await saveClaudeProviderProfile({
      name: "Isolated Provider",
      kind: "openai-proxy",
      apiFormat: "openai-chat-via-proxy",
      baseUrl: "https://api.openai.com/v1",
      primaryModel: "isolated-model",
      extraEnv: {
        OPENAI_COMPAT_MODE: "1"
      }
    });
    profileId = profile.id;
    await setClaudeProviderProfileSecret(profile.id, "isolated-secret");
    await fn(profile);
  } finally {
    if (profileId) {
      await setClaudeProviderProfileSecret(profileId, "").catch(() => {});
      await deleteClaudeProviderProfile(profileId).catch(() => {});
    }
    if (originalRoot === undefined) delete process.env.AGENTARENA_CLAUDE_PROFILE_ROOT;
    else process.env.AGENTARENA_CLAUDE_PROFILE_ROOT = originalRoot;
    if (originalFile === undefined) delete process.env.AGENTARENA_CLAUDE_PROFILES_FILE;
    else process.env.AGENTARENA_CLAUDE_PROFILES_FILE = originalFile;
    if (originalDnsCheck === undefined) delete process.env.AGENTARENA_SKIP_DNS_CHECK;
    else process.env.AGENTARENA_SKIP_DNS_CHECK = originalDnsCheck;
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("official Claude runtime uses the active host configuration without creating a replacement", async () => {
  const { prepareClaudeRuntimeEnvironment } = await import(
    "../packages/adapters/dist/claude-runtime-environment.js"
  );
  const prepared = await prepareClaudeRuntimeEnvironment({
    profileId: "claude-official",
    baseEnvironment: { PATH: "test-path", HOME: "test-home" },
    hostEnvironment: {
      CLAUDE_CONFIG_DIR: "C:/current-claude-config",
      CLAUDE_CODE_OAUTH_TOKEN: "official-token",
      ANTHROPIC_BASE_URL: "https://current.example.com"
    }
  });

  try {
    assert.equal(prepared.mode, "official-local");
    assert.equal(prepared.configDir, undefined);
    assert.deepEqual(prepared.extraArgs, []);
    assert.equal(prepared.environment.CLAUDE_CONFIG_DIR, "C:/current-claude-config");
    assert.equal(prepared.environment.CLAUDE_CODE_OAUTH_TOKEN, "official-token");
    assert.equal(prepared.environment.ANTHROPIC_BASE_URL, "https://current.example.com");
  } finally {
    await prepared.cleanup();
  }
});

test("third-party Claude runtime replaces inherited provider settings with an isolated config", async () => {
  await withTempProvider(async (profile) => {
    const { prepareClaudeRuntimeEnvironment } = await import(
      "../packages/adapters/dist/claude-runtime-environment.js"
    );
    const prepared = await prepareClaudeRuntimeEnvironment({
      profileId: profile.id,
      requestedModel: "requested-model",
      baseEnvironment: {
        PATH: "test-path",
        HOME: "test-home",
        AWS_ACCESS_KEY_ID: "task-tool-credential",
        CLAUDE_CONFIG_DIR: "C:/personal-claude",
        CLAUDE_CODE_OAUTH_TOKEN: "personal-oauth",
        CLAUDE_CODE_USE_BEDROCK: "1",
        ANTHROPIC_AUTH_TOKEN: "personal-token",
        ANTHROPIC_BASE_URL: "https://personal.example.com"
      },
      hostEnvironment: {
        CLAUDE_CONFIG_DIR: "C:/host-claude"
      }
    });

    try {
      assert.equal(prepared.mode, "third-party-isolated");
      assert.ok(prepared.configDir);
      assert.notEqual(prepared.configDir, "C:/personal-claude");
      assert.equal(await exists(prepared.configDir), true);
      assert.deepEqual(prepared.extraArgs, ["--setting-sources", "user", "--strict-mcp-config"]);
      assert.equal(prepared.environment.PATH, "test-path");
      assert.equal(prepared.environment.HOME, "test-home");
      assert.equal(prepared.environment.AWS_ACCESS_KEY_ID, "task-tool-credential");
      assert.equal(prepared.environment.CLAUDE_CONFIG_DIR, prepared.configDir);
      assert.equal(prepared.environment.CLAUDE_CODE_OAUTH_TOKEN, undefined);
      assert.equal(prepared.environment.CLAUDE_CODE_USE_BEDROCK, undefined);
      assert.equal(prepared.environment.ANTHROPIC_AUTH_TOKEN, "isolated-secret");
      assert.equal(prepared.environment.ANTHROPIC_BASE_URL, "https://api.openai.com/v1");
      assert.equal(prepared.environment.OPENAI_COMPAT_MODE, "1");
      assert.equal(prepared.effectiveModel, "requested-model");
    } finally {
      const runtimeRoot = prepared.runtimeRoot;
      await prepared.cleanup();
      assert.equal(await exists(runtimeRoot), false);
      await prepared.cleanup();
    }
  });
});

test("concurrent third-party Claude runtimes never share a config directory", async () => {
  await withTempProvider(async (profile) => {
    const { prepareClaudeRuntimeEnvironment } = await import(
      "../packages/adapters/dist/claude-runtime-environment.js"
    );
    const [first, second] = await Promise.all([
      prepareClaudeRuntimeEnvironment({ profileId: profile.id, baseEnvironment: {} }),
      prepareClaudeRuntimeEnvironment({ profileId: profile.id, baseEnvironment: {} })
    ]);

    try {
      assert.notEqual(first.configDir, second.configDir);
      assert.notEqual(first.runtimeRoot, second.runtimeRoot);
    } finally {
      await Promise.all([first.cleanup(), second.cleanup()]);
    }
  });
});

test("Claude isolation capability detection fails closed when required flags are missing", async () => {
  const { claudeIsolationArgsSupported } = await import(
    "../packages/adapters/dist/claude-runtime-environment.js"
  );

  assert.equal(
    claudeIsolationArgsSupported("--setting-sources <sources>\n--strict-mcp-config\n--no-session-persistence"),
    true
  );
  assert.equal(claudeIsolationArgsSupported("--setting-sources <sources>\n--no-session-persistence"), false);
});
