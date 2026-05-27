# Kevix Hook

Kevix Hook is a Claude Code plugin that adds a directive-first coding workflow
and a stop-time review loop.

It is meant for long coding tasks where normal Claude Code can start editing
too early or stop before product-level review is complete.

## What It Adds

Two hooks:

| Hook | Event | Purpose |
|---|---|---|
| Controller Hook | `UserPromptSubmit` | Detects coding tasks and injects the Kevix directive workflow. |
| Review Hook | `Stop` | Blocks stopping until the current git diff has a passing Kevix review log. |

## Install

Add the marketplace then install:

```bash
claude plugin marketplace add xxxbozzz/kevix-coding-harness
claude plugin install kevix-hook@kevix-lab
```

Or inside Claude Code:

```text
/plugin marketplace add xxxbozzz/kevix-coding-harness
/plugin install kevix-hook@kevix-lab
```

For local development without marketplace install:

```bash
claude --plugin-dir ./plugins/kevix-hook
```

## Runtime Files

Kevix writes per-project state under:

```text
.kevix/
├── task.md
├── directive.md
├── review_log.md
└── state.json
```

Add `.kevix/` to `.gitignore` if you do not want review state committed.

## When It Helps Most

Kevix Hook is most useful when the task has:

- ambiguous product intent
- multiple implementation steps
- backend/API/data-contract changes
- hidden edge cases
- risk of unrelated broad edits
- weak or incomplete test coverage
- need for a final review before claiming completion

It is less useful for:

- tiny one-line fixes
- pure algorithm exercises
- tasks with perfect tests and no product ambiguity
- quick exploratory conversations

## Current Evidence

The public L0 result shows **99.84%+ cache hit rate** in a production-like
long coding workflow. The hook package is the first public installable artifact
for testing the workflow discipline in Claude Code.

