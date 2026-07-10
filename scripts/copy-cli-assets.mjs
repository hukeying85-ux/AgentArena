import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const webReportDist = path.join(repoRoot, "apps", "web-report", "dist");
const webReportBuildScript = path.join(repoRoot, "apps", "web-report", "scripts", "build.mjs");
const officialTaskpacks = path.join(repoRoot, "examples", "taskpacks", "official");
const builtinRepos = path.join(repoRoot, "examples", "taskpacks", "repos");
const cliAssets = path.join(repoRoot, "packages", "cli", "assets");

await import(pathToFileURL(webReportBuildScript).href);

await rm(cliAssets, { recursive: true, force: true });
await mkdir(cliAssets, { recursive: true });
await cp(webReportDist, path.join(cliAssets, "web-report"), { recursive: true, force: true });
await cp(officialTaskpacks, path.join(cliAssets, "taskpacks", "official"), { recursive: true, force: true });
await cp(builtinRepos, path.join(cliAssets, "taskpacks", "repos"), { recursive: true, force: true });

// Generate version-info.json for the frontend (buildNumber already bumped by prebuild)
const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const buildMeta = {
  version: pkg.version,
  buildNumber: pkg.buildNumber ?? 0,
  buildTime: new Date().toISOString(),
  gitCommit: getGitCommit(repoRoot),
};
await writeFile(
  path.join(cliAssets, "version-info.json"),
  JSON.stringify(buildMeta, null, 2) + "\n",
  "utf8"
);

console.log(`CLI runtime assets copied to ${cliAssets}`);
console.log(`Version: v${pkg.version} #${buildMeta.buildNumber} (${buildMeta.gitCommit.slice(0, 7)})`);

function getGitCommit(cwd) {
  try {
    const { execSync } = require("node:child_process");
    const hash = execSync("git rev-parse HEAD", { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
    return hash || "unknown";
  } catch {
    return "unknown";
  }
}
