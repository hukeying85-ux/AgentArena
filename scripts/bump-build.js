#!/usr/bin/env node
/**
 * Auto-increment build number before each build.
 *
 * Reads package.json's `buildNumber`, increments it, writes it back.
 * The actual version-info.json is generated later by copy-cli-assets.mjs
 * (after the assets dir is cleaned) — this script only bumps the number
 * so it's ready when needed.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const pkgPath = join(rootDir, "package.json");

// Read + increment buildNumber in package.json
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.buildNumber = (pkg.buildNumber ?? 0) + 1;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

console.log(`[build] v${pkg.version} #${pkg.buildNumber}`);
