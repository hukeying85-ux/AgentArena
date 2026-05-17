# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **15 AI coding agent adapters**: Codex CLI, Claude Code, Cursor, Gemini CLI, GitHub Copilot, Qwen Code, Windsurf, Aider, Kilo CLI, OpenCode, Trae, Augment, and 3 demo variants
- **15 judge types**: command, test-result, lint-check, file-exists, file-contains, json-value, json-schema, glob, file-count, snapshot, patch-validation, token-efficiency, directory-exists, regex-match, compilation
- **6 scoring modes**: practical, balanced, issue-resolution (SWE-Bench inspired), efficiency-first (industry best practices), rotating-tasks (LiveBench inspired), comprehensive
- Decision report generator with scenario-based recommendations and team cost calculator
- Variance analysis module for multi-run statistical reliability
- Web UI: code review view, share/export actions, weight sliders, theme toggle (dark/light), loading states, error recovery
- Run list search/filter and agent click-to-filter
- `agentarena init-taskpack` with 6 templates: repo-health, json-api, snapshot, compilation-check, directory-structure, full-e2e
- Task pack schema strict validation (unknown field rejection at top-level and per-judge-type)
- Multi task pack conflict detection (`detectTaskPackConflicts`)
- PWA support with service worker update notification
- Full i18n (English + Chinese) for web-report UI
- Web-report: update banner, accessibility improvements (44px touch targets, skip-link, focus-visible)
- HTML report: dark mode support via `prefers-color-scheme`
- CI: release tag trigger for benchmark workflow

### Changed
- Unified weight definitions to single source (getDefaultWeights in @agentarena/report)
- Simplified launcher: single Run button replacing Quick Start / Start Benchmark
- Improved light theme contrast for accessibility
- Refined extractTestDetails with unified Jest/Vitest format detection
- CI benchmark workflow: Node.js 20 → 22 (aligned with project requirement)
- Adapter process cleanup: retry-based kill with verification for Unix and Windows
- Event parser robustness: ANSI stripping, depth-limited recursion, parse error logging
- Environment variable allowlist expanded from 15 to 46 entries

### Fixed
- 37 code review issues including duplicate judge execution, regex injection protection, consistent critical field defaults, CLI validation alignment, sensitive data protection
- 4 audit findings: dead code documentation, theme contrast, auto-detection robustness, fallback completeness
- `isAbortError` now recognizes native `AbortError` in addition to custom `BenchmarkCancelledError`
- `throwIfCancelled` redundant catch block removed
- `createHttpError` replaced type assertion with explicit `HttpError` class
- `leaderboard.ts` eliminated `any` casts and non-null assertions
- `summarizeLauncherSelection` now includes all agent variants in count and preview
- `mapWithConcurrency` error isolation: single agent failure no longer crashes other workers
- Snapshot OOM prevention: streaming hash for large files
- Trace writeQueue crash recovery with fail-fast behavior
- Compress failure cleanup: removes incomplete .gz files
- Auth probe false positive fix: checks parsed error events even on exitCode 0

### Fixed (code review)
- CLI: finally block no longer overwrites "error" state to "done" — UI now correctly shows failed runs
- Scoring: failed score band 10-40 is now reachable (multiplier fixed from 10 to 100)
- Scoring: critical judge failure scoring uses user-configured weights instead of hardcoded multipliers
- Judges: unknown judge types return structured failure instead of crashing with undefined
- Server: constant-time auth comparison always iterates full token length (no timing leak)
- Server: X-Forwarded-For uses last entry before proxy to resist spoofing
- Adapters: qwen-adapter variable shadowing fixed, pricing uses correct model key
- Adapters: claude-adapter includes parsed.error in status determination
- Adapters: codex-adapter splice ordering fixed for model and reasoning effort args
- Adapters: event-parsers empty if block now breaks instead of continuing
- Adapters: process-utils byte/char mismatch in output truncation fixed
- Adapters: duplicate SIGKILL timer prevention in process cleanup
- Core: snapshot copy uses verbatimSymlinks to prevent symlink following
- Judges: command-runner uses process group SIGKILL on Unix, prevents duplicate timers
- Web-report: storage clearAll() no longer hangs when IndexedDB store is unavailable
- Web-report: scoring weight comparison uses deep equality instead of reference identity
- Web-report: community view null guards for lastPublishedAt, avgScore, successRate
- Web-report: ResizeObserver leak fixed by disconnecting previous observer
- Web-report: stale community fetch guard prevents overwriting newer data
- CLI: run command uses throw instead of process.exit for consistent error handling
- CLI: --max-concurrency has upper bound of 64
- CLI: -v flag conflict resolved (--version uses -V, --verbose keeps -v)
- API routes: withErrorHandling logs errors instead of silently swallowing
- Dead code removed: unused GeminiJsonEvent, tryGetAdapter, _WEIGHT_NAMES
- All 600 tests passing (4 pre-existing failures resolved)

### Added
- docs/getting-started.md: user-facing install and first benchmark guide
- docs/troubleshooting.md: common issues, auth failures, Windows fixes, FAQ
- CHANGELOG.md: this file

### Security
- Regex injection protection (flags whitelist + 2000 char limit for regex-match judge)
- Sensitive data protection in adapter console output
- Task pack path traversal prevention
- JSON Pointer bounds checking
- Timing-safe auth token comparison (constant-time, no length leak)
- Symlink-aware path validation with TOCTOU consideration
- verbatimSymlinks in snapshot copy prevents external file leakage

## 0.1.0 (2026-03-19)

Initial public release.

### Features

- `agentarena ui` — browser-based benchmark launcher and report viewer
- `agentarena run` — CLI benchmark runner
- `agentarena doctor` — adapter readiness checker with auth probing
- `agentarena init-taskpack` — starter task pack generator
- `agentarena init-ci` — GitHub Actions workflow generator
- `agentarena list-adapters` — adapter capability listing
- Agent adapters: demo-fast, demo-thorough, demo-budget, codex, claude-code, cursor
- 10 judge types: command, test-result, lint-check, file-exists, file-contains, glob, file-count, snapshot, json-value, json-schema
- 9 official task packs across 3 difficulty tiers (easy, medium, hard)
- Interactive web report with agent comparison, inline detail expansion, cross-run comparison, and trend tracking
- Real-time benchmark progress with live log streaming
- Report outputs: summary.json, summary.md, pr-comment.md, report.html, badge.json
- Bilingual UI (English / 中文)
- PWA offline support
- Keyboard accessibility for comparison tables and bar charts
- GitHub Actions CI with smoke benchmark and PR commenting
