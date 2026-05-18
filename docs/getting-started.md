# Getting Started

This guide walks you through running your first AgentArena benchmark in under 5 minutes.

## Prerequisites

- **Node.js 22+** — check with `node --version`
- **npm** (comes with Node) or **pnpm** (faster)

> **Windows users**: Use PowerShell or Git Bash. The default `cmd.exe` also works but PowerShell is recommended.

## Install

```bash
npm install -g @agentarena/cli
```

Verify the installation:

```bash
agentarena --version
```

## Your First Benchmark (No Auth Required)

AgentArena includes built-in demo agents that need no API keys or external setup. This is the fastest way to see it in action.

### 1. Create a demo task pack

```bash
agentarena init-taskpack --template repo-health --output my-task.yaml
```

### 2. Run the benchmark

```bash
agentarena run --repo . --task my-task.yaml --agents demo-fast,demo-thorough
```

This runs two demo agents against the current directory. You'll see live progress in the terminal.

### 3. View the results

```bash
agentarena ui
```

Open `http://127.0.0.1:4320` in your browser. The UI lets you explore scores, diffs, judge results, and traces.

## Benchmarking Real Agents

Once you've verified the flow works, you can benchmark real coding agents.

### Step 1: Check which agents are available

```bash
agentarena doctor
```

This shows which agent CLIs are installed and whether authentication is working.

### Step 2: Run with real agents

```bash
agentarena run \
  --repo /path/to/your/project \
  --task my-task.yaml \
  --agents codex,claude-code \
  --probe-auth
```

The `--probe-auth` flag checks authentication before running, so you don't waste time on agents that can't connect.

### Step 3: Compare results

After the run, open the UI:

```bash
agentarena ui
```

Or check the generated files in `.agentarena/runs/<run-id>/`:
- `summary.json` — machine-readable results
- `summary.md` — human-readable report
- `report.html` — interactive HTML report

## Common Workflows

### Compare multiple agents on one task

```bash
agentarena run \
  --repo . \
  --task my-task.yaml \
  --agents codex,claude-code,cursor,gemini-cli \
  --probe-auth
```

### Use the UI as a launcher

```bash
agentarena ui
```

The browser UI lets you pick the repo, task pack, and agents interactively. No need to remember CLI flags.

### Generate a CI workflow

```bash
agentarena init-ci --task my-task.yaml --agents codex,claude-code
```

This creates a GitHub Actions workflow that runs benchmarks on every PR.

### Run with JSON output (for scripting)

```bash
agentarena run --repo . --task my-task.yaml --agents demo-fast --json
```

## Understanding the Output

Each benchmark run produces:

| Output | Description |
|--------|-------------|
| `summary.json` | Full results with scores, judge outcomes, and metadata |
| `summary.md` | Human-readable Markdown report |
| `report.html` | Interactive HTML report with charts and diffs |
| `pr-comment.md` | Ready-to-paste PR comment with score table |
| `badge.json` | Shields.io-compatible badge data |

### Scoring

AgentArena computes a composite score (0-100) based on:

- **Test results** — did the agent's changes pass the tests?
- **Judge outcomes** — did custom judges (lint, file checks, etc.) pass?
- **Efficiency** — how fast and cost-effective was the agent?
- **Precision** — how targeted were the changes?

You can adjust the scoring weights with `--score-mode`:
- `practical` (default) — balanced for real-world tasks
- `balanced` — equal emphasis on all dimensions
- `issue-resolution` — SWE-bench style, focused on test passing
- `efficiency-first` — rewards faster, cheaper runs
- `rotating-tasks` — category-aware scoring for diverse task sets
- `comprehensive` — all weight keys enabled, thorough evaluation

## Next Steps

- [Troubleshooting](./troubleshooting.md) — common issues and fixes
- [Task Pack Reference](./taskpack-modes.md) — how to write custom task packs
- [Adapter Capabilities](./adapter-capabilities.md) — what each agent adapter supports
- [Scoring Deep Dive](./scoring.md) — how scores are computed
- [HTTP API](./http-api.md) — programmatic access to the UI server
