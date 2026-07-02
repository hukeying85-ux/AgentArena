import { spawn } from "node:child_process";

const env = {
  ...process.env,
  AGENTARENA_RUN_BROWSER_SMOKE: process.env.AGENTARENA_RUN_BROWSER_SMOKE ?? "1"
};

const child = spawn(process.execPath, ["--test", "tests/web-report.e2e.mjs"], {
  env,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
