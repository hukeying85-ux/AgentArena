# Plan: Make All Official Task Packs Self-Contained

## Problem

6 out of 26 official task packs are fundamentally broken — they hard-code `npx --no-install jest` as the test command, which only works on repos that have Jest installed. They claim multi-language support (Go, Python, Java) but can only run JavaScript tests with Jest.

Additionally, `json-contract-repair` and `api-documentation` fail because they expect fixture files that don't exist in arbitrary repos.

**Root cause:** All 26 official task packs have `setupCommands: []`. None of them create their own fixtures. They all assume the target repo already has the files they need.

## Design Principles

1. **Every official task pack MUST work on ANY repo** — no exceptions
2. **Use `setupCommands`** to create fixture files before the agent runs
3. **Use `builtin://nodejs-monorepo`** for tasks that need a specific repo structure
4. **Universal test runner** — must work with Node built-in test runner, Jest, and Vitest
5. **Judges must not assume specific frameworks** — use `file-contains`, `file-exists`, `command` with generic checks

## Tasks to Fix

### Group A: Hard-coded Jest (6 tasks) — Use builtin repo + setupCommands

These all have the same broken pattern: `npx --no-install jest --json --outputFile=...`

| Task | Fix Strategy |
|------|-------------|
| `dependency-update` | Add `repoSource: builtin://nodejs-monorepo`, replace jest judge with universal test runner |
| `error-handling` | Add `repoSource: builtin://nodejs-monorepo`, replace jest judge with universal test runner |
| `input-validation` | Add `repoSource: builtin://nodejs-monorepo`, replace jest judge with universal test runner |
| `logging-improvement` | Add `repoSource: builtin://nodejs-monorepo`, replace jest judge with universal test runner |
| `security-hardening` | Add `repoSource: builtin://nodejs-monorepo`, replace jest judge, fix `.env` judge |
| `test-coverage` | Add `repoSource: builtin://nodejs-monorepo`, replace jest+eslint judges |

### Group B: Missing fixtures (3 tasks) — Add setupCommands

| Task | Fix Strategy |
|------|-------------|
| `json-contract-repair` | Add `setupCommands` to create `fixtures/response.json` and `fixtures/response.schema.json` via `node -e` |
| `api-documentation` | Add `setupCommands` to create a minimal `src/api.js` file, prompt still asks agent to write `docs/api.md` |
| `failing-test-fix` | Add `repoSource: builtin://nodejs-monorepo` + `setupCommands` to inject a broken implementation into an existing test |

### Group C: Needs builtin repo (1 task)

| Task | Fix Strategy |
|------|-------------|
| `performance-optimize` | Add `repoSource: builtin://nodejs-monorepo`, remove `pnpm benchmark` judge, use generic perf check |

### Group D: Already works (4 tasks) — No changes needed

- `repo-health` ✅
- `small-refactor` ✅
- `config-repair` ✅
- `snapshot-fix` ✅

### Group E: Already uses builtin repo (3 tasks) — No changes needed

- `builtin-demo-coding` ✅
- `cross-module-refactor` ✅
- `multi-file-rename` ✅

## Universal Test Runner Pattern

Replace all `npx --no-install jest` commands with this robust pattern (already used in cross-module-refactor, multi-file-rename):

```yaml
command: node -e "
  const fs=require('node:fs');
  const {spawnSync}=require('node:child_process');
  const report='.agentarena/test-results.json';
  fs.mkdirSync('.agentarena',{recursive:true});
  // Try pnpm test then npm test with multiple output formats
  for(const [cmd,args] of [
    ['pnpm',['test','--','--runInBand','--json','--outputFile',report]],
    ['pnpm',['test','--','--runInBand','--reporter=json','--outputFile',report]],
    ['npm',['run','test','--','--runInBand','--json','--outputFile',report]],
    ['npm',['run','test','--','--runInBand','--reporter=json','--outputFile',report]]
  ]){
    fs.rmSync(report,{force:true});
    const r=spawnSync(cmd,args,{stdio:'inherit',shell:process.platform==='win32'});
    if(!r.error&&fs.existsSync(report)&&fs.statSync(report).size>0){
      process.exit(r.status??1)
    }
  }
  // Final fallback: try node --test (Node built-in test runner)
  const r=spawnSync('node',['--test'],{stdio:'inherit',shell:process.platform==='win32'});
  process.exit(r.status??1)
"
format: auto
reportFile: .agentarena/test-results.json
```

## Implementation Order

1. **json-contract-repair** — add setupCommands to create fixtures
2. **api-documentation** — add setupCommands to create minimal API file
3. **failing-test-fix** — add builtin repo + setupCommands to inject bug
4. **error-handling** — add builtin repo + universal test runner
5. **dependency-update** — add builtin repo + universal test runner
6. **input-validation** — add builtin repo + universal test runner
7. **logging-improvement** — add builtin repo + universal test runner
8. **security-hardening** — add builtin repo + universal test runner + fix .env judge
9. **test-coverage** — add builtin repo + universal test runner
10. **performance-optimize** — add builtin repo + remove benchmark judge

## Files to Modify

- `examples/taskpacks/official/*.yaml` (10 files)
- `packages/cli/assets/taskpacks/official/*.yaml` (same 10 files, keep in sync)

## Validation

After changes, run each task pack with demo agent to verify:
- No compatibility warnings
- Setup commands succeed
- Judges execute without errors
- Task completes end-to-end
