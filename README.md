# Kevix Coding Harness

> L0 technical note: 99.84%+ cache hit rate in a long-running coding-agent workflow.

This repository publishes:

1. the L0 cache-hit technical note for Kevix Coding Harness
2. the first installable Kevix Hook plugin for Claude Code
3. the Kevix engine — a DeepSeek-native coding agent with structured harness methodology

The private engine implementation, prompts, task logs, API keys, provider configuration, and unreleased harness internals are not published.

## Published Documents

- [L0 Cache Hit Technical Note](docs/l0-cache-hit-technical-note.md)
- [When Kevix Hook Helps](docs/when-kevix-hook-helps.md)


## Kevix Hook for Claude Code

Install the Kevix Hook plugin to add directive-first planning and stop-time review to Claude Code.

### Quick Install

```text
/plugin marketplace add xxxbozzz/kevix-coding-harness
/plugin install kevix-hook@kevix-lab
```

Or from the terminal:

```bash
claude plugin marketplace add xxxbozzz/kevix-coding-harness
claude plugin install kevix-hook@kevix-lab
```

### Local Development

```bash
claude --plugin-dir ./plugins/kevix-hook
```

The plugin registers two hooks:

| Hook | Event | Purpose |
|---|---|---|
| Controller Hook | `UserPromptSubmit` | Detects coding tasks and injects a directive-first workflow. |
| Review Hook | `Stop` | Blocks stopping until the current git diff has a passing Kevix review log. |

### Plugin Files

- [plugins/kevix-hook](plugins/kevix-hook)
- [hooks/hooks.json](plugins/kevix-hook/hooks/hooks.json)
- [kevix_controller_hook.py](plugins/kevix-hook/scripts/kevix_controller_hook.py)
- [kevix_review_hook.py](plugins/kevix-hook/scripts/kevix_review_hook.py)

---

## L0 Claim

In a production-like coding-agent workflow using DeepSeek API, Kevix observed a cache hit rate above **99.84%**.

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

The L0 result is not a claim that Kevix is already a complete coding harness. It is a narrow technical result:

> A long-running coding-agent workflow can be structured so that provider-side prefix caching remains highly effective under real usage.

### Why L0 Matters

Long coding tasks are expensive because agents repeatedly send large context, tool definitions, instructions, and working memory back to the model.

If a harness destroys prefix stability, every call becomes expensive. If the workflow preserves stable prefixes, large parts of the prompt can be cached by the provider.

### Scope

Current public scope: concept, data point, comparison table, workflow diagram, interpretation and limitations, installable Claude Code hook plugin.

Out of scope: private engine source code, private engine internals, full benchmark claims, private methodology details, provider keys or private logs.


## License

MIT
