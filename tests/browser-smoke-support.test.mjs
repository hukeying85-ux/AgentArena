import assert from "node:assert/strict";
import test from "node:test";
import { loadChromiumForSmoke } from "./browser-smoke-support.mjs";

test("browser smoke helper skips only when the browser run was not requested", async () => {
  const skips = [];
  let loadCalls = 0;
  const chromium = await loadChromiumForSmoke(
    { skip: (message) => skips.push(message) },
    {
      required: false,
      loadPlaywright: async () => {
        loadCalls += 1;
        throw new Error("must not load");
      }
    }
  );

  assert.equal(chromium, null);
  assert.equal(loadCalls, 0);
  assert.equal(skips.length, 1);
});

test("browser smoke helper fails when a required browser cannot launch", async () => {
  await assert.rejects(
    () => loadChromiumForSmoke(
      { skip: () => assert.fail("required browser smoke must not skip") },
      {
        required: true,
        loadPlaywright: async () => {
          throw new Error("simulated chromium launch failure");
        }
      }
    ),
    /Browser smoke was required.*simulated chromium launch failure/i
  );
});

test("browser smoke helper returns chromium after a successful probe", async () => {
  let closed = false;
  const chromium = { launch: async () => ({ close: async () => { closed = true; } }) };
  const result = await loadChromiumForSmoke(
    { skip: () => assert.fail("available browser must not skip") },
    { required: true, loadPlaywright: async () => ({ chromium }) }
  );

  assert.equal(result, chromium);
  assert.equal(closed, true);
});
