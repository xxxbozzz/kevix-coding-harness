# Contributing to Kevix

Kevix is a **human-first coding harness**, not a black-box AI coder. If you care about making AI-assisted coding more auditable, boundary-enforced, and human-controlled, you're in the right place.

This project is small (2 people), early (v0.1.0), and open (MIT). Your contribution doesn't need to be perfect — it needs to move the harness forward.

---

## Setup (5 minutes)

```bash
git clone https://github.com/xxxbozzz/kevix-coding-harness.git
cd kevix-coding-harness
npm install
npm run build
npm test                    # 242 tests must pass
export DEEPSEEK_API_KEY="sk-your-key-here"
```

Node.js >= 20 required. That's it.

---

## Architecture (the 30-second version)

Kevix wraps an LLM in a **5-layer harness**. Each layer is a checkpoint — the human confirms direction before AI executes.

```
L0  Intent Recognition     → Chat? Coding? Command?
L1  Scope Contract          → "Only edit these files. Read these for context. Verify with this command."
L2  PEAN Directive          → 6-section execution plan (full text → LLM; 6-point summary → human)
L3  Runtime Gate Chain      → 6 code-level gates. Every tool call passes through. LLM cannot bypass.
L4  Memory Sandbox + Wiki   → Every task outcome accumulated. Patterns drive future routing.
```

The unique bit is **L3** — 6 deterministic gate functions that return `allow | deny | ask`:

```
directive → red-flag → scope → bash-risk → verifier → probe-required
```

These are TypeScript functions, not prompt suggestions. An LLM cannot talk its way past `scope-gate.ts`.

### Key files to read first

| File | What it is |
|------|------------|
| `engine/src/loop/agent-loop.ts` | Main agent loop — Controller → Worker → Review pipeline (largest file) |
| `engine/src/gates/spec.md` | Gate system specification — all 6 gates documented |
| `engine/src/gates/scope-gate.ts` | Scope enforcement gate — the heart of the harness |
| `engine/src/pean/prompts.ts` | PEAN directive prompts — where cache hit rate lives or dies |
| `engine/src/memory/store.ts` | Memory Sandbox — raw → working → wiki pipeline |
| `engine/src/pean/mode-router.ts` | Auto A/B/C routing — wiki-driven, not rule-driven |
| `engine/docs/architecture/kevix-harness-principles.md` | Architecture freeze — what can and cannot change |

---

## Branches

| Branch | Purpose | Active? |
|--------|---------|---------|
| `main` | Engine core — gates, agent loop, PEAN, memory, wiki | ✅ |
| `tui` | Ink/React terminal UI shell — Composer, PhaseBar, StreamView | ✅ |
| `plugin` | Claude Code hook plugin — Controller + Review hooks | ✅ |

Work on engine features in `main`. Work on TUI in `tui`. Plugin changes go to `plugin`.

---

## How to contribute

### Pick an issue

All open work is tracked in [GitHub Issues](https://github.com/xxxbozzz/kevix-coding-harness/issues). Issues labeled `help wanted` are confirmed and ready for someone to pick up.

If an issue is unclear or missing detail, comment on it — that's useful feedback, not an interruption.

### Propose something new

Found something not covered by an existing issue? [Open one](https://github.com/xxxbozzz/kevix-coding-harness/issues/new). Describe:

1. What behavior you want to see
2. Why it matters (what problem it solves)
3. Which layer/module it touches

We'll discuss before code is written. No one likes writing a PR that doesn't land.

### Send a PR

1. Branch from `main` (or `tui` if it's a TUI change)
2. Write code. Match the surrounding style — strict TypeScript, no `any`, no implicit returns
3. Add tests. Every gate, tool, and memory operation has tests. Yours should too.
4. `npm test` must pass (242 tests and counting)
5. Push and open a PR
6. In the PR description, link the issue it closes

PRs are reviewed within a few days. If it's been longer, ping the thread.

---

## Code conventions

### TypeScript

- Strict mode everywhere (`strict: true` in tsconfig)
- ES2023 target, NodeNext module resolution
- No `any`. No implicit returns. No classes unless there's a reason.
- Functions over classes. Pure functions over stateful ones.

### Testing

- Framework: [Vitest](https://vitest.dev/)
- Pattern: every gate has `__tests__/<gate-name>.test.ts`
- Test the decision logic, not the implementation details
- Gate tests follow: valid input → `allow`, invalid input → `deny`, edge case → correct behavior

### Commits

No strict format. Just write in English, start with the area you're changing:

```
gate: fix scope-gate false positive on symlinked paths
memory: add dedup logic to wiki distiller
tui: wire Composer submit to engine scope proposal
```

---

## Design rules (immutable)

These were locked in the [architecture freeze](engine/docs/architecture/kevix-harness-principles.md) and won't change:

1. **"Only modify what" — positive scope.** Define what IS editable. Don't enumerate what NOT to touch. A positive boundary is tight. A defensive list always has holes.

2. **Seek the average stable solution.** Writing code is not training a model. Most tasks need the smallest correct change with the least side effects. Don't over-engineer for edge cases the evidence doesn't show.

3. **TUI and engine are separate.** TUI is a shell. Engine is the core. TUI changes must not regress engine metrics (pass@1, token cost, cache hit rate). If you're fixing a UI bug, don't touch `engine/src/gates/`.

---

## Communication

- **Issues**: Technical discussion on specific work items — use GitHub Issues
- **Discord**: Casual questions, design brainstorms, or just saying hi — [join here](https://discord.gg/GcNhAHPZu)

English or Chinese, both fine.

---

## License

MIT. Everything you contribute is under the same license.
