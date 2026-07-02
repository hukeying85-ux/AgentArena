var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var cache = require("../src/cache");

describe("cache", function() {
  it("stores and retrieves values", function() {
    var c = cache.createCache();
    c.set("key1", "value1");
    assert.strictEqual(c.get("key1"), "value1");
  });

  it("returns undefined for missing keys", function() {
    var c = cache.createCache();
    assert.strictEqual(c.get("missing"), undefined);
  });

  it("respects TTL", function() {
    var c = cache.createCache({ ttlMs: 1 });
    c.set("key1", "value1");
    // Wait for TTL to expire
    var start = Date.now();
    while (Date.now() - start < 10) {}
    assert.strictEqual(c.get("key1"), undefined);
  });

  it("reports size correctly", function() {
    var c = cache.createCache();
    c.set("a", 1);
    c.set("b", 2);
    assert.strictEqual(c.size(), 2);
    c.delete("a");
    assert.strictEqual(c.size(), 1);
  });

  it("clears all entries", function() {
    var c = cache.createCache();
    c.set("a", 1);
    c.set("b", 2);
    c.clear();
    assert.strictEqual(c.size(), 0);
  });
});
