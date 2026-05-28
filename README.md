# Kevix Harness

[English](README.md) | [中文](README_CN.md)

**Human-first coding harness. Not a black-box AI coder.**

Kevix puts the human in the control plane before AI executes — confirm the task boundary, review a six-point summary, then let the engine work inside the scope you approved.

---

## Philosophy

> People should confirm **what** gets changed before AI starts changing it.

```
You type a short task
    → Scope Proposal: what to edit, what to leave, how to verify
    → You approve (or modify)
    → Six-point execution plan (summary view)
    → Worker executes inside your confirmed boundary
    → Diff + test results + scope compliance evidence
```

---

## Architecture (5 Layers)

| Layer | Role |
|-------|------|
| L0 Intent | What does the user want? Chat? Code? Data? |
| L1 Scope Contract | `editableScope` / `readOnlyEvidence` / `successChecks` |
| L2 PEAN Directive | Full 6-section plan (LLM cache-optimized) |
| L3 Runtime Gates | 6-layer gate chain on every tool call |
| L4 Memory + Wiki | Experience accumulates → distills → routes |

### L3 Gate Chain

Every tool call passes 6 gates: `directive → red-flag → scope → bash-risk → verifier → probe-required`

Gates are **code-level constraints**, not prompt suggestions.

### L4 Memory Sandbox

```
Task → RawMemoryRecord (3d TTL) → Working Drafts (7d TTL) → WikiSkill (permanent) → Auto Router
```

Not RAG — distilled structured experience, not raw context chunks.

---

## Environment Setup

**Prerequisites**: Node.js >= 20, npm >= 9, DeepSeek API key

```bash
git clone https://github.com/xxxbozzz/kevix-coding-harness.git
cd kevix-coding-harness
npm install && npm run build && npm test  # 242 tests
```

**API Key** (never commit):
```bash
export DEEPSEEK_API_KEY="sk-your-key-here"
```

---

## Quick Start

```bash
# CLI — non-interactive
kevix --mode memory "fix bug in src/foo.ts"
kevix --mode probe "refactor the auth module"

# TUI — interactive terminal
node dist/cli/ink/entry.js
```

---

## Programmatic API

```ts
import { runAgentLoop, DeepSeekProvider, SandboxStore } from "@kevix/engine";

const summary = await runAgentLoop({
  provider: new DeepSeekProvider(apiKey, { model: "deepseek-chat" }),
  tools: { definitions: [...], execute: async (call) => { ... } },
  mode: "memory",
  problem: "fix null reference in src/foo.ts",
  scopeContract: {
    editableScope: ["src/foo.ts"],
    readOnlyEvidence: ["test/foo.test.ts"],
    successChecks: ["npm test"],
  },
  onApprovalRequired: async (d) => { /* show user, return approve/reject */ },
  memoryStore: new SandboxStore(".kevix/memory.json"),
});

console.log(summary.scopeRespected, summary.filesChanged);
```

---

## Comparison

| | Kevix | CC | Aider | Cline |
|---|---|---|---|---|
| Scope enforcement | Gate-level | Prompt | None | None |
| Human checkpoints | Scope+Directive | Inline ask | None | Inline ask |
| Experience memory | Wiki distillation | None | None | None |
| Gate chain | 6 layers | None | None | None |

---

## Roadmap

- [ ] Process sandbox (Docker-level)
- [ ] GUI (Electron/Tauri)
- [ ] VS Code extension
- [ ] Prompt tuning per language
- [ ] Deeper Aider-style edit strategies

## License

MIT
