# Kevix Plugin — Claude Code Hooks

[English](README.md) | [中文](README_CN.md)

> Also available: [Engine](https://github.com/xxxbozzz/kevix-coding-harness) · [TUI](https://github.com/xxxbozzz/kevix-coding-harness/tree/tui)

Scope-first Claude Code plugin. Injects Kevix Harness checkpoints into CC sessions.

---

## What It Does

When you type a coding task in Claude Code, the plugin:

1. **Controller Hook** (UserPromptSubmit) — prompts CC to write a Scope Proposal first
2. **Review Hook** (Stop) — blocks CC from stopping until it reviews the diff against scope

The user sees a 6-point summary. The Worker reads the full directive from `.kevix/directive.md`.

## Install

```bash
claude plugin install kevix-hook@kevix-lab
```

Or from this repo:

```bash
claude plugin marketplace add kevix-lab https://github.com/xxxbozzz/kevix-coding-harness
claude plugin install kevix-hook@kevix-lab
```

## License

MIT
