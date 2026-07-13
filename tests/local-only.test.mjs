import assert from "node:assert/strict";
import test from "node:test";
import { formatLocalUiOrigin } from "../packages/cli/dist/local-only.js";

test("formatLocalUiOrigin brackets IPv6 localhost addresses", () => {
  assert.equal(formatLocalUiOrigin("::1", 4320), "http://[::1]:4320");
  assert.equal(formatLocalUiOrigin("::ffff:127.0.0.1", 4320), "http://[::ffff:127.0.0.1]:4320");
  assert.equal(formatLocalUiOrigin("127.0.0.1", 4320), "http://127.0.0.1:4320");
  assert.equal(formatLocalUiOrigin("localhost", 4320), "http://localhost:4320");
});
