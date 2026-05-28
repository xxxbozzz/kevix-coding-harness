# Kevix Engine

[English](README.md) | [中文](README_CN.md)

> Also available: [TUI (terminal app)](https://github.com/xxxbozzz/kevix-coding-harness/tree/tui) · [Claude Code Plugin](https://github.com/xxxbozzz/kevix-coding-harness/tree/plugin)

**Human-first coding harness engine. Not a black-box AI coder.**

---

## What Kevix Is

Kevix is a coding harness — it wraps an LLM in a structured workflow that puts the human in the control plane **before** AI executes. It is not an autonomous agent. It does not replace Claude Code or Aider. It competes on **auditability and boundary enforcement**, not on autonomy.

### The Core Problem

Most coding agents work like this:

```
User: "fix the bug"
Agent: reads files → edits code → runs tests → done
User: "wait, why did it change that file too?"
```

The agent decided what to touch. The user finds out after.

### Kevix's Answer

```
User: "fix the bug in src/foo.ts"
Kevix: "I'll edit src/foo.ts, read test/foo.test.ts, verify with npm test. OK?"
User: "Yes."
Kevix: [generates plan, executes inside confirmed boundary, shows diff + results]
```

The human confirms the boundary. The engine **enforces** it. This is not a prompt suggestion — it is a code-level gate chain that blocks any write outside the confirmed scope.

### Design Philosophy

1. **"Only modify what" — positive scope, not defensive exclusion.** The engine asks "what files CAN I change?" not "what files should I avoid?" A positive boundary is tight. A defensive list always has holes.

2. **Seek the average stable solution, not the extreme per-case optimum.** Writing code is not training a model. Most tasks need the smallest correct change with the least side effects. Don't over-engineer for edge cases the evidence doesn't show.

3. **Big-picture awareness through accumulated experience.** The Memory Sandbox captures every task outcome. The Wiki Distiller turns raw records into structured skills. The Auto Router uses those skills to decide memory vs probe mode. Each task builds on previous ones.

4. **Human confirms direction, AI executes in boundary.** Two checkpoints: Scope Proposal (confirm the boundary) and Directive Summary (confirm the plan). Between them, the engine enforces the contract.

5. **Experience becomes engineering capability.** Raw traces → LLM distills patterns → WikiSkills → future tasks get proven strategies injected. This is not RAG — it's structured knowledge that compounds.

---

## Architecture (5 Layers)

```
L0  Intent Recognition   →  What does the user want?
L1  Scope Contract        →  editableScope / readOnlyEvidence / successChecks
L2  PEAN Directive        →  Full 6-section plan (LLM cache-optimized structure)
L3  Runtime Gates         →  6-layer gate chain on every tool call
L4  Memory Sandbox + Wiki →  Raw traces → distilled skills → routing decisions
```

### L3 — Gate Chain (unique to Kevix)

Every Worker tool call passes through 6 deterministic gates:

```
directive → red-flag → scope → bash-risk → verifier → probe-required
```

| Gate | What it blocks |
|------|---------------|
| `directive` | Write/edit/bash without a valid PEAN directive |
| `red-flag` | Files explicitly marked as off-limits |
| `scope` | Files outside the human-confirmed editable scope |
| `bash-risk` | Dangerous commands (rm -rf, secrets, curl pipe) |
| `verifier` | Completion without probe verification (probe mode) |
| `probe-required` | Wire-level risks not yet probed |

Gates are code, not prompts. An LLM cannot talk its way past `scope-gate.ts`.

### L4 — Memory Sandbox + Wiki

```
Task completes
  → RawMemoryRecord captured (3-day TTL, auto-purged)
  → Working Drafts: LLM analyzes patterns, clusters, candidates (7-day TTL)
  → WikiSkill: verified, reusable capability (permanent, no TTL)
  → Auto Router: new tasks query wiki for recommended mode
```

Sandbox can be dirty. Wiki must be clean.

---

## Current State (v0.1.0)

**242 tests. 47 source files. 29 feature commits.**

| Feature | Status |
|---------|--------|
| PEAN pipeline (Controller → Worker → Review) | ✅ |
| 6-layer deterministic gate chain | ✅ |
| Scope Contract + expansion callback | ✅ |
| Memory Sandbox (raw → working → wiki, TTL, purge) | ✅ |
| WikiSkill distillation (LLM-driven, DeepSeek verified) | ✅ |
| Auto mode wiki routing | ✅ |
| Session compaction (context overflow protection) | ✅ |
| Multi-strategy edit matching (exact/trimmed/normalized) | ✅ |
| Structured error hierarchy (16 error codes) | ✅ |
| Atomic writes with auto-backup | ✅ |
| 6 tools with full test coverage | ✅ |
| Human scope inference + approval hook | ✅ |
| Wiki RAG injection into Controller hints | ✅ |

### Real API Verified

Tested end-to-end with DeepSeek on a real bugfix task (summarizeOrder.js):
- Scope Contract enforced (4/4 scope compliance)
- Multi-strategy edit applied correctly
- 4/4 tests passed after fix

---

## Comparison

| | Kevix | Claude Code | Aider | Cline |
|---|---|---|---|---|
| Scope enforcement | Gate-level (code) | Prompt-level | None | None |
| Human checkpoints | Scope + Directive | Inline ask | None | Inline ask |
| Experience memory | Wiki distillation | None | None | None |
| Gate chain | 6 deterministic layers | None | None | None |
| Multi-strategy edit | 3 strategies | LLM-powered | Fuzzy match | LLM-powered |
| Session compaction | ✅ | ✅ | ❌ | Partial |

Kevix does not compete on autonomy. It competes on **auditability and boundary enforcement**.

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
  onApprovalRequired: async (d) => { /* return "approve" | "reject" */ },
  onScopeProposed: async (s) => { /* return modified scope or null to cancel */ },
  memoryStore: new SandboxStore(".kevix/memory.json"),
});

// Scope compliance evidence
console.log(summary.scopeRespected);          // did Worker stay in boundary?
console.log(summary.filesChanged);            // what was modified?
console.log(summary.scopeExpansionRequests);  // boundary violations
console.log(summary.expandedScope);           // files added via expansion
```

---

## Roadmap

### Near-term (v0.2)
- [ ] Process sandbox (Docker-level isolation for Worker bash)
- [ ] PR-level diff generation
- [ ] LLM-driven conversation summarization (replacing trim-only compaction)
- [ ] TUI → Engine scopeContract wiring complete (in progress on `tui` branch)

### Mid-term (v0.3)
- [ ] GUI desktop app (Electron/Tauri)
- [ ] VS Code extension
- [ ] Multi-model provider support (OpenAI, Anthropic)
- [ ] Deeper Aider-style edit strategies

### Research
- [ ] Multi-file refactoring patterns in Wiki
- [ ] Cross-project skill transfer
- [ ] Autonomous distillation scheduling

---

## Setup

```bash
git clone https://github.com/xxxbozzz/kevix-coding-harness.git
cd kevix-coding-harness
npm install && npm run build && npm test  # 242 tests

export DEEPSEEK_API_KEY="sk-your-key-here"
```

## Branches

| Branch | Content |
|--------|---------|
| `main` | Engine core (here) |
| [`tui`](https://github.com/xxxbozzz/kevix-coding-harness/tree/tui) | Ink terminal UI |
| [`plugin`](https://github.com/xxxbozzz/kevix-coding-harness/tree/plugin) | Claude Code hooks |

## License

MIT
