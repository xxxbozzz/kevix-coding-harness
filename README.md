# Kevix Harness

**Human-first coding harness. Not a black-box AI coder.**

Kevix puts the human in the control plane before AI executes — confirm the task boundary, review a six-point summary, then let the engine work inside the scope you approved.

---

## Philosophy

Kevix is built on one principle:

> People should confirm **what** gets changed before AI starts changing it.

Most coding agents operate as continuous reasoning loops — they read, think, write, test in a stream. You watch them work but can't audit their decisions until after they're done.

Kevix flips this:

```
You type a short task
    → Kevix proposes a Scope: what to edit, what to leave, how to verify
    → You approve (or modify)
    → Kevix generates a six-point execution plan (you see the summary)
    → Worker executes inside your confirmed boundary
    → You see the diff, test results, and whether the scope was respected
```

The engine does not "guess" whether it should touch a file. The gate chain **prevents** it from crossing the boundary. If the Worker genuinely needs more scope, it asks — it doesn't silently expand.

## Architecture (5 Layers)

```
L0  Intent          →  What does the user want? Chat? Code? Data query?
L1  Scope Contract  →  editableScope / readOnlyEvidence / successChecks
L2  PEAN Directive  →  Full 6-section plan (LLM cache-optimized structure)
L3  Runtime Gates   →  6-layer gate chain enforcing every tool call
L4  Memory + Wiki   →  Experience accumulates, distills, and routes future tasks
```

### L3 Gate Chain

Every tool call passes through 6 gates in order:

| Gate | What it blocks |
|------|---------------|
| directive | Write/edit/bash without a valid PEAN directive |
| red-flag | Files explicitly marked as off-limits |
| scope | Files outside the user-confirmed editable scope |
| bash-risk | Dangerous shell commands (rm -rf, curl pipe, secrets) |
| verifier | Completion without probe verification (probe mode) |
| probe-required | Wire-level risks not yet probed |

Gates are code-level constraints — not prompt suggestions.

### L4 Memory Sandbox + Wiki

```
Task completes → RawMemoryRecord captured (3-day TTL)
    → Working Layer: LLM drafts patterns, clusters, hypotheses (7-day TTL)
    → WikiSkill: verified, reusable capability (permanent)
    → Auto Router: future tasks query wiki for recommended mode
```

This is **not RAG**. RAG stuffs similar text into a prompt. Kevix distills structured experience (playbook, failure modes, verification checklist) and injects it as Controller hints. The LLM gets proven patterns, not raw context chunks.

---

## Environment Setup

### Prerequisites

- **Node.js >= 20.0.0**
- **npm >= 9**
- **DeepSeek API key** ([platform.deepseek.com](https://platform.deepseek.com))

### Install

```bash
git clone https://github.com/xxxbozzz/kevix-coding-harness.git
cd kevix-coding-harness
npm install
npm run build
npm test  # 242 tests, no API key needed
```

### Configure API Key

```bash
# Shell profile (~/.zshrc or ~/.bashrc)
export DEEPSEEK_API_KEY="sk-your-key-here"

# Or .env file (gitignored, never committed)
echo 'DEEPSEEK_API_KEY=sk-your-key-here' > .env
```

### Verify

```bash
npm test                                           # 242 tests
DEEPSEEK_API_KEY=sk-... npx tsx scripts/smoke-test.ts  # real API
```

---

## Quick Start

```bash
# CLI — non-interactive
kevix --mode memory "fix bug in src/foo.ts"
kevix --mode probe "refactor the auth module"
kevix --mode auto --yes "run npm test and fix failures"

# TUI — interactive terminal app
node dist/cli/ink/entry.js
```

### TUI Interaction Flow

```
1. Type a coding task → Enter
2. Scope Proposal:
   ┌ Scope Proposal ──────────────────────────┐
   │ Editable Scope:  src/summarizeOrder.js    │
   │ Read-only:        test/summarizeOrder.js  │
   │ Success Check:    npm test                │
   │ [Enter] Approve  [E] Edit  [Esc] Cancel  │
   └───────────────────────────────────────────┘
3. Approve → Controller generates directive
4. Six-point summary (①-⑥), [V] to expand
5. Execute → Worker runs, diff rendered in terminal
6. Result card with scope compliance evidence
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
  approvalMode: "manual",
  scopeContract: {
    editableScope: ["src/foo.ts"],
    readOnlyEvidence: ["test/foo.test.ts"],
    successChecks: ["npm test"],
  },
  onApprovalRequired: async (directive) => {
    // show directive to user, return "approve" or "reject"
  },
  memoryStore: new SandboxStore(".kevix/memory.json"),
});

console.log(summary.scopeRespected);  // did Worker stay in bounds?
console.log(summary.filesChanged);    // what files were modified?
console.log(summary.scopeExpansionRequests); // boundary violations
```

---

## Current State (v0.1.0)

| Feature | Status |
|---------|--------|
| PEAN pipeline (Controller/Worker/Review) | ✅ |
| 6-layer gate chain | ✅ |
| Scope Contract + expansion callback | ✅ |
| Memory Sandbox (raw→working→wiki, TTL, purge) | ✅ |
| WikiSkill distillation (LLM, DeepSeek verified) | ✅ |
| Auto mode wiki routing | ✅ |
| Session compaction | ✅ |
| Multi-strategy edit matching (Aider-inspired) | ✅ |
| Structured error hierarchy (16 codes) | ✅ |
| Atomic writes with auto-backup | ✅ |
| 6 tools (bash/read/write/edit/grep/glob) | ✅ |
| TUI (Scope Proposal → DirectiveCard → diff) | ✅ |
| Human approval checkpoints | ✅ |
| **242 tests** | ✅ |

---

## Comparison

| | Kevix | Claude Code | Aider | Cline |
|---|---|---|---|---|
| Scope enforcement | Gate-level | Prompt-level | None | None |
| Human checkpoints | Scope + Directive | Inline ask | None | Inline ask |
| Experience memory | Wiki distillation | None | None | None |
| Gate chain | 6 layers | None | None | None |
| Multi-strategy edit | 3 strategies | LLM-powered | Fuzzy match | LLM-powered |

Kevix competes on **auditability**, not autonomy.

---

## Roadmap

- [ ] Process sandbox (Docker-level isolation)
- [ ] GUI (Electron/Tauri)
- [ ] VS Code extension
- [ ] Prompt tuning per language/framework
- [ ] Deeper Aider-style edit strategies
- [ ] Multi-file refactoring patterns in wiki

---

## Contribution

Areas where help is especially welcome:

- **Process sandbox**: Docker-level isolation for Worker bash commands
- **GUI / VS Code**: Desktop or IDE integration using the engine API
- **Prompt tuning**: Improve PEAN system prompts for specific languages
- **Diff maturity**: Port more Aider-style edit strategies

See `docs/architecture/kevix-harness-principles.md` for the full architecture document.

## License

MIT
