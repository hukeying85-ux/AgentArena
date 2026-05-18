---
name: spec-driven-change
description: Plan and execute code changes using a spec-driven workflow with structured documents. Use when making non-trivial changes (multi-file, multi-step, or behavior-impacting) that need structured planning before implementation. Not for trivial single-file edits.
---

# Spec-Driven Change

A structured workflow that separates planning from implementation. Write specs first, get approval, then implement. Every change is traceable, reversible, and verified.

## When to Use

- The change touches 3+ files or 2+ modules.
- The change affects public APIs, shared types, or cross-package contracts.
- The change has non-obvious side effects or blast radius.
- The user asks for a structured approach or wants to review before implementation.
- You are unsure about the full scope and need to explore before committing.

## When NOT to Use

- Single-file bug fix with clear cause and fix.
- Trivial changes (renaming a variable, fixing a typo).
- The user explicitly says "just do it" or "skip the planning".

## Critical Rules

These rules are **non-negotiable**. Violating any of them invalidates the entire workflow.

1. **NEVER write implementation code (edit source files) during Steps 1–5.** The only files you may create are spec.md, tasks.md, and checklist.md under `.specs/`.
2. **NEVER proceed past Step 5 without explicit user approval.** "Approval" means the user says yes, approves, confirms, or equivalent. Silence is not approval.
3. **NEVER skip a task in tasks.md.** If a task is blocked, update tasks.md to reflect the blocker and ask the user for guidance.
4. **NEVER mark a checklist item as passed without verifying it.** Verification means running a command, reading code, or checking a file — not assuming.

If you catch yourself about to violate any of these rules, STOP and re-read this section.

## Directory Structure

All spec documents live under `.specs/<change-id>/` at the project root:

```
.specs/
└── <change-id>/        # kebab-case, verb-led (e.g. "extract-scoring-constants")
    ├── spec.md         # What and why — requirements, impact, breaking changes
    ├── tasks.md        # How — ordered work items with dependencies
    └── checklist.md    # Done? — verification checkpoints
```

### change-id Naming

Use a short, verb-led kebab-case identifier that describes the change:

| Good | Bad |
|------|-----|
| `extract-scoring-constants` | `refactor` |
| `replace-ternary-with-registry` | `fix-shared-ts` |
| `add-process-utils-tests` | `improvements` |

## Workflow

### Step 1: Explore

Before writing any spec document, understand the current state:

1. Identify the files, functions, and types involved.
2. Trace callers and dependents to estimate blast radius.
3. Check existing tests for the affected code.
4. Note any gaps in test coverage that must be filled before refactoring.

**Output**: Mental model of the change scope. No files written yet.

**Self-check before proceeding**: Can you name every file that will be affected? Can you name every test file that covers the affected code? If not, explore more.

### Step 2: Write spec.md

Create `.specs/<change-id>/spec.md` with this structure:

```markdown
# [Change Title] Spec

## Why
[1-2 sentences on the problem or opportunity]

## What Changes
- [Bullet list of changes]
- [Mark breaking changes with **BREAKING**]

## Impact
- Affected packages/modules: [list]
- Affected public APIs: [list, or "none"]
- Risk level: [low / medium / high]

## ADDED Requirements
### Requirement: [Name]
The system SHALL provide...

#### Scenario: [Name]
- **WHEN** [condition]
- **THEN** [expected result]

## MODIFIED Requirements
### Requirement: [Name]
[Complete modified requirement with full detail]

## REMOVED Requirements
### Requirement: [Name]
**Reason**: [Why removing]
**Migration**: [How to handle existing usage]
```

Rules:
- Every requirement must be testable (can be verified by reading code or running a test).
- Breaking changes must be marked and include a migration path.
- If there are no ADDED/MODIFIED/REMOVED requirements for a section, omit that section entirely.

**Self-check before proceeding**: Does every requirement have at least one scenario with WHEN/THEN? Are all breaking changes marked? Can each requirement be verified without subjective judgment?

### Step 3: Write tasks.md

Create `.specs/<change-id>/tasks.md` with this structure:

