# Kevix Engine

[English](README.md) | [中文](README_CN.md)

> Also available: [TUI (terminal app)](https://github.com/xxxbozzz/kevix-coding-harness/tree/tui) · [Claude Code Plugin](https://github.com/xxxbozzz/kevix-coding-harness/tree/plugin)

**Human-first coding harness engine. Not a black-box AI coder.**

The engine enforces that people confirm **what** gets changed before AI starts changing it — through Scope Contracts, gate chains, and auditable memory.

```ts
import { runAgentLoop, DeepSeekProvider, SandboxStore } from "@kevix/engine";
```

---

## Branches

| Branch | What | Status |
|--------|------|--------|
| `main` | Engine core (here) | 242 tests ✅ |
| [`tui`](https://github.com/xxxbozzz/kevix-coding-harness/tree/tui) | Ink terminal UI | Interactive |
| [`plugin`](https://github.com/xxxbozzz/kevix-coding-harness/tree/plugin) | Claude Code hooks | Scope-first |

---

## Principle

Most coding agents are continuous reasoning loops. Kevix inserts structured human checkpoints:

```
Task → Scope Proposal → Human confirms → 6-point summary → Worker in boundary → Evidence
```

The engine does not guess. Gates are code-level constraints, not prompt suggestions.

## Architecture (5 Layers)

| Layer | Role | Module |
|-------|------|--------|
| L0 Intent | What does the user want? | `scope-inference.ts` |
| L1 Scope Contract | editableScope / readOnlyEvidence / successChecks | `types.ts` → gate chain |
| L2 PEAN Directive | Full 6-section plan (LLM cache-optimized) | `prompts.ts`, `agent-loop.ts` |
| L3 Runtime Gates | 6-layer gate chain on every tool call | `gates/` |
| L4 Memory + Wiki | Experience accumulates → distills → routes | `memory/` |

### L3 — Gate Chain

```
directive → red-flag → scope → bash-risk → verifier → probe-required
```

Gates are deterministic — same input, same output. LLM cannot bypass.

### L4 — Memory Sandbox + Wiki

```
Task → RawMemoryRecord (3d TTL) → Working Drafts (7d TTL) → WikiSkill (permanent) → Router
```

Not RAG — distilled structured experience, not raw context chunks.

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
  onApprovalRequired: async (d) => { /* return "approve" | "reject" */ },
  memoryStore: new SandboxStore(".kevix/memory.json"),
});
```

## Setup

```bash
git clone https://github.com/xxxbozzz/kevix-coding-harness.git
cd kevix-coding-harness
npm install && npm run build && npm test  # 242 tests
export DEEPSEEK_API_KEY="sk-your-key-here"
```

## License

MIT
