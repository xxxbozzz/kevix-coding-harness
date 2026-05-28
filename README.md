# Kevix TUI

[English](README.md) | [中文](README_CN.md)

> Also available: [Engine](https://github.com/xxxbozzz/kevix-coding-harness) · [Plugin](https://github.com/xxxbozzz/kevix-coding-harness/tree/plugin)

Ink-based interactive terminal UI for Kevix Harness. Scope Proposal → six-point summary → live diff.

---

## Interaction Flow

```
1. Type a coding task
2. Scope Proposal card (editableScope / readOnlyEvidence / successCheck)
3. Approve → Controller generates directive
4. Six-point summary (①-⑥), [V] to expand full text
5. Execute → Worker runs, diff rendered in terminal
6. Result card with scope compliance evidence
```

## Run

```bash
cd kevix-coding-harness
npm install && npm run build
DEEPSEEK_API_KEY=sk-... node dist/cli/ink/entry.js
```

## License

MIT