```markdown
# Tasks
- [ ] Task 1: [Description]
  - [ ] SubTask 1.1: [Description]
  - [ ] SubTask 1.2: [Description]
- [ ] Task 2: [Description]

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] and [Task 4] can run in parallel
```

Rules:
- Each task must be independently verifiable (can run build/test after completing it).
- Tasks are ordered from low risk to high risk.
- If a task requires new tests, the test-writing task comes BEFORE the implementation task.
- Include a validation step for each task (what command to run, what to check).
- Do not over-decompose. A task should be a meaningful unit of work, not a single line change.

**Self-check before proceeding**: Can you run a command after completing each task to verify it? Does every implementation task have a corresponding test task that comes first?

### Step 4: Write checklist.md

Create `.specs/<change-id>/checklist.md` with verification checkpoints:

```markdown
- [ ] [Checkpoint description — must be verifiable]
```

Rules:
- Each checkpoint must be verifiable by reading code, running a command, or checking a file.
- Include both functional checkpoints (does it work?) and structural checkpoints (is the code organized correctly?).
- Include at least one checkpoint for each requirement in spec.md.

**Self-check before proceeding**: Does every requirement in spec.md have at least one corresponding checkpoint? Can each checkpoint be verified objectively (yes/no, pass/fail)?

### Step 5: Get Approval

**⛔ STOP. Do not write any implementation code. ⛔**

Present the spec documents to the user for review. Specifically:
1. Summarize the spec (what changes, why, impact).
2. List the tasks in order.
3. List the verification checkpoints.
4. Ask the user to approve or request changes.

Wait for explicit approval before proceeding. Explicit approval means the user says "yes", "approved", "looks good", "proceed", or equivalent. Silence, inaction, or changing the topic is NOT approval.

If the user requests changes:
1. Update the spec documents.
2. Re-present for approval.
3. Do not start implementation until approved.

**Self-check before proceeding**: Did the user explicitly say they approve? If not, do NOT proceed to Step 6.

### Step 6: Implement

After approval, implement tasks in order from tasks.md:

1. Mark the task as in-progress in tasks.md.
2. Implement the change.
3. Run the validation step for that task.
4. If validation passes, mark the task as completed in tasks.md (check the box: `- [x]`).
5. Move to the next task.

If a task fails validation:
1. Fix the issue.
2. Re-run validation.
3. Do not proceed to the next task until the current one passes.

If you discover that a task needs to be added or modified:
1. Update tasks.md with the new/modified task.
2. Continue implementation.

**Self-check after each task**: Did you run the validation command? Did it pass? Did you check the box in tasks.md?

### Step 7: Verify

After all tasks are completed:

1. Read checklist.md.
2. Verify each checkpoint by running a command, reading code, or checking a file.
3. Check the box (`- [x]`) for each passed checkpoint.
4. If any checkpoint fails, create a fix task in tasks.md and implement the fix.
5. Re-verify the failed checkpoint.

All checkpoints must pass before the change is considered complete.

**Self-check before finishing**: Are ALL checkboxes in checklist.md checked? Are ALL tasks in tasks.md marked completed? Did you run the project's full test suite as a final validation?

## Guardrails

| Rule | Reason |
|------|--------|
| No implementation code during Steps 1–5 | Planning and implementation must be separate |
| Every task must be independently verifiable | Enables incremental progress and easy rollback |
| Test tasks come before implementation tasks | Tests are the safety net for refactoring |
| Breaking changes must include migration | Users must have a path forward |
| One change-id per logical change | Keeps specs focused and reviewable |
| Spec documents are version-controlled | Track the evolution of the plan |

## Adapting to Your Project

This skill is project-agnostic. Adapt it by:

1. **Spec directory**: Change `.specs/` to whatever convention your project uses.
2. **Validation commands**: Replace generic "run build + test" with your project's actual commands.
3. **Risk levels**: Define what low/medium/high means in your project's context.
4. **Test requirements**: Specify minimum test coverage expectations for each risk level.

## What to Check Before Committing

- spec.md, tasks.md, and checklist.md all exist under `.specs/<change-id>/`.
- Every requirement in spec.md has at least one corresponding checkpoint in checklist.md.
- Every task in tasks.md has a validation step.
- No implementation code was written before spec approval.
- All checklist items are checked after implementation.
