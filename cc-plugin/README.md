# Kevix CC Plugin

DeepSeek-native Kevix harness as a Claude Code plugin. Preserves CC's full UX, swaps the engine.

## Install

```bash
claude plugin marketplace add . --scope user
/plugin install kevix-hook@kevix-lab
```

## What it does

- Routes CC's LLM calls through DeepSeek API
- Adds Kevix Controller hook (UserPromptSubmit) — detects coding tasks, injects directive-first workflow
- Adds Kevix Review hook (Stop) — verifies changes against directive before completion
- Enables DeepSeek cache metrics display
- Enforces Kevix gates as CC permission rules

## What changes in CC

```
Before: Claude API → Claude Code UX
After:  DeepSeek API → Kevix harness → Claude Code UX
```

Same CC experience you know, Kevix engine underneath.
