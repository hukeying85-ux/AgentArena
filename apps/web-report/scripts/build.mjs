import { execFile } from "node:child_process";
import { cp, mkdir, open, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const srcRoot = path.join(appRoot, "src");
const distRoot = path.join(appRoot, "dist");
const lockPath = path.join(appRoot, ".build.lock");
const BUILD_LOCK_TIMEOUT_MS = 30_000;
const BUILD_LOCK_RETRY_MS = 250;
const execFileAsync = promisify(execFile);

function sleep(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function acquireBuildLock() {
  const deadline = Date.now() + BUILD_LOCK_TIMEOUT_MS;

  while (true) {
    try {
      return await open(lockPath, "wx");
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for web-report build lock at ${lockPath}.`);
      }
      await sleep(BUILD_LOCK_RETRY_MS);
    }
  }
}

const lockHandle = await acquireBuildLock();

try {
  await rm(distRoot, { recursive: true, force: true });
  await mkdir(distRoot, { recursive: true });
  await cp(srcRoot, distRoot, { recursive: true, force: true });

  const viteBin = path.join(appRoot, "node_modules", "vite", "bin", "vite.js");
  const viteConfig = path.join(appRoot, "vite.config.ts");
  const { stdout, stderr } = await execFileAsync(process.execPath, [viteBin, "build", "--config", viteConfig], {
    cwd: appRoot,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024
  });
  if (stdout.trim()) process.stdout.write(stdout);
  if (stderr.trim()) process.stderr.write(stderr);
} finally {
  await lockHandle.close().catch(() => {});
  await rm(lockPath, { force: true }).catch(() => {});
}

console.log(`web-report built to ${distRoot}`);
