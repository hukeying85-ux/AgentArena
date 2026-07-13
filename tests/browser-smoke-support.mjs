export async function loadChromiumForSmoke(
  testContext,
  {
    required = process.env.AGENTARENA_RUN_BROWSER_SMOKE === "1",
    loadPlaywright = () => import("playwright")
  } = {}
) {
  if (!required) {
    testContext.skip("Set AGENTARENA_RUN_BROWSER_SMOKE=1 to run browser smoke tests.");
    return null;
  }

  try {
    const { chromium } = await loadPlaywright();
    const probe = await chromium.launch({ headless: true });
    await probe.close();
    return chromium;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Browser smoke was required, but Playwright/Chromium could not start: ${message}`,
      { cause: error }
    );
  }
}
