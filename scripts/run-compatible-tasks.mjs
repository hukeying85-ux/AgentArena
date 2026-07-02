#!/usr/bin/env node
/**
 * Run only task packs that are compatible with the current Node/TypeScript repo.
 *
 * Usage:
 *   node scripts/run-compatible-tasks.mjs [--profile mimo-pro] [--model mimo-v2.5-pro]
 *
 * Compatible tasks (no jest/Go/Python/Docker dependencies):
 *   - repo-health (easy)
 *   - small-refactor (easy)
 *   - config-repair (easy)
 *   - snapshot-fix (medium)
 *   - builtin-demo-coding (demo)
 *   - docker-setup (medium, needs Docker)
 *   - json-contract-repair (medium, needs fixtures in repo)
 *   - api-documentation (medium, needs docs/ in repo)
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CLI = path.join(ROOT, "packages", "cli", "dist", "index.js");

// Parse args
const args = process.argv.slice(2);
const profileIdx = args.indexOf("--profile");
const modelIdx = args.indexOf("--model");
const profile = profileIdx >= 0 ? args[profileIdx + 1] : "mimo-pro";
const model = modelIdx >= 0 ? args[modelIdx + 1] : "mimo-v2.5-pro";

// Tasks verified compatible with Node/TS repos (no jest/Go/Python/Docker deps)
// Tested with mimo-v2.5-pro on 2026-06-19
const COMPATIBLE_TASKS = [
  {
    path: "examples/taskpacks/official/repo-health.yaml",
    difficulty: "easy",
    notes: "Basic repo health check — make one small improvement",
    avgScore: 100.0,
    passRate: "100%",
  },
  {
    path: "examples/taskpacks/official/small-refactor.yaml",
    difficulty: "easy",
    notes: "Small refactoring task",
    avgScore: 93.1,
    passRate: "100%",
  },
  {
    path: "examples/taskpacks/official/config-repair.yaml",
    difficulty: "easy",
    notes: "Fix a broken config file",
    avgScore: 96.5,
    passRate: "100%",
  },
  {
    path: "examples/taskpacks/official/snapshot-fix.yaml",
    difficulty: "medium",
    notes: "Fix snapshot test mismatches",
    avgScore: 91.1,
    passRate: "100%",
  },
  {
    path: "examples/taskpacks/official/builtin-demo-coding.yaml",
    difficulty: "demo",
    notes: "Demo coding task",
    avgScore: null,
    passRate: "untested",
  },
];

// Tasks that are compatible but fail due to missing prerequisites or API slowness
const OPTIONAL_TASKS = [
  {
    path: "examples/taskpacks/official/json-contract-repair.yaml",
    difficulty: "medium",
    notes: "Needs fixtures/response.json in repo — agent makes 0 changes if fixtures missing",
    avgScore: 40.0,
    passRate: "0%",
  },
  {
    path: "examples/taskpacks/official/api-documentation.yaml",
    difficulty: "medium",
    notes: "mimo API too slow — stream-json times out at 10min, text fallback also fails",
    avgScore: 40.0,
    passRate: "0%",
  },
];

const tasks = args.includes("--all")
  ? [...COMPATIBLE_TASKS, ...OPTIONAL_TASKS]
  : COMPATIBLE_TASKS;

console.log(`\n🚀 Running ${tasks.length} compatible tasks with ${profile}/${model}\n`);

const results = [];

for (const task of tasks) {
  const taskPath = path.join(ROOT, task.path);
  if (!existsSync(taskPath)) {
    console.log(`⏭️  SKIP: ${task.path} (file not found)`);
    results.push({ task: task.path, status: "skipped", reason: "file not found" });
    continue;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📋 Task: ${task.path}`);
  console.log(`   Difficulty: ${task.difficulty} | ${task.notes}`);
  console.log(`${"=".repeat(60)}\n`);

  try {
    const output = execFileSync("node", [
      CLI,
      "run",
      "--repo", ".",
      "--task", taskPath,
      "--agents", "claude-code",
      "--claude-profile", profile,
      "--claude-model", model,
    ], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 20 * 60_000, // 20 min per task
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Extract result from output
    const successMatch = output.match(/Score:\s*([\d.]+)/);
    const judgesMatch = output.match(/Judges:\s*(\d+)\/(\d+)/);
    const score = successMatch ? parseFloat(successMatch[1]) : 0;
    const judgesPassed = judgesMatch ? parseInt(judgesMatch[1]) : 0;
    const judgesTotal = judgesMatch ? parseInt(judgesMatch[2]) : 0;

    results.push({
      task: task.path,
      status: "success",
      score,
      judges: `${judgesPassed}/${judgesTotal}`,
    });
    console.log(`✅ PASSED — Score: ${score}, Judges: ${judgesPassed}/${judgesTotal}`);
  } catch (err) {
    const output = err.stdout?.toString() || err.stderr?.toString() || err.message;
    const scoreMatch = output.match(/Score:\s*([\d.]+)/);
    const judgesMatch = output.match(/Judges:\s*(\d+)\/(\d+)/);
    const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
    const judgesPassed = judgesMatch ? parseInt(judgesMatch[1]) : 0;
    const judgesTotal = judgesMatch ? parseInt(judgesMatch[2]) : 0;

    results.push({
      task: task.path,
      status: score > 0 ? "partial" : "failed",
      score,
      judges: `${judgesPassed}/${judgesTotal}`,
    });
    console.log(`❌ FAILED — Score: ${score}, Judges: ${judgesPassed}/${judgesTotal}`);
  }
}

// Summary
console.log(`\n${"=".repeat(60)}`);
console.log("📊 SUMMARY");
console.log(`${"=".repeat(60)}\n`);

const passed = results.filter((r) => r.status === "success").length;
const failed = results.filter((r) => r.status === "failed").length;
const partial = results.filter((r) => r.status === "partial").length;

console.log(`Total: ${results.length} | ✅ Passed: ${passed} | ❌ Failed: ${failed} | ⚠️  Partial: ${partial}`);
console.log(`Pass rate: ${((passed / results.length) * 100).toFixed(0)}%\n`);

console.log("Detailed results:");
for (const r of results) {
  const icon = r.status === "success" ? "✅" : r.status === "partial" ? "⚠️" : "❌";
  console.log(`  ${icon} ${r.task} — Score: ${r.score ?? "n/a"}, Judges: ${r.judges ?? "n/a"}`);
}
