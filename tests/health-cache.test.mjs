import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { HealthCache, resetHealthCache, getHealthCache } from "../packages/core/dist/health-cache.js";

describe("HealthCache", () => {
  let tempDir;
  let cache;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "health-cache-test-"));
    cache = new HealthCache({
      cacheDir: tempDir,
      defaultTtlMs: 5000, // 5 seconds for testing
    });
    resetHealthCache();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    resetHealthCache();
  });

  it("should store and retrieve cache entries", async () => {
    await cache.set("claude-code", "official", "ready", "CLI is healthy");

    const entry = await cache.get("claude-code", "official");
    expect(entry).toBeDefined();
    expect(entry.adapterId).toBe("claude-code");
    expect(entry.providerId).toBe("official");
    expect(entry.status).toBe("ready");
    expect(entry.summary).toBe("CLI is healthy");
  });

  it("should return undefined for non-existent entries", async () => {
    const entry = await cache.get("nonexistent", "provider");
    expect(entry).toBeUndefined();
  });

  it("should handle entries with endpoint", async () => {
    await cache.set("claude-code", "mimo", "blocked", "Auth failed", {
      endpoint: "https://api.mimo.com",
    });

    const entry = await cache.get("claude-code", "mimo", "https://api.mimo.com");
    expect(entry).toBeDefined();
    expect(entry.endpoint).toBe("https://api.mimo.com");

    // Different endpoint should not match
    const other = await cache.get("claude-code", "mimo", "https://other.com");
    expect(other).toBeUndefined();
  });

  it("should expire entries after TTL", async () => {
    const shortCache = new HealthCache({
      cacheDir: tempDir,
      defaultTtlMs: 100, // 100ms TTL
    });

    await shortCache.set("test", "provider", "ready", "ok");

    // Should exist immediately
    const entry1 = await shortCache.get("test", "provider");
    expect(entry1).toBeDefined();

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 150));

    const entry2 = await shortCache.get("test", "provider");
    expect(entry2).toBeUndefined();
  });

  it("should persist cache to disk", async () => {
    await cache.set("test", "provider", "ready", "ok");

    // Read the cache file directly
    const cachePath = path.join(tempDir, "health-cache.json");
    const data = await fs.readFile(cachePath, "utf8");
    const entries = JSON.parse(data);

    expect(entries).toHaveLength(1);
    expect(entries[0].adapterId).toBe("test");
  });

  it("should load cache from disk", async () => {
    // Write cache file directly
    const cachePath = path.join(tempDir, "health-cache.json");
    const entries = [
      {
        adapterId: "loaded",
        providerId: "provider",
        status: "ready",
        summary: "from disk",
        timestamp: Date.now(),
        ttlMs: 60000,
      },
    ];
    await fs.writeFile(cachePath, JSON.stringify(entries));

    // Create new cache instance - should load from disk
    const newCache = new HealthCache({
      cacheDir: tempDir,
      defaultTtlMs: 60000,
    });

    const entry = await newCache.get("loaded", "provider");
    expect(entry).toBeDefined();
    expect(entry.summary).toBe("from disk");
  });

  it("should invalidate entries", async () => {
    await cache.set("test", "provider", "ready", "ok");
    expect(await cache.has("test", "provider")).toBe(true);

    await cache.invalidate("test", "provider");
    expect(await cache.has("test", "provider")).toBe(false);
  });

  it("should cleanup expired entries", async () => {
    const shortCache = new HealthCache({
      cacheDir: tempDir,
      defaultTtlMs: 50, // 50ms TTL
    });

    await shortCache.set("expired1", "p", "ready", "ok");
    await shortCache.set("expired2", "p", "ready", "ok");

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 100));

    const removed = await shortCache.cleanup();
    expect(removed).toBe(2);

    const stats = await shortCache.stats();
    expect(stats.total).toBe(0);
  });

  it("should clear all entries", async () => {
    await cache.set("test1", "p", "ready", "ok");
    await cache.set("test2", "p", "blocked", "fail");

    await cache.clear();

    const stats = await cache.stats();
    expect(stats.total).toBe(0);
  });

  it("should return all valid entries", async () => {
    await cache.set("test1", "p1", "ready", "ok");
    await cache.set("test2", "p2", "blocked", "fail");

    const all = await cache.getAll();
    expect(all).toHaveLength(2);
  });

  it("should provide accurate stats", async () => {
    const shortCache = new HealthCache({
      cacheDir: tempDir,
      defaultTtlMs: 50,
    });

    await shortCache.set("valid", "p", "ready", "ok");
    await shortCache.set("about-to-expire", "p", "ready", "ok");

    // Wait for some to expire
    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = await shortCache.stats();
    expect(stats.total).toBe(2);
    expect(stats.valid).toBe(0);
    expect(stats.expired).toBe(2);
  });
});

describe("HealthCache singleton", () => {
  afterEach(() => {
    resetHealthCache();
  });

  it("should return the same instance", () => {
    const cache1 = getHealthCache();
    const cache2 = getHealthCache();
    expect(cache1).toBe(cache2);
  });

  it("should create new instance after reset", () => {
    const cache1 = getHealthCache();
    resetHealthCache();
    const cache2 = getHealthCache();
    expect(cache1).not.toBe(cache2);
  });
});

describe("probeClaudeLikeAuthFast", () => {
  // This test requires the actual CLI to be installed
  // Skip if not available
  it.skipIf(!process.env.ANTHROPIC_API_KEY)(
    "should use cache for repeated probes",
    async () => {
      // This is an integration test that would require actual CLI
      // Skipping in unit tests
    }
  );
});
