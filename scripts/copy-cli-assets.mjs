import { cp, mkdir, rm } from "node:fs/promises";
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

console.log(`CLI runtime assets copied to ${cliAssets}`);
