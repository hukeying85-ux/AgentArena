/**
 * Simple in-memory cache with TTL support.
 * BUG: TTL check uses > instead of >=, and the cleanup timer is never started.
 */
function createCache(options) {
  var store = {};
  var ttlMs = (options && options.ttlMs) || 60000;

  return {
    get: function (key) {
      var entry = store[key];
      if (!entry) return undefined;
      if (Date.now() - entry.createdAt > ttlMs) {
        delete store[key];
        return undefined;
      }
      return entry.value;
    },
    set: function (key, value) {
      store[key] = { value: value, createdAt: Date.now() };
    },
    delete: function (key) {
      delete store[key];
    },
    size: function () {
      return Object.keys(store).length;
    },
    clear: function () {
      store = {};
    },
  };
}

module.exports = { createCache };
