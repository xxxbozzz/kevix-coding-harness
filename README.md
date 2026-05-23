# Kevix Coding Harness

> L0 technical note: 99.84%+ cache hit rate in a long-running coding-agent workflow.

This repository currently publishes:

1. the L0 cache-hit technical note for Kevix Coding Harness
2. the first installable Kevix Hook plugin for Claude Code

It does not publish the private engine implementation, private prompts, task logs, API keys, provider configuration, or unreleased harness internals.

## Published Documents

- [L0 Cache Hit Technical Note](docs/l0-cache-hit-technical-note.md)
- [When Kevix Hook Helps](docs/when-kevix-hook-helps.md)

## Install Kevix Hook

From this repository root:

```bash
claude plugin marketplace add . --scope user
```

Then inside Claude Code:

```text
/plugin install kevix-hook@kevix-lab
```

For local development:

```bash
claude --plugin-dir ./plugins/kevix-hook
```

The plugin registers two hooks:

| Hook | Event | Purpose |
|---|---|---|
| Controller Hook | `UserPromptSubmit` | Detects coding tasks and injects a directive-first workflow. |
| Review Hook | `Stop` | Blocks stopping until the current git diff has a passing Kevix review log. |

Plugin files:

- [plugins/kevix-hook](plugins/kevix-hook)
- [hooks/hooks.json](plugins/kevix-hook/hooks/hooks.json)
- [kevix_controller_hook.py](plugins/kevix-hook/scripts/kevix_controller_hook.py)
- [kevix_review_hook.py](plugins/kevix-hook/scripts/kevix_review_hook.py)

## L0 Claim

In a production-like coding-agent workflow using DeepSeek API, the current Kevix exploration observed a cache hit rate above **99.84%**.

The clearest captured run shows **99.88% input cache hit rate**:

```text
Date:                 2026-05-22
Total tokens:          134,617,888
Cached input tokens:   134,321,792
Uncached input tokens:     165,018
Output tokens:             131,078

Input cache hit rate:
134,321,792 / (134,321,792 + 165,018) = 99.8773%
```

![Kevix cache hit evidence, 2026-05-22](assets/cache-hit-2026-05-22.png)

The L0 result is not a claim that Kevix is already a complete coding harness. It is a narrow technical result:

> A long-running coding-agent workflow can be structured so that provider-side prefix caching remains highly effective under real usage.

## Why L0 Matters

Long coding tasks are expensive because agents repeatedly send large context, tool definitions, instructions, and working memory back to the model.

If a harness destroys prefix stability, every call becomes expensive. If the workflow preserves stable prefixes, large parts of the prompt can be cached by the provider.

The L0 result is therefore about infrastructure feasibility:

- lower marginal token cost for long coding sessions
- better viability for multi-step agent workflows
- stronger foundation for future reliability experiments
- evidence that harness design affects model economics, not just reasoning quality

## Scope

Current public scope:

- concept
- data point
- comparison table
- workflow diagram
- interpretation and limitations
- installable Claude Code hook plugin

Out of scope for this public L0 release:

- private engine source code
- private engine internals
- full benchmark claims
- private methodology details
- provider keys or private logs
