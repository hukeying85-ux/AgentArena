# Task Pack Authoring Guide

A task pack defines what agents should do and how their work is evaluated.

## Schema

```yaml
schemaVersion: agentarena.taskpack/v1
id: my-task
title: My Task
description: What the agent should accomplish.

metadata:
  source: official
  owner: YourName
  difficulty: easy | medium | hard
  objective: What success looks like
  judgeRationale: Why these judges verify success
  repoTypes: [node, python, go, generic]
  tags: [testing, security]
  dependencies: [npm, pytest]

# Use a built-in repo or run against the user's repo
repoSource: builtin://nodejs-app  # optional

prompt: |
  ## Task
  What the agent should do.

  ## Constraints
  - Only modify expected files
  - Do not add dependencies

expectedChangedPaths:
  - src/my-file.js

envAllowList:
  - NODE_ENV
  - CI

setupCommands:
  - id: create-fixtures
    label: Create test fixtures
    command: node -e "require('node:fs').writeFileSync('fixture.json', '{}')"
    timeoutMs: 10000

judges:
  - id: tests-pass
    type: command
    label: Tests pass
    command: node --test test/my-test.js
    timeoutMs: 30000
    critical: true

teardownCommands:
  - id: cleanup
    label: Remove temp files
    command: rm -rf temp/
    timeoutMs: 10000
```

## Judge Types

| Type | Purpose | Key Fields |
|------|---------|------------|
| `command` | Run a shell command | `command`, `critical` |
| `test-result` | Parse test framework output | `command`, `format`, `reportFile` |
| `file-exists` | Check file presence | `path` |
| `file-contains` | Check file content | `path`, `pattern`, `regex` |
| `glob` | Match files by pattern | `pattern`, `min`, `max` |
| `file-count` | Count files | `pattern`, `min`, `max` |
| `snapshot` | Compare file to reference | `path`, `expect` |
| `json-value` | Check JSON field value | `path`, `field`, `expect` |
| `json-schema` | Validate JSON against schema | `path`, `schema` |
| `lint-check` | Run linter | `command`, `maxWarnings` |
| `compilation` | Build/check compilation | `command` |
| `token-efficiency` | Score by token usage | `tokenBudget` |
| `patch-validation` | Validate diff quality | `maxFiles`, `maxLines` |
| `regex-match` | Regex against file | `path`, `pattern` |
| `directory-exists` | Check directory | `path` |

## Best Practices

1. **Use `setupCommands`** to create fixtures — don't assume the repo has them
2. **Set `critical: true`** on judges that must pass for the task to be considered successful
3. **Keep timeouts reasonable** — 10s for simple commands, 30s+ for test suites
4. **Use `envAllowList`** to pass necessary environment variables
5. **Test with demo agents** before publishing: `agentarena run --repo . --task my-task.yaml --agents demo-fast`

## Built-in Repositories

- `builtin://nodejs-app` — Node.js app with src/, test/, fixtures/
- `builtin://nodejs-monorepo` — TypeScript monorepo with packages/
