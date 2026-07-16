import { spawn } from "node:child_process";

const env = {
  ...process.env,
  AGENTARENA_RUN_BROWSER_SMOKE: process.env.AGENTARENA_RUN_BROWSER_SMOKE ?? "1"
};

for (const testFile of ["tests/web-report.e2e.mjs", "tests/workbench.e2e.mjs"]) {
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--test", testFile], { env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${testFile} stopped by signal ${signal}.`));
        return;
      }
      resolve(code ?? 1);
    });
  });
  if (exitCode !== 0) process.exit(exitCode);
}
