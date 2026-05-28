# Kevix Engine

[English](README.md) | [中文](README_CN.md)

**Human-first coding harness engine. Not a black-box AI coder.**

The engine enforces that people confirm **what** gets changed before AI starts changing it — through Scope Contracts, gate chains, and auditable memory.

```ts
import { runAgentLoop, DeepSeekProvider, SandboxStore } from "@kevix/engine";
```

---

## Kevix Harness — Principle

Most coding agents are continuous reasoning loops. Kevix inserts structured human checkpoints:

```
Task → Scope Proposal → Human confirms → 6-point summary → Worker executes in boundary → Evidence captured
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

Every Worker tool call passes through 6 gates in order:

```
directive → red-flag → scope → bash-risk → verifier → probe-required
```

Each gate returns `allow | deny | ask`. Gates are deterministic — same input, same output. LLM cannot bypass.

### L4 — Memory Sandbox + Wiki

```
Task completes → RawMemoryRecord (3-day TTL)
  → Working Drafts (7-day TTL, LLM distills patterns)
  → WikiSkill (permanent, reused by auto router)
```

Not RAG — distilled structured experience (playbook, failure modes, checklist), not raw chunks.

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
  onScopeProposed: async (s) => { /* return modified scope or null to cancel */ },
  memoryStore: new SandboxStore(".kevix/memory.json"),
});

// Scope compliance evidence
console.log(summary.scopeRespected);   // did Worker stay in boundary?
console.log(summary.filesChanged);     // what was modified?
console.log(summary.scopeExpansionRequests); // boundary violations
```

## Environment Setup

```bash
git clone https://github.com/xxxbozzz/kevix-coding-harness.git
cd kevix-coding-harness
npm install && npm run build && npm test  # 242 tests

export DEEPSEEK_API_KEY="sk-your-key-here"
```

## Comparison

| | Kevix | CC | Aider |
|---|---|---|---|
| Scope enforcement | Gate-level | Prompt-level | None |
| Human checkpoints | Scope + Directive | Inline ask | None |
| Experience memory | Wiki distillation | None | None |
| Gate chain | 6 deterministic layers | None | None |
| Multi-strategy edit | Exact/Trimmed/Normalized | LLM | Fuzzy |

## Repo Structure

| Branch | Content |
|--------|---------|
| `main` | Engine core (this branch) |
| `tui` | Ink-based terminal UI |
| `plugin` | Claude Code plugin (scope-first hooks) |

## License

MIT
