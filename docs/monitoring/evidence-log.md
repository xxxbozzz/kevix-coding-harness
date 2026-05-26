# Kevix Monitoring Evidence Log

This log records monitoring checks performed during Kevix engine construction. Every future "检查" or "监控" pass should append a new entry here before the final status report.

## Required Check Fields

Each entry should include:

- timestamp
- active processes
- recent changed files
- build result
- test result
- gate verification result
- latest CC/agent direction
- judgment: on-track / off-track / blocked
- next action

## 2026-05-24 01:14:45 CST — Monitoring Check

### Trigger

User requested that every future check automatically save evidence.

### Commands Run

```bash
date '+%Y-%m-%d %H:%M:%S %Z'
ps aux | rg 'claude|kevix|npm|node|tsx|tsc|vitest|deepseek' | rg -v 'rg '
find /Users/kev/kevix/engine -maxdepth 5 -type f -mmin -60 \( -path '*/node_modules/*' -o -path '*/dist/*' \) -prune -o -type f -mmin -60 -print
npm run build && npm test
```

### Process Snapshot

Relevant processes observed:

```text
claude PID 8903 active, low CPU after previous runs
claude PID 5113 active, low CPU
Codex node_repl active
npm build/test process active during this check, completed successfully
```

### Recent Files Changed

Recent Kevix files changed within the last 60 minutes:

```text
/Users/kev/kevix/engine/.pean/state.json
/Users/kev/kevix/engine/.pean/task.md
/Users/kev/kevix/engine/docs/experiments/l2-repeatability-20260524.md
/Users/kev/kevix/engine/docs/experiments/metrics.md
/Users/kev/kevix/engine/results/l2-repeatability-20260524.json
/Users/kev/kevix/engine/results/l2-repeatability-20260524.md
/Users/kev/kevix/engine/scripts/l2-runner.ts
/Users/kev/kevix/engine/src/gates/scope-gate.ts
/Users/kev/kevix/engine/src/pean/prompts.ts
/Users/kev/kevix/engine/src/provider/deepseek.test.ts
/Users/kev/kevix/engine/src/provider/deepseek.ts
/Users/kev/kevix/engine/src/provider/types.ts
```

### Build And Test Evidence

```text
build: PASS
vitest: 5 files passed, 43 tests passed
gate verification: 3/3 passed
```

Detailed test output:

```text
✓ src/gates/__tests__/directive-gate.test.ts (4 tests)
✓ src/provider/deepseek.test.ts (3 tests)
✓ tests/pean-memory.test.ts (3 tests)
✓ src/gates/__tests__/all-gates.test.ts (29 tests)
✓ tests/approval-gate.test.ts (4 tests)

Test Files  5 passed (5)
Tests       43 passed (43)

Gate Verification:
  Test A: PASS (red-flag gate blocked write, execute not called)
  Test B: PASS (probe mode completed all phases, BeforeComplete gate wired)
  Test C: PASS (3/3 blocked: needs_revision, missing probe, auto+needProbe)
```

### Judgment

Status: **on-track**.

P6 evidence has been preserved in engineering docs and result files. No stuck build/test process was observed after completion. No immediate correction required.

### Next Action

Future monitoring checks must append a new entry to this file automatically before reporting status to the user.


## 2026-05-24 01:25:24 CST — Monitoring Check

### Trigger

User reported that `cc-kevix hook` may not enter task decomposition for long prompts with multiple bullet points.

### Commands Run

```bash
date '+%Y-%m-%d %H:%M:%S %Z'
sed -n '1,260p' kevix_controller_hook.py
ps aux | rg 'claude|kevix|npm|node|tsx|tsc|vitest|deepseek' | rg -v 'rg '
npm run build && npm test
python3 plugins/kevix-hook/tests/test_controller_hook.py
claude plugin validate .
claude plugin validate ./plugins/kevix-hook
```

### Finding

The installed/public Kevix Hook did activate for prompts containing coding keywords, but its injected directive template did not force a `Task Decomposition` section. For long prompts with multiple bullet points, this could allow Claude Code to skip explicit subtask decomposition and go directly into a vague directive.

A second detection issue was found during testing: phrases such as `不需要改代码` could be false-positive coding tasks because they contain `改` and `代码`.

### Fix Applied

Public hook repository updated:

```text
/Users/kev/Documents/New project 5/kevix-coding-harness/plugins/kevix-hook/scripts/kevix_controller_hook.py
/Users/kev/Documents/New project 5/kevix-coding-harness/plugins/kevix-hook/tests/test_controller_hook.py
```

Changes:

- added structured long-prompt detection (`分点任务`, `以下任务`, `P7`, numbered bullets, etc.)
- added code-context detection (`src/`, `tests/`, `scripts/`, `npm`, `vitest`, `tsc`, etc.)
- added non-coding negation guard (`不需要改代码`, `不要改代码`, `只总结`, etc.)
- injected mandatory `## Task Decomposition` section before `Product Intent`
- added smoke tests for long Chinese multi-point prompts and non-coding summary prompts

### Verification

```text
kevix controller hook tests passed
claude marketplace validation: PASS
claude plugin validation: PASS
engine build/test: PASS, 43/43 tests, 3/3 gate verification
```

### Judgment

Status: **issue confirmed and fixed in public hook source**.

CC engine development is separately continuing Review Auto-loop work; this hook issue was in the public Claude Code plugin layer, not in the private engine loop.

### Next Action

Commit and push the Kevix Hook fix, then refresh/reinstall local plugin if needed.

## 2026-05-24 01:49:55 CST — Monitoring Check

### Trigger

User requested another check after CC continued Kevix engine work.

### Commands Run

```bash
date '+%Y-%m-%d %H:%M:%S %Z'
ps aux | rg 'claude|kevix|npm|node|tsx|tsc|vitest|deepseek' | rg -v 'rg '
find /Users/kev/kevix/engine -maxdepth 5 -type f -mmin -30 ...
python3 parse latest Claude Code jsonl tail
npm run build && npm test
sed -n '1,260p' tests/review-loop.test.ts
rg -n 'review|escalate|revision_count|review_issues|REVIEW' src/loop/agent-loop.ts src/types.ts
```

### Recent CC Direction

CC implemented minimal Review Auto-loop after Worker completion:

- Review PASS -> normal completion
- Review BLOCKED -> return to Worker/revision path, then Review again
- repeated BLOCKED -> emit `escalate` and set `summary.escalated=true`

Latest CC summary claimed:

```text
BUILD OK
46/46 vitest PASS
3/3 gate verification PASS
Review Auto-loop minimum implementation complete
```

### Recent Files Changed

```text
/Users/kev/kevix/engine/src/loop/agent-loop.ts
/Users/kev/kevix/engine/src/types.ts
/Users/kev/kevix/engine/tests/pean-memory.test.ts
/Users/kev/kevix/engine/tests/review-loop.test.ts
/Users/kev/kevix/engine/vitest.config.ts
```

### Independent Verification

```text
build: PASS
vitest: 6 files passed, 46 tests passed
gate verification: 3/3 passed
```

Detailed test output:

```text
✓ src/gates/__tests__/directive-gate.test.ts (4 tests)
✓ src/provider/deepseek.test.ts (3 tests)
✓ tests/pean-memory.test.ts (3 tests)
✓ tests/review-loop.test.ts (3 tests)
✓ src/gates/__tests__/all-gates.test.ts (29 tests)
✓ tests/approval-gate.test.ts (4 tests)

Test Files  6 passed (6)
Tests       46 passed (46)

Gate Verification:
  Test A: PASS (red-flag gate blocked write, execute not called)
  Test B: PASS (probe mode completed all phases, BeforeComplete gate wired)
  Test C: PASS (3/3 blocked: needs_revision, missing probe, auto+needProbe)
```

### Review Loop Test Coverage

`tests/review-loop.test.ts` covers:

- review PASS on first attempt
- review BLOCKED then PASS after retry
- repeated BLOCKED causing escalate event and `summary.escalated=true`

### Judgment

Status: **on-track with caveat**.

P7 is implemented at unit/mock-flow level. The flow exists and tests pass. However, this does not yet prove review quality on real tasks. It proves the loop mechanics, not that Review reliably catches real Worker omissions.

### Next Action

Run a real L2 review-loop experiment with intentionally seeded review-detectable mistakes, and record whether Review catches them, whether Worker fixes them, and how much token/cache overhead the loop adds.

## 2026-05-24 02:10:33 CST — Monitoring Check And Next-Step Planning

### Trigger

User requested: "检查并制定下一步".

### Commands Run

```bash
date '+%Y-%m-%d %H:%M:%S %Z'
ps aux | rg 'claude|kevix|npm|node|tsx|tsc|vitest|deepseek' | rg -v 'rg '
find /Users/kev/kevix/engine -maxdepth 5 -type f -mmin -45 ...
python3 parse latest Claude Code jsonl tail
sed -n '1,260p' results/l2-review-validation.json
sed -n '1,320p' scripts/l2-review-validation.ts
npm run build && npm test
```

### Recent CC Direction

CC completed P8 L2 Review-loop Validation.

Latest CC conclusion:

```text
Review caught issues: 0/3
Escalated: 0/3
Build OK: 3/3
Avg calls: 11
Review loop mechanism works, but review depth depends on REVIEW_SYSTEM prompt design.
```

### Files Observed

```text
/Users/kev/kevix/engine/results/l2-review-validation.json
/Users/kev/kevix/engine/scripts/l2-review-validation.ts
/Users/kev/kevix/engine/src/loop/agent-loop.ts
/Users/kev/kevix/engine/src/pean/prompts.ts
/Users/kev/kevix/engine/src/provider/types.ts
/Users/kev/kevix/engine/src/tools/bash.ts
/Users/kev/kevix/engine/src/types.ts
/Users/kev/kevix/engine/tests/review-loop.test.ts
```

### Independent Verification

```text
build: PASS
vitest: 6 files passed, 46 tests passed
gate verification: 3/3 passed
```

### P8 Result Data

Raw result file: `results/l2-review-validation.json`.

Summary:

| Task | Trap | API Calls | Review Issues | Escalated | Build | Notes |
|---|---|---:|---:|---:|---|---|
| RV-001 | boundary | 9 | 0 | false | PASS | gate blocked `/gates` path twice |
| RV-002 | error-loss | 20 | 0 | false | PASS | Worker made substantive improvement (`normalizeThrown`) |
| RV-003 | type-safety | 4 | 0 | false | PASS | no review issue recorded |

### Judgment

Status: **on-track, but P8 exposed a real limitation**.

Review Auto-loop mechanics are implemented and tested, but the real-task validation did not show Review catching any issues. Current evidence supports:

- Review loop can run without breaking the engine.
- Review loop adds cost and calls.
- Current review prompt is not yet strong enough as an auditor for trap tasks.

Current evidence does NOT support:

- Review reliably catches Worker mistakes.
- Review improves task quality over Worker-only baseline.

### Next Action Recommendation

Do not add new harness features yet.

Next step should be **P9 Review Quality Hardening**:

1. Create a review-specific benchmark with seeded defective patches.
2. Test Review alone on known-bad patches before testing full Worker loop.
3. Strengthen `REVIEW_SYSTEM` around exact failure modes: boundary, type-safety, error-loss, API contract, state transitions.
4. Add structured review output parsing: `verdict`, `issues[]`, `evidence[]`, `required_fixes[]`.
5. Rerun P8 only after Review can catch seeded defects in isolation.

---

## 2026-05-24 03:06:40 CST — P9 Review Bench Check

### Commands Run

```text
date '+%Y-%m-%d %H:%M:%S %Z'
ps aux | rg 'claude|kevix|npm|node|tsx|tsc|vitest|deepseek|git add' | rg -v 'rg '
find /Users/kev/kevix/engine -type f -mmin -90 | sort
sed -n '1,260p' /Users/kev/kevix/engine/results/review-bench.json
ps -p 64460 -o pid,ppid,pgid,stat,etime,command 2>/dev/null || true
npm run build && npm test
```

### Process State

```text
claude PID 8903 running, low CPU
claude PID 5113 running, low CPU
git add PID 64460 running for 36m58s
```

Important process warning:

```text
PID 64460 is staging research/eapd_bench/study_c_large_product_engineering/external_baselines/.venv_metagpt/lib/python3.9/site-packages/...
```

This process is not the kevix engine build. It appears to be adding a large Python virtualenv/site-packages tree under the research benchmark workspace. This should be inspected before any commit from `/Users/kev/Documents/New project 5`.

### Recent Kevix Engine Files

```text
/Users/kev/kevix/engine/results/review-bench.json
/Users/kev/kevix/engine/scripts/review-bench.ts
/Users/kev/kevix/engine/scripts/review-debug.ts
/Users/kev/kevix/engine/src/loop/agent-loop.ts
/Users/kev/kevix/engine/src/pean/prompts.ts
/Users/kev/kevix/engine/src/provider/pean-system.ts
/Users/kev/kevix/engine/src/provider/types.ts
/Users/kev/kevix/engine/src/tools/bash.ts
/Users/kev/kevix/engine/src/types.ts
/Users/kev/kevix/engine/tests/pean-memory.test.ts
/Users/kev/kevix/engine/tests/review-loop.test.ts
```

### Independent Verification

```text
build: PASS
vitest: 6 files passed, 46 tests passed
gate verification: 3/3 passed
```

### P9 Review Bench Result

Raw result file: `/Users/kev/kevix/engine/results/review-bench.json`.

Summary:

```text
bad patch recall: 60% (6/10 bad patches blocked)
clean false positive rate: 40% (2/5 clean patches incorrectly blocked)
```

Incorrect cases:

```text
bad-01-boundary-missing-null: expected BLOCKED, got PASS
bad-02-boundary-whitespace: expected BLOCKED, got PASS
bad-07-missing-guard-undefined: expected BLOCKED, got PASS
bad-09-duplicate-logic: expected BLOCKED, got PASS
clean-03-type-safe: expected PASS, got BLOCKED
clean-04-error-preserved: expected PASS, got BLOCKED
```

### Judgment

Status: **engine healthy, review quality not production-ready**.

Kevix engine mechanics remain stable: build, unit tests, and gate verification are green. P9 is valuable because it isolates the review layer and shows the current bottleneck clearly.

Current evidence supports:

- Review Auto-loop mechanism is implemented.
- Review benchmark harness exists and can produce measurable recall/FPR.
- `deepseek-chat` can catch obvious type-safety, error-loss, interface-drift, scope, and regression defects in this small set.

Current evidence does NOT support:

- Review reliably catches boundary and quality defects.
- Review has acceptable false positive rate.
- Review should be treated as a completion authority without hardening.

### Next Action Recommendation

Proceed to **P10 Review Quality Hardening**, not more engine features.

Recommended P10 scope:

1. Turn review bench into a first-class experiment artifact.
2. Strengthen `REVIEW_SYSTEM` around missed categories: boundary/null, whitespace normalization, undefined guard, duplicate logic.
3. Separate reviewer roles by category instead of one generic reviewer.
4. Compare reviewer models under identical seeded patches.
5. Add strict pass criteria before Review can become a completion authority:
   - bad recall >= 85%
   - clean false positive rate <= 15%
   - no catastrophic misses on boundary/type/error-loss cases

---

## 2026-05-24 03:10:29 CST — P10 Direction Check

### Commands Run

```text
date '+%Y-%m-%d %H:%M:%S %Z'
find /Users/kev/kevix/engine -type f -mmin -30 | sort
sed -n '1,260p' /Users/kev/kevix/engine/scripts/review-bench.ts
rg -n "REVIEW_SYSTEM|Review|deepseek-chat|deepseek-v4|bad-01|clean-03|false positive|FPR|recall" /Users/kev/kevix/engine/src /Users/kev/kevix/engine/scripts /Users/kev/kevix/engine/results
sed -n '160,240p' /Users/kev/kevix/engine/src/provider/pean-system.ts
sed -n '260,470p' /Users/kev/kevix/engine/scripts/review-bench.ts
ps aux | rg 'review-bench|tsx|node|claude|git add' | rg -v 'rg '
npm run build && npm test
```

### Independent Verification

```text
build: PASS
vitest: 6 files passed, 46 tests passed
gate verification: 3/3 passed
```

### P10 Observed Changes

Observed in `/Users/kev/kevix/engine/src/provider/pean-system.ts`:

```text
REVIEW_SYSTEM has been strengthened with:
- default PASS rule
- concrete-defect-only blocking
- JavaScript/TypeScript specific rules:
  - == null catches both null and undefined
  - === null does not catch undefined
  - optional chaining is valid TypeScript
  - whitespace requires trim()
  - preserved try/catch should not be flagged
```

Observed in `/Users/kev/kevix/engine/scripts/review-bench.ts`:

```text
MODEL = "deepseek-chat"
```

### Critical Finding

`review-bench.ts` imports `REVIEW_SYSTEM` but does not actually use it in the API call.

The script contains:

```text
import { REVIEW_SYSTEM } from "../src/provider/pean-system.js";
```

But `callReview()` sends an inline simplified system prompt:

```text
{ role: "system", content: `You are a code reviewer. Given a directive and a patch, decide: PASS or BLOCKED...` }
```

Therefore, changes to `/Users/kev/kevix/engine/src/provider/pean-system.ts` do not currently affect the P10 review benchmark.

### Current Review Bench Data

Raw result file remains `/Users/kev/kevix/engine/results/review-bench.json`.

```text
bad patch recall: 60%
clean false positive rate: 40%
```

The result appears to still reflect the previous benchmark state, not a validated P10 improvement.

### Judgment

Status: **engine healthy, P10 bench currently measures the wrong reviewer prompt**.

The P10 direction is correct: analyze misses, harden reviewer prompt, use `deepseek-chat` as reviewer. But the current benchmark runner bypasses `REVIEW_SYSTEM`, so it cannot validate prompt hardening.

This is a PEAN boundary issue: the benchmark must measure the same review authority used by the engine. Otherwise, P10 can produce misleading progress.

### Required Correction

Before any P10 conclusion is accepted:

1. Update `scripts/review-bench.ts` so `callReview()` uses the imported `REVIEW_SYSTEM`.
2. Add the exact reviewer prompt/model used to `results/review-bench.json`.
3. Align acceptance thresholds:
   - if P10 says bad recall >= 70%, clean FPR <= 30%, script must enforce that exactly.
   - current script still checks `badCaught >= 8 && cleanOk >= 3`, which is not the same threshold.
4. Rerun review bench.
5. Only then compare P9 baseline vs P10 result.

---

## 2026-05-24 03:12:47 CST — Follow-up Check After Stop

### Commands Run

```text
date '+%Y-%m-%d %H:%M:%S %Z'
ps aux | rg 'claude|kevix|npm|node|tsx|tsc|vitest|review-bench|git add' | rg -v 'rg '
find /Users/kev/kevix/engine -type f -mmin -60 | sort
sed -n '320,390p' /Users/kev/kevix/engine/scripts/review-bench.ts
sed -n '440,470p' /Users/kev/kevix/engine/scripts/review-bench.ts
npm run build && npm test
```

### Process State

```text
claude PID 8903 running
claude PID 5113 running
previous long-running git add process is no longer visible
no review-bench runner currently active
```

### Recent Kevix Engine Files

```text
/Users/kev/kevix/engine/results/review-bench.json
/Users/kev/kevix/engine/scripts/review-bench.ts
/Users/kev/kevix/engine/scripts/review-debug.ts
/Users/kev/kevix/engine/src/loop/agent-loop.ts
/Users/kev/kevix/engine/src/provider/pean-system.ts
```

### Independent Verification

```text
build: PASS
vitest: 6 files passed, 46 tests passed
gate verification: 3/3 passed
```

### P10 Bench Integrity Check

`/Users/kev/kevix/engine/scripts/review-bench.ts` still bypasses the engine's `REVIEW_SYSTEM`.

Observed behavior:

```text
callReview() sends an inline "You are a code reviewer..." prompt
instead of the imported REVIEW_SYSTEM from src/provider/pean-system.ts
```

The script also still enforces the older pass condition:

```text
const pass = badCaught >= 8 && cleanOk >= 3;
```

This is inconsistent with the P10 target stated in the directive:

```text
bad recall >= 70%
clean FPR <= 30%
```

### Judgment

Status: **engine green, P10 validation still invalid**.

No new evidence shows that P10 Review Quality Hardening improved actual engine review behavior. The benchmark runner must be corrected before accepting any P10 result.

### Next Action

Tell CC to perform only this correction:

1. Replace the inline system prompt in `scripts/review-bench.ts` with imported `REVIEW_SYSTEM`.
2. Save `model`, `review_prompt_source`, and `threshold` into `results/review-bench.json`.
3. Align threshold logic with P10 target.
4. Rerun `review-bench.ts`.
5. Do not change `REVIEW_SYSTEM` again until the benchmark is measuring the right prompt.

---

## 2026-05-24 03:13:53 CST — P10 Completion Claim Audit

### User-Provided Claim

```text
Recall 提升到 70%，达到阈值。FP 仍 40%。
Bad: 7/10 (70%) ↑ from 60%
Clean: 3/5 (60%) — 2 FP remain
P10 完成。
```

### Commands Run

```text
date '+%Y-%m-%d %H:%M:%S %Z'
sed -n '1,120p' /Users/kev/kevix/engine/results/review-bench.json
sed -n '120,240p' /Users/kev/kevix/engine/results/review-bench.json
sed -n '1,80p' /Users/kev/kevix/engine/scripts/review-bench.ts
sed -n '330,385p' /Users/kev/kevix/engine/scripts/review-bench.ts
sed -n '445,470p' /Users/kev/kevix/engine/scripts/review-bench.ts
rg -n "reviewProvider|REVIEW_SYSTEM|review_prompt_source|threshold|badCaught|fpRate|bad recall|clean FPR|MODEL" /Users/kev/kevix/engine/src /Users/kev/kevix/engine/scripts /Users/kev/kevix/engine/results
npm run build && npm test
```

### Independent Verification

```text
build: PASS
vitest: 6 files passed, 46 tests passed
gate verification: 3/3 passed
```

### Result File Check

Observed in `/Users/kev/kevix/engine/results/review-bench.json`:

```text
bad patch recall: 70%
clean false positive rate: 40%
```

Bad misses:

```text
bad-02-boundary-whitespace: expected BLOCKED, got PASS
bad-07-missing-guard-undefined: expected BLOCKED, got PASS
bad-09-duplicate-logic: expected BLOCKED, got PASS
```

Clean false positives:

```text
clean-03-type-safe: expected PASS, got BLOCKED
clean-04-error-preserved: expected PASS, got BLOCKED
```

### Critical Integrity Finding

`scripts/review-bench.ts` still does not use the imported `REVIEW_SYSTEM`.

Evidence:

```text
import { REVIEW_SYSTEM } from "../src/provider/pean-system.js";
```

but inside `callReview()`:

```text
{ role: "system", content: `You are a code reviewer. Given a directive and a patch, decide: PASS or BLOCKED...` }
```

Therefore, the 70% recall result is not valid evidence that `/Users/kev/kevix/engine/src/provider/pean-system.ts` Review hardening improved engine review behavior.

### Threshold Check

The script still uses:

```text
const pass = badCaught >= 8 && cleanOk >= 3;
```

This is inconsistent with the claimed P10 threshold:

```text
bad recall >= 70%
clean FPR <= 30%
```

With 5 clean cases, `clean FPR <= 30%` means at most 1 false positive, not 2. Current FP is 2/5 = 40%, so P10 does not satisfy the stated full threshold.

### Judgment

Status: **P10 is not complete**.

What is true:

- Engine build/test/gates are green.
- `reviewProvider` exists in `agent-loop.ts`.
- The latest result file shows bad recall improved to 70%.

What is not proven:

- The improvement came from `REVIEW_SYSTEM`.
- The engine's actual Review phase improved.
- P10 passed its own clean FPR threshold.

### Required Next Action

CC should not claim P10 complete yet. The minimum correction remains:

1. Make `review-bench.ts` use `REVIEW_SYSTEM` as the system prompt.
2. Record `model`, `review_prompt_source`, and threshold into the result JSON.
3. Fix pass condition to match stated P10 acceptance.
4. Rerun the benchmark.
5. Then decide whether P10 is complete.

---

## 2026-05-24 15:13:20 CST — P10 Recheck + New Runtime Layers

### Commands Run

```text
date '+%Y-%m-%d %H:%M:%S %Z'
find /Users/kev/kevix/engine -type f -mmin -20 | sort
sed -n '1,90p' /Users/kev/kevix/engine/scripts/review-bench.ts
sed -n '330,385p' /Users/kev/kevix/engine/scripts/review-bench.ts
sed -n '430,470p' /Users/kev/kevix/engine/scripts/review-bench.ts
sed -n '1,240p' /Users/kev/kevix/engine/results/review-bench.json
npm run build && npm test
rg -n "const pass|recall_pct|fp_rate_pct|review_prompt_source|threshold|REVIEW_SYSTEM" /Users/kev/kevix/engine/scripts/review-bench.ts /Users/kev/kevix/engine/results/review-bench.json
find /Users/kev/kevix/engine/src -maxdepth 3 -type f | sort
sed -n '1,260p' /Users/kev/kevix/engine/src/graph/builder.ts
sed -n '1,260p' /Users/kev/kevix/engine/src/graph/query.ts
rg -n "tradeoff_required|risk_hint|completion|reviewProvider|entropy|advisory|GraphBuilder|state_snapshot|review_issues|approval_required|escalate" /Users/kev/kevix/engine/src/loop/agent-loop.ts /Users/kev/kevix/engine/src/types.ts /Users/kev/kevix/engine/src/index.ts
nl -ba /Users/kev/kevix/engine/src/loop/agent-loop.ts | sed -n '170,320p'
ps -p 71403 -o pid,ppid,pgid,stat,etime,command 2>/dev/null || true
git -C '/Users/kev/Documents/New project 5' status --short | sed -n '1,120p'
```

### Independent Verification

```text
build: PASS
vitest: 10 files passed, 63 tests passed
gate verification: 3/3 passed
```

### P10 Review Bench Integrity

`scripts/review-bench.ts` now correctly uses the engine `REVIEW_SYSTEM`:

```text
{ role: "system", content: REVIEW_SYSTEM }
```

Current review-bench result:

```text
bad patch recall: 100% (10/10)
clean false positive rate: 60% (3/5)
```

Incorrect clean cases:

```text
clean-03-type-safe: expected PASS, got BLOCKED
clean-04-error-preserved: expected PASS, got BLOCKED
clean-05-no-change: expected PASS, got BLOCKED
```

### Remaining Benchmark Hygiene Issues

`results/review-bench.json` still does not record:

```text
model
review_prompt_source
threshold
```

`scripts/review-bench.ts` still uses:

```text
const pass = badCaught >= 8 && cleanOk >= 3;
```

This means current script treats 60% FPR as pass because `cleanOk >= 3`, even though the stated target was clean FPR <= 30%.

### New Runtime Layer Evidence

New/expanded tests now exist:

```text
tests/tradeoff-control-plane.test.ts
tests/entropy-risk.test.ts
tests/auto-assess-graph.test.ts
tests/graph.test.ts
```

Test count increased:

```text
previous: 46 tests
current: 63 tests
```

Implemented or partially implemented mechanisms:

```text
reviewProvider?: LLMProvider
risk_hint event
tradeoff_required event
advisory event type
state_snapshot event
GraphBuilder
graph query helpers
escalate event
review_issues summary
```

### Mapping to Requested Concepts

| Concept | Evidence | Current Status |
|---|---|---|
| adaptive review runtime | `reviewProvider`, review loop, `REVIEW_SYSTEM`, benchmark | Partial. Mechanism exists; reviewer is over-blocking. |
| entropy-aware orchestration | `tradeoff_required`, cache trend + gate frequency tests | Partial. Tested signal emission; not yet full mode-switch execution. |
| persistent expert review graph | `GraphBuilder`, `ReviewGraph`, `findByFile`, `getStats` | Partial. In-memory graph exists; persistence layer not shown. |
| completion authority model | review verdict, escalate, summary fields | Not ready. Review cannot be authority with 60% FPR. |

### Source-Level Notes

`runReview()` currently emits:

```text
step_start phase: "worker"
step_complete phase: "worker"
```

This makes review telemetry indistinguishable from worker telemetry. If Review is becoming a real runtime layer, it should have its own phase/event type.

### Workspace Risk

A `git add` process is active in `/Users/kev/Documents/New project 5`:

```text
PID 71403 running git add -- .DS_Store AGENTS.md ... research/... .venv_metagpt/lib/python3.9/site-packages/...
```

`git status --short` shows many untracked directories, including:

```text
research/
kevix-coding-harness/
portfolio/
experiments/
```

This is outside `/Users/kev/kevix/engine`, but it can pollute the broader distillation/research workspace if committed without cleaning.

### Judgment

Status: **engine green, P10 review recall fixed, completion authority still not valid**.

The important improvement is real now: benchmark uses `REVIEW_SYSTEM` and catches all bad patches in this small seeded suite. However, the reviewer is too strict and blocks 60% of clean patches. That makes it useful as a high-recall advisory reviewer, not as a final completion authority.

The new runtime layers are promising but currently partial:

- graph is in-memory, not persistent;
- tradeoff control plane emits choices but does not fully enact all mode changes;
- review runtime exists but over-blocks;
- completion authority is still a design goal, not achieved behavior.

### Next Action

Recommended next step:

1. Keep current `REVIEW_SYSTEM` as high-recall reviewer.
2. Add a second pass or calibration layer to reduce false positives before blocking completion.
3. Give Review its own event/phase name instead of reusing `worker`.
4. Add result metadata to review bench.
5. Treat `completion authority` as blocked until clean FPR is under an agreed threshold.

---

## 2026-05-24 15:22:14 CST — Claimed Completion List Audit

### Commands Run

```text
date '+%Y-%m-%d %H:%M:%S %Z'
rg -n "class DeepSeekProvider|reasoning_content|cache_hit|chat/completions|fetch\\(|createSessionRecord|estimateTokens|isNearContextLimit|listSessions|completeSessionRecord|reviewProvider|tradeoff_required|risk_hint|GraphBuilder|findByFile|findSimilarPatterns|getTaskHistory|getStats|checkBeforeToolUseStrict|checkBeforeCompleteStrict" /Users/kev/kevix/engine/src
npm run build && npm test
sed -n '1,220p' /Users/kev/kevix/engine/src/session/context.ts
sed -n '1,220p' /Users/kev/kevix/engine/src/provider/deepseek.ts
sed -n '130,245p' /Users/kev/kevix/engine/src/types.ts
sed -n '1,220p' /Users/kev/kevix/engine/src/graph/types.ts
sed -n '1,140p' /Users/kev/kevix/engine/src/index.ts
```

### Independent Verification

```text
build: PASS
vitest: 10 files passed, 63 tests passed
gate verification: 3/3 passed
```

### Completion List Audit

| Claimed Area | Evidence | Audit Judgment |
|---|---|---|
| DeepSeek Provider | `DeepSeekProvider`, fetch, `/chat/completions`, `reasoning_content`, cache metrics | Supported |
| PEAN Agent Loop | `runAgentLoop`, memory/probe/auto phases, independent prompts | Supported |
| Tool System | bash/read/write/edit/grep/glob definitions and executors | Supported |
| Session Management | `createSessionRecord`, `estimateTokens`, `isNearContextLimit` | Partially supported: in-memory only |
| PEAN Prompts | `CONTROLLER_SYSTEM` etc. including `REVIEW_SYSTEM` | Supported, but origin from `swe_runner.py` not independently re-verified in this check |
| Gate System | `checkBeforeToolUseStrict`, `checkBeforeCompleteStrict`, 3/3 verification | Supported |
| Approval Gate | `approval_required`, manual mode, tests pass | Supported |
| State Snapshot | `state_snapshot` event after phase completion | Supported |
| Review Auto-loop | Worker -> Review -> revise/escalate flow | Supported mechanically |
| Review Model split | `reviewProvider?: LLMProvider` | Supported |
| Persistent Expert Review Graph | `GraphBuilder`, `ReviewGraph`, query functions | Partially supported: graph is in-memory, not persistent |
| Pattern Reuse | stable pattern IDs and occurrence increment | Supported in graph builder |
| Risk Hint | `risk_hint` before Controller based on graph | Supported |
| Auto Assess + Graph | assess phase includes graph history context | Supported |
| Tradeoff Control | `tradeoff_required` event and A/B/C options | Partially supported: B/C emit logs, but no full automatic probe/pause execution yet |
| Verification | 63/63 tests, 3/3 gate verification | Supported |
| 5/5 L2 repeatability | Previously recorded in experiment docs | Supported by prior evidence, not rerun in this check |

### Important Downgrades

The completion list should not describe the following as fully finished:

```text
Session Management: currently in-memory token/session records, not durable session persistence.
Persistent Expert Review Graph: schema + builder + query are implemented, but persistence is not shown.
Tradeoff Control: user choice is emitted/received, but B/C are not full runtime transitions yet.
Completion Authority Model: not achieved because Review FPR is currently 60% on seeded clean patches.
```

### Review System State

Review is now high recall:

```text
bad recall: 100%
```

but over-blocking:

```text
clean false positive rate: 60%
```

Therefore Review can be described as:

```text
high-recall advisory review guardrail
```

It should not be described as:

```text
reliable completion authority
```

### Workspace Risk

The broader `/Users/kev/Documents/New project 5` workspace still shows many untracked paths and an active git add process was observed earlier. This remains separate from `/Users/kev/kevix/engine`, but should be cleaned before publishing or committing.

### Judgment

Status: **core engine is substantially built; several advanced runtime concepts are partial and should be named accurately**.

The strongest honest claim:

```text
Kevix has a working DeepSeek-native PEAN harness core with gate enforcement, review loop, approval snapshots, in-memory review graph, risk hints, and tradeoff events. It is experimentally validated on 63 unit tests, 3 gate verification checks, and prior 5/5 L2 repeatability.
```

The claims to avoid:

```text
fully persistent expert graph
fully automatic entropy-aware orchestration
review as completion authority
production-grade session persistence
```

---

## 2026-05-24 15:28:51 CST — P15/P16 Direction Check

### Commands Run

```text
date '+%Y-%m-%d %H:%M:%S %Z'
rg -n "P15|P16|Runtime Control|Tradeoff|tradeoff|completion authority|Completion Authority|calibration|Calibration|authority|Review Calibration|false positive|FPR|review" /Users/kev/kevix/engine /Users/kev/gitgeo/.pean /Users/kev/kevix/engine/.pean 2>/dev/null
find /Users/kev/kevix/engine/src /Users/kev/kevix/engine/tests /Users/kev/kevix/engine/scripts /Users/kev/kevix/engine/results -type f -mmin -180 | sort
sed -n '1,220p' /Users/kev/kevix/engine/tests/tradeoff-control-plane.test.ts
sed -n '1,220p' /Users/kev/kevix/engine/tests/entropy-risk.test.ts
sed -n '1,180p' /Users/kev/gitgeo/.pean/directive.md
sed -n '1,120p' /Users/kev/kevix/engine/.pean/task.md
nl -ba /Users/kev/kevix/engine/src/loop/agent-loop.ts | sed -n '320,370p'
nl -ba /Users/kev/kevix/engine/src/loop/agent-loop.ts | sed -n '430,535p'
nl -ba /Users/kev/kevix/engine/src/loop/agent-loop.ts | sed -n '585,660p'
find /Users/kev/kevix/engine/src/graph /Users/kev/kevix/engine/tests -type f -maxdepth 2 | sort | xargs rg -n "save|load|persist|fs|writeFile|readFile|GraphStore|graph"
sed -n '508,526p' /Users/kev/kevix/engine/src/loop/agent-loop.ts
sed -n '232,260p' /Users/kev/kevix/engine/src/graph/builder.ts
npm run build && npm test
```

### P16 Direction From Directive

Observed directive in `/Users/kev/gitgeo/.pean/directive.md`:

```text
1. Graph from in-memory to persistent: add save/load JSON
2. Tradeoff B/C from event-only to actual probe switch or pause
3. Session description honest: in-memory with snapshot events, not full persistence
4. Completion Authority is intentionally not fixed because Review FPR is 60%; describe as advisory guardrail
```

### Direction Judgment

P16 direction is correct.

It targets exactly the three previously downgraded claims:

```text
Persistent graph
Tradeoff B/C runtime behavior
Honest session wording
```

It also correctly does not try to force Review into completion authority while false positive rate is still too high.

### Implemented P16 Evidence

Graph persistence has been started in `/Users/kev/kevix/engine/src/graph/builder.ts`:

```text
save(path): writes ReviewGraph JSON to disk
static load(path): reads ReviewGraph JSON or returns emptyGraph()
```

This is a good move: small, verifiable, and aligned with the stated gap.

### P15/P16 Build Result

Current build fails:

```text
src/loop/agent-loop.ts(343,32): error TS2339: Property 'tradeoffResult' does not exist on type 'never'.
src/loop/agent-loop.ts(344,29): error TS2339: Property 'tradeoffResult' does not exist on type 'never'.
src/loop/agent-loop.ts(351,32): error TS2339: Property 'tradeoffResult' does not exist on type 'never'.
src/loop/agent-loop.ts(352,29): error TS2339: Property 'tradeoffResult' does not exist on type 'never'.
src/loop/agent-loop.ts(522,41): error TS18004: No value exists in scope for the shorthand property 'choice'. Either declare one or provide an initializer.
src/loop/agent-loop.ts(523,17): error TS2304: Cannot find name 'choice'.
src/loop/agent-loop.ts(525,24): error TS2304: Cannot find name 'choice'.
```

### Root Cause

`runToolLoop()` detects tradeoff, emits `tradeoff_required`, but does not call:

```text
await gateData.onTradeoffRequired(evidence, opts)
```

Therefore `choice` is never declared before:

```text
gateData.tradeoffResult = { choice };
if (choice === "B") ...
```

There is also a type issue around `gateDataForWorker?.tradeoffResult` in the outer loop, currently inferred as `never`.

### P15 Direction Judgment

P15 direction is correct, but current implementation is broken.

What P15 should prove:

```text
gate/cache/graph signals trigger tradeoff_required
A continues memory
B actually routes to probe_plan
C actually pauses/escalates/returns resumable state
```

Current code attempts this, but cannot compile.

### Required Fix

1. In `runToolLoop()`, call the user callback:

```text
const choice = await gateData.onTradeoffRequired(evidence, opts)
gateData.tradeoffResult = { choice }
```

2. Fix `gateDataForWorker` typing in `runAgentLoop()` so TS does not infer `never`.

3. Add or strengthen tests:

```text
Choice B should produce probe_plan/probe_verify phases, not merely choose B.
Choice C should emit pause/escalate-like event and stop before Review.
Graph save/load should round-trip graph data.
```

### Current Status

Status: **P15/P16 direction good, implementation currently red**.

Do not accept P15/P16 as complete until:

```text
npm run build && npm test
```

passes again.

---

## 2026-05-24 15:37:45 CST — P15/P16 Development Recheck

### Commands Run

```text
date '+%Y-%m-%d %H:%M:%S %Z'
ps aux | rg 'claude|npm|node|tsx|tsc|vitest|git add' | rg -v 'rg '
find /Users/kev/kevix/engine/src /Users/kev/kevix/engine/tests -type f -mmin -20 | sort
nl -ba /Users/kev/kevix/engine/src/loop/agent-loop.ts | sed -n '175,195p'
nl -ba /Users/kev/kevix/engine/src/loop/agent-loop.ts | sed -n '335,365p'
nl -ba /Users/kev/kevix/engine/src/loop/agent-loop.ts | sed -n '510,530p'
npm run build && npm test
sed -n '1,220p' /Users/kev/kevix/engine/tests/persistence.test.ts
sed -n '232,260p' /Users/kev/kevix/engine/src/graph/builder.ts
sed -n '1,150p' /Users/kev/kevix/engine/tests/tradeoff-control-plane.test.ts
```

### Process State

```text
Claude Code active, high CPU
No active npm/vitest process after verification completed
Another git add process exists in /Users/kev/Documents/New project 5, outside kevix engine
```

### Changed Files Observed

```text
/Users/kev/kevix/engine/src/graph/builder.ts
/Users/kev/kevix/engine/src/loop/agent-loop.ts
/Users/kev/kevix/engine/tests/persistence.test.ts
```

### Previous Hard Bug Status

Previously failing issue:

```text
choice was used without being declared
gateDataForWorker/gateData tradeoffResult typing was broken
```

Current implementation:

```text
const choice = await gateData.onTradeoffRequired(evidence, opts);
gateData.tradeoffResult = { choice };
```

Current state holder:

```text
const gateDataRef: { current: ToolLoopGateData | null } = { current: null };
```

This fixes the previous undefined `choice` issue and avoids the `never` inference problem.

### Independent Verification

```text
build: PASS
vitest: 11 files passed, 67 tests passed
gate verification: 3/3 passed
```

### P16 Evidence

New test file:

```text
/Users/kev/kevix/engine/tests/persistence.test.ts
```

It covers:

```text
Graph save/load round-trip
load missing graph returns empty graph
Tradeoff B switches to probe mode
Tradeoff C pauses/escalates
```

Graph persistence implementation:

```text
GraphBuilder.save(path)
GraphBuilder.load(path)
```

Tradeoff B implementation:

```text
choice B -> currentMode = "probe"; state.mode = "probe"; currentPhase = "probe_plan";
```

Tradeoff C implementation:

```text
choice C -> escalated = true; currentPhase = "done";
```

### Direction Judgment

Status: **P15/P16 direction correct and now green at unit-test level**.

What improved since last check:

- previous TypeScript build failure is fixed;
- B/C are no longer only event/log concepts;
- graph has JSON save/load persistence;
- tests increased from 63 to 67.

### Remaining Caveats

This is still not proof of production-grade behavior:

```text
Graph persistence is JSON save/load, not concurrent or database-backed persistence.
Tradeoff C is modeled as escalated stop, not a full resumable pause workflow.
Tradeoff B is unit-tested with mock provider, not yet validated on real API task.
Review is still high-recall advisory, not completion authority.
```

### Next Action

Recommended next verification:

1. Run one real API P15/P16 smoke task where gate frequency triggers choice B.
2. Confirm observed phases include `probe_plan` and `probe_verify`.
3. Save graph to disk after run and reload in a second run to prove persistence across process boundary.
4. Keep completion authority out of scope until review FPR is fixed.

---

## 2026-05-24 15:40:32 CST — Tradeoff B Real API Smoke Direction Audit

### User-Provided Proposal

```text
Most valuable next gap: Tradeoff B real API smoke.
Graph JSON is enough for now.
C as stop is acceptable.
Review FPR is model limitation, not immediate engineering gap.
Tradeoff B must be validated on real API, not only mocks.
Candidate task: Stripe subscription_cancel_bool / wire-level probe target.
```

### Commands Run

```text
date '+%Y-%m-%d %H:%M:%S %Z'
tail -120 /Users/kev/kevix/engine/docs/monitoring/evidence-log.md
rg -n "subscription_cancel_bool|stripe|Tradeoff B|probe_plan|probe_verify|wire-level|cancel" /Users/kev/kevix/engine /Users/kev/Documents/New project 5/research /Users/kev/gitgeo 2>/dev/null
ps aux | rg "subscription_cancel_bool|stripe|Tradeoff B|probe_plan|probe_verify|wire-level|cancel" | rg -v "rg"
```

### Evidence

Prior logged state:

```text
P15/P16 unit tests are green.
Tradeoff B is implemented at unit/mock level.
Tradeoff B has not yet been validated with a real API task.
Graph save/load is implemented.
Tradeoff C is modeled as stop/escalate.
Review remains advisory because FPR is high.
```

Relevant prior Stripe evidence exists in the research workspace:

```text
/Users/kev/Documents/New project 5/research/eapd_bench/pean-pm-harness-stripe-repair-result-002.md
/Users/kev/Documents/New project 5/research/eapd_bench/pean-pm-harness-stripe-repair-result-003.md
/Users/kev/Documents/New project 5/research/eapd_bench/pean-vs-generic-pm-stripe-protocol-001.md
/Users/kev/Documents/New project 5/research/eapd_bench/webhook-ablation-next-001.md
```

### Judgment

Direction is correct.

The next high-value experiment should be:

```text
Real API smoke for Tradeoff B:
memory mode starts
gate/cache/graph signals trigger tradeoff_required
controller/user chooses B
engine switches to probe
probe_plan and probe_verify actually run
result is logged with phases, API calls, cache metrics, and graph save/load
```

This is the right next test because it verifies the runtime control plane under actual model/tool behavior, not only mocked unit behavior.

### Why Not The Other Gaps First

```text
Graph JSON save/load: already sufficient for current research.
Tradeoff C resumable pause: useful later, but C=stop is acceptable semantics for now.
Review FPR: important, but currently model/reviewer calibration problem; does not block validating Tradeoff B.
```

### Recommended Acceptance Criteria

The smoke is valid only if it records:

```text
1. tradeoff_required event emitted with active signals.
2. choice B selected by callback or controlled test harness.
3. phases_completed includes probe_plan and probe_verify after starting in memory mode.
4. Review does not mask the result; focus is B -> probe transition.
5. Graph is saved after run and loaded successfully in a second process/run.
6. Full command, model, prompt version, token/cache metrics, and result JSON are saved.
```

### Risk

There is an active older external benchmark process under `/Users/kev/pean-bench-cache/swe_runner.py`. It is outside kevix engine and should not be confused with the new Tradeoff B smoke.

---

## 2026-05-24 15:48:13 CST — P17 Tradeoff B Smoke Script Check

### Commands Run

```text
date '+%Y-%m-%d %H:%M:%S %Z'
sed -n '1,220p' /Users/kev/kevix/engine/scripts/tradeoff-b-smoke.ts
npx tsc --noEmit
sed -n '1,120p' /Users/kev/gitgeo/.pean/directive.md
```

### Script Status

`/Users/kev/kevix/engine/scripts/tradeoff-b-smoke.ts` exists and compiles with:

```text
npx tsc --noEmit: PASS
```

The script uses:

```text
DeepSeekProvider(model: deepseek-v4-pro)
runAgentLoop(mode: memory)
GraphBuilder.load/save
onTradeoffRequired -> returns B
phase tracking for probe_plan/probe_verify
```

### Design Issues Found

1. Directive says:

```text
Red Flags: 不允许调用外部 API（只操作本地文件）
```

But this smoke necessarily calls DeepSeek API. The intended meaning should be "do not call external product/service APIs from the coding task", not "do not call LLM API".

2. Graph persistence check is weak:

```text
builder = new GraphBuilder(existingGraph)
builder.save(GRAPH_PATH)
```

The script does not currently pipe the engine event stream into `GraphBuilder.handleEvent()`, so the saved graph may not include the new run. It verifies save/load mechanics, but not that the smoke task produced new persistent graph evidence.

3. Benchmark credibility:

This is an internal targeted smoke, not a recognized external benchmark. It is useful for validating the runtime control-plane mechanism, but should not be presented as a benchmark score.

### Judgment

Status: **good internal mechanism smoke, not an external benchmark**.

The script is suitable for answering:

```text
Can Kevix start in memory mode, trigger tradeoff, choose B, and run probe phases with real API calls?
```

It is not suitable for claiming:

```text
Kevix outperforms other coding agents on a recognized benchmark.
```

### Required Improvements Before Running

1. Change the directive wording to clarify that LLM API calls are allowed.
2. Add an event collector:

```text
const builder = new GraphBuilder(existingGraph)
onEvent: (e) => {
  builder.handleEvent(e, taskId, problem, "memory")
  ...
}
```

3. Save a structured result JSON:

```text
results/tradeoff-b-smoke-YYYYMMDD.json
```

with:

```text
model
taskId
phase list
tradeoff evidence
choice
api calls
cache values
graph path
graph nodes before/after
pass/fail
```

4. Treat Stripe/SWE-Marathon as mechanism validation only unless the benchmark harness is externally recognized and reproducible.

---

## 2026-05-24 15:50:38 CST — SWE-bench补跑进度与首个 Auto→Probe 证据

### Commands Run

```text
date '+%Y-%m-%d %H:%M:%S %Z'
ps aux | rg 'swe_runner|swebench|pip install|instances.json|pean-bench-cache' | rg -v 'rg '
python3 progress check over /Users/kev/pean-bench-cache/results
find /Users/kev/pean-bench-cache/results -path '*auto*' -type f -mmin -120
sed -n '1,220p' /Users/kev/pean-bench-cache/results/psf_requests-1921/auto/auto_assess.md
sed -n '1,220p' /Users/kev/pean-bench-cache/results/psf_requests-1921/auto/probe_plan.md
sed -n '1,220p' /Users/kev/pean-bench-cache/results/psf_requests-1921/auto/probe_verify.md
head excerpts from cache_log.jsonl and messages.jsonl
ps -p 792 -o pid,ppid,pgid,stat,etime,command
```

### Current Background State

```text
Active swe_runner:
PID 792
command: python3 /Users/kev/pean-bench-cache/swe_runner.py --instances /Users/kev/pean-bench-cache/instances.json --index 11 --mode memory --output-dir /Users/kev/pean-bench-cache/results
elapsed at check: 02:27
```

### Matrix Progress

```text
completed: 34/36
missing:
- sympy__sympy-20916 probe
- sympy__sympy-20916 auto
```

### Important New Finding

`psf_requests-1921` auto mode generated all three files:

```text
/Users/kev/pean-bench-cache/results/psf_requests-1921/auto/auto_assess.md
/Users/kev/pean-bench-cache/results/psf_requests-1921/auto/probe_plan.md
/Users/kev/pean-bench-cache/results/psf_requests-1921/auto/probe_verify.md
```

This is the first strong evidence in this batch that auto mode upgraded to probe on a real wire-level risk.

### Auto Assess Evidence

The auto assessor marked:

```text
[x] Boolean/None sent across API/form boundary
[x] Type coercion
[x] Serialization format
[x] API boundary where SDK encoding differs from backend expectation
Risk Level: HIGH
need_probe: true
```

Reason:

```text
header set to None at session level is transmitted as literal string "None";
this manifests at the wire level and requires probe verification.
```

### Probe Verify Evidence

Probe verification found the empty patch failed the core requirement:

```text
ACCEPT-ENCODING: None would be sent on the wire.
Expected behavior: header should be absent.
Overall Verdict: FIX NEEDED
```

It then generated a revised patch for `requests/sessions.py` removing explicit `None` values from merged headers.

### Cache/API Evidence

`psf_requests-1921/auto/cache_log.jsonl` contains 5 requests:

```text
request 1: cache 77.81%, completion 2576
request 2: cache 0.00%, completion 4096
request 3: cache 0.00%, completion 845
request 4: cache 21.11%, completion 4096
request 5: cache 0.00%, completion 1342
```

### Judgment

Status: **major positive evidence for Auto→Probe on real SWE-bench-style issue**.

This is more useful than the failed Stripe single-shot experiment for the current paper/research story because it isolates the mechanism:

```text
auto assessor detects wire-level None/header serialization risk
auto mode upgrades to probe
probe verify identifies the exact wire-format failure
probe provides revised patch
```

### Caveat

This still needs evaluator pass/fail validation. The current evidence proves the control decision and diagnostic behavior, not official SWE-bench pass@1.

### Next Monitoring Target

Wait for remaining Sympy probe/auto runs and then generate:

```text
36/36 matrix
auto upgrade count
per-mode request/token/cache summary
list of instances where probe revised patch
official evaluator readiness checklist
```

## 2026-05-24 16:07:54 CST — SWE-bench-style 12×3 matrix completed

### Verification Command

```text
workspace: /Users/kev/pean-bench-cache
expected: 36
completed: 36
missing: []
```

### Aggregate Metrics

| Mode | Runs | Avg Requests | Weighted Cache Hit | Avg Prompt Tokens | Avg Total Tokens |
|---|---:|---:|---:|---:|---:|
| memory | 12 | 2.08 | 7.26% | 1,764 | 7,453 |
| probe | 12 | 3.92 | 4.54% | 5,640 | 19,115 |
| auto | 12 | 3.25 | 13.50% | 2,923 | 9,674 |

### Key Mechanism Evidence

`psf__requests-1921` is the first completed real auto-upgrade case:

```text
auto_assess.md: present
probe_plan.md: present
probe_verify.md: present
```

Interpretation: auto mode detected a wire-level header/None serialization risk and upgraded into probe. Probe verification then ran and produced a diagnostic/revision path.

### Current Claim Boundary

This proves a runtime-control mechanism and cost/observability matrix, not official SWE-bench pass@1. Official evaluator pass/fail still needs to run before comparing against SWE-Agent, Agentless, Devin-style baselines, or making academic performance claims.

### Next Required Evidence

1. Generate a durable markdown/JSON matrix from all 36 logs.
2. Run SWE-bench official evaluator or a clearly documented equivalent on generated patches.
3. Only after pass/fail exists, compare against public baselines.

## 2026-05-24 16:13 CST — Manual check after final experiment report

### SWE-bench-style Matrix Status

```text
workspace: /Users/kev/pean-bench-cache
instances: 12
expected runs: 36
completed cache logs: 36
missing: []
```

Aggregate recomputation from `cache_log.jsonl`:

| Mode | Runs | Avg Requests | Weighted Cache Hit | Avg Prompt Tokens | Avg Total Tokens |
|---|---:|---:|---:|---:|---:|
| memory | 12 | 2.08 | 7.26% | 1,764 | 7,453 |
| probe | 12 | 3.92 | 4.54% | 5,640 | 19,115 |
| auto | 12 | 3.25 | 13.50% | 2,923 | 9,674 |

Auto→Probe evidence remains isolated to:

```text
psf__requests-1921: probe_plan=true, probe_verify=true
```

### Kevix Engine Build/Test Status

Command:

```text
cd /Users/kev/kevix/engine && npm run build && npm test
```

Result:

```text
Test Files: 11 passed
Tests: 67 passed
Gate Verification: 3 passed, 0 failed
```

### Repository Status Caveat

`/Users/kev/kevix/engine` and `/Users/kev/kevix` are currently not Git repositories. This means the engine artifacts are present locally but not versioned in that directory yet.

### Current Interpretation

The engine and experiment matrix are stable at the local test level. The next evidence gap is official patch evaluation/pass-fail, not more cache-log completion.

## 2026-05-24 16:15 CST — P17 Tradeoff B smoke follow-up check

### Build/Test Verification

Command:

```text
cd /Users/kev/kevix/engine && npm run build && npm test
```

Result:

```text
Test Files: 11 passed
Tests: 67 passed
Gate Verification: 3 passed, 0 failed
```

### Smoke Script Presence

Script exists:

```text
/Users/kev/kevix/engine/scripts/tradeoff-b-smoke.ts
```

It records:

```text
tradeoff_required events
callback choice B
phase tracking for probe_plan/probe_verify
cache values
request count
```

### Evidence Boundary

The reported P17 result should be treated as **partial real-API evidence**:

```text
tradeoff_required triggered: reported yes, 4 times in prior run
gate count increased: reported 3 -> 11 -> 13 -> 15
callback chose B: reported yes
full probe_plan + probe_verify after B: not proven in saved artifacts yet
```

Current local persisted graph check:

```text
/Users/kev/kevix/engine/.kevix/graph.json
nodes: 0
edges: 0
```

So this smoke did not yet create durable graph evidence for the new run. The script loads and saves graph, but it does not currently feed live engine events into `GraphBuilder.handleEvent()`.

### Current Honest Claim

P17 is unit/mock complete and build/test green. Real API smoke has shown trigger behavior, but the full B -> probe_plan -> probe_verify path still needs a stable rerun with saved console log or structured result artifact.

### Next Fix Before Re-run

Update `scripts/tradeoff-b-smoke.ts` to write a structured result JSON containing:

```text
started_at
finished_at
model
phases
tradeoff_events
tradeoff_choice
cache_values
api_calls
summary
passed
error
```

Also pipe `onEvent` into `GraphBuilder.handleEvent()` so graph persistence is actually proven by the run.

## 2026-05-24 16:33 CST — P17 reported PASS + post-run build repair

### Operator-Reported P17 Console Result

Kev reported the following P17 real API smoke result from the running CC/Kevix session:

```text
P17 PASSED
Phases: controller -> worker -> probe_plan -> worker -> probe_verify
Tradeoff triggered: 4 times
Choice B switched to probe: success
Probe verify completed: success
API calls: 41
exit code: 0
```

Interpreted control flow:

```text
memory mode
  -> worker execution
  -> gate x11 + cache decline
  -> tradeoff_required
  -> user callback chooses B
  -> tool loop exits
  -> state machine switches to probe
  -> probe_plan
  -> worker
  -> probe_verify
  -> complete
```

### Local Verification After Report

Provider retry implementation is present in:

```text
/Users/kev/kevix/engine/src/provider/deepseek.ts
```

Observed code features:

```text
retry loop
HTTP 500/429 retry
network error retry
AbortSignal timeout 120s
exponential backoff: 1s, 2s, 4s, max 30s
```

### Build/Test Status After Fix

A generated quick-check utility caused a TypeScript error because it used `execSync(...).status`, but `execSync` returns a Buffer on success. Fixed by switching to `spawnSync`, which correctly exposes process `status`.

Changed files:

```text
/Users/kev/kevix/engine/src/pean/test-utils.ts
/Users/kev/kevix/engine/tests/test-utils.test.ts
```

Verification command:

```text
cd /Users/kev/kevix/engine && npm run build && npm test
```

Result:

```text
Test Files: 11 passed
Tests: 67 passed
Gate Verification: 3 passed, 0 failed
```

### Evidence Caveat

No structured P17 result JSON/log file was found on disk during this check. The P17 PASS is currently based on the operator-visible console result plus local code/test verification. For research-grade evidence, `scripts/tradeoff-b-smoke.ts` should persist its run output to a JSON artifact.

## 2026-05-24 16:40 CST — Tradeoff smoke artifact path hardening

### Artifact Check

Expected artifact path from user report:

```text
/Users/kev/kevix/engine/results/tradeoff-b-smoke.json
```

Local check result before patch:

```text
file not found at expected path
```

Reason identified:

```text
scripts/tradeoff-b-smoke.ts wrote to process.cwd() + "/results"
```

If the smoke script is launched from a different cwd, the artifact can be written outside the engine repo.

### Patch Applied

Updated:

```text
/Users/kev/kevix/engine/scripts/tradeoff-b-smoke.ts
```

Changes:

```text
- resolve PROJECT_ROOT from import.meta.url
- write graph to PROJECT_ROOT/.kevix/graph.json
- write artifact to PROJECT_ROOT/results/tradeoff-b-smoke.json
- record started_at before runAgentLoop
- include passed boolean
- set exit_code from passed result
- write failure artifact on fatal error
```

### Verification

Command:

```text
cd /Users/kev/kevix/engine && npm run build && npm test
```

Result:

```text
Test Files: 11 passed
Tests: 67 passed
Gate Verification: 3 passed, 0 failed
```

### Note

The real API smoke was not rerun in this check to avoid unnecessary token/API cost and further code mutation. The next P17 rerun should now produce a fixed-path artifact at:

```text
/Users/kev/kevix/engine/results/tradeoff-b-smoke.json
```

## 2026-05-24 16:43 CST — Runtime root moved to `/Users/kev/kevix`

### User Boundary Correction

Kev clarified that Kevix runtime evidence and PEAN state should live under:

```text
/Users/kev/kevix
```

not under:

```text
/Users/kev/gitgeo
```

### Current Layout

```text
/Users/kev/kevix/.pean/directive.md
/Users/kev/kevix/.pean/state.json
/Users/kev/kevix/engine
```

`/Users/kev/kevix` is the runtime/evidence root. `/Users/kev/kevix/engine` remains the TypeScript package root because it contains `package.json`.

### Script Path Fix

Updated:

```text
/Users/kev/kevix/engine/scripts/tradeoff-b-smoke.ts
```

Path behavior now resolves from script location:

```text
ENGINE_ROOT = /Users/kev/kevix/engine
KEVIX_ROOT = /Users/kev/kevix
GRAPH_PATH = /Users/kev/kevix/.kevix/graph.json
ARTIFACT_PATH = /Users/kev/kevix/results/tradeoff-b-smoke.json
```

### Verification

Command:

```text
cd /Users/kev/kevix/engine && npm run build && npm test
```

Result:

```text
Test Files: 11 passed
Tests: 67 passed
Gate Verification: 3 passed, 0 failed
```

## 2026-05-24 16:45 CST — Full status check and next-step decision

### Runtime Root

Kevix runtime root is now:

```text
/Users/kev/kevix
```

Current files:

```text
/Users/kev/kevix/.pean/directive.md
/Users/kev/kevix/.pean/state.json
/Users/kev/kevix/engine
```

The TypeScript package root remains:

```text
/Users/kev/kevix/engine
```

because `package.json` lives there.

### Build/Test

Command:

```text
cd /Users/kev/kevix/engine && npm run build && npm test
```

Result:

```text
Test Files: 11 passed
Tests: 67 passed
Gate Verification: 3 passed, 0 failed
```

### Artifact State

After path hardening, expected future P17 artifact path is:

```text
/Users/kev/kevix/results/tradeoff-b-smoke.json
```

Current check:

```text
/Users/kev/kevix/results/tradeoff-b-smoke.json: missing
/Users/kev/kevix/.kevix/graph.json: missing
/Users/kev/kevix/engine/.kevix/graph.json: exists but nodes=0, edges=0
```

Interpretation: the code is ready to write artifacts to the correct root, but P17 has not been rerun after the path fix.

### SWE Matrix

```text
instances: 12
expected runs: 36
completed logs: 36
missing: []
```

Aggregates:

```text
memory: runs=12, avg_req=2.08, cache=7.26%, avg_total=7,453
probe:  runs=12, avg_req=3.92, cache=4.54%, avg_total=19,115
auto:   runs=12, avg_req=3.25, cache=13.50%, avg_total=9,674
```

Auto→Probe upgrade evidence remains:

```text
psf__requests-1921
```

### Process Notes

No active `swe_runner`, `tradeoff-b-smoke`, `vitest`, `tsx`, or `tsc` process was found. There are Claude/Codex processes and an older `git add` process in `/Users/kev/Documents/New project 5`, unrelated to Kevix engine execution.

### Next-Step Decision

Do not add new runtime features next. The next step should be evidence hardening:

```text
P18: rerun P17 once from /Users/kev/kevix/engine after path hardening,
     produce /Users/kev/kevix/results/tradeoff-b-smoke.json,
     verify phases include controller -> worker -> probe_plan -> worker -> probe_verify,
     verify tradeoff_choice=B, exit_code=0, passed=true,
     verify /Users/kev/kevix/.kevix/graph.json exists.
```

Only after P18 should we move to formal experiment report and official evaluator/pass-fail.

## 2026-05-24 17:06 CST — P18 Evidence Hardened: Tradeoff B real API artifact verified

### Artifact Paths

```text
/Users/kev/kevix/results/tradeoff-b-smoke.json
/Users/kev/kevix/.kevix/graph.json
```

File check:

```text
tradeoff-b-smoke.json: exists, 928 bytes
graph.json: exists, 155 bytes
```

### Artifact Contents

Parsed `tradeoff-b-smoke.json`:

```json
{
  "test": "tradeoff-b-smoke",
  "model": "deepseek-v4-pro",
  "phases": ["controller", "worker", "probe_plan", "worker", "probe_verify"],
  "phases_include_probe_plan": true,
  "phases_include_probe_verify": true,
  "tradeoff_events": 2,
  "tradeoff_choice": "B",
  "api_calls": 43,
  "exit_code": 0,
  "passed": true,
  "error": null
}
```

Cache values were recorded for 40 API usage events, including high cache-hit values up to `99.87%`.

### Verified Control Flow

```text
memory mode
  -> controller
  -> worker
  -> tradeoff_required
  -> callback chose B
  -> probe_plan
  -> worker
  -> probe_verify
  -> passed
```

This validates the real API path for Tradeoff B after path hardening.

### Graph Caveat

Parsed `/Users/kev/kevix/.kevix/graph.json`:

```text
nodes: 0
edges: 0
meta.taskCount: 0
meta.patternCount: 0
```

So P18 proves artifact persistence and graph file save/load location, but it does not prove that this smoke run populated the persistent expert review graph. Graph event population remains separately covered by unit tests and needs a future real-run wiring proof if required.

### Build/Test Verification

Command:

```text
cd /Users/kev/kevix/engine && npm run build && npm test
```

Result:

```text
Test Files: 12 passed
Tests: 72 passed
Gate Verification: 3 passed, 0 failed
```

### Updated Claim Boundary

P18 is now hard evidence for:

```text
real API Tradeoff B control-plane escalation
memory -> probe mode switch
probe_plan/probe_verify execution
fixed-path artifact persistence
```

P18 is not evidence for:

```text
official SWE-bench pass@1
persistent graph population in real run
superiority over external coding agents
```

## 2026-05-24 17:42 CST — CLI completion check

### CLI Files

```text
/Users/kev/kevix/engine/src/cli/index.ts
/Users/kev/kevix/engine/src/cli/render.ts
/Users/kev/kevix/engine/src/cli/prompts.ts
```

Package bin entry:

```json
"bin": {
  "kevix": "./dist/cli/index.js"
}
```

### CLI Capabilities Observed

Implemented:

```text
interactive REPL mode: kevix
non-interactive mode: kevix [--mode memory|probe|auto] [--yes] [--json] [problem]
readline-based approval prompt
readline-based tradeoff prompt
phase/event renderer
/status, /graph, /help, /memory, /probe, /auto, /exit commands
GraphBuilder load/save via .kevix/graph.json
```

Help command verified:

```text
node /Users/kev/kevix/engine/dist/cli/index.js --help
```

Output includes:

```text
kevix — DeepSeek-native PEAN harness CLI
--mode <mode>
--yes, -y
--json
```

### Build/Test

Command:

```text
cd /Users/kev/kevix/engine && npm run build && npm test
```

Result:

```text
Test Files: 12 passed
Tests: 72 passed
Gate Verification: 3 passed, 0 failed
```

### P18 Artifact Still Valid

```text
/Users/kev/kevix/results/tradeoff-b-smoke.json
passed: true
exit_code: 0
tradeoff_choice: B
phases: controller -> worker -> probe_plan -> worker -> probe_verify
```

### Claim Boundary

CLI v0.1 is complete as a runnable skeleton around the existing engine:

```text
run task
interactive/non-interactive modes
approval/tradeoff prompt
phase rendering
JSON output
```

Not yet implemented as first-class CLI subcommands:

```text
kevix smoke tradeoff-b
kevix report latest
kevix eval swebench
```

Current smoke remains script-level via:

```text
npx tsx scripts/tradeoff-b-smoke.ts
```

## 2026-05-24 17:47 CST — CLI whale astronaut startup banner completed

### Implemented Behavior

The whale astronaut banner is implemented in:

```text
/Users/kev/kevix/engine/src/cli/render.ts
```

and called only from interactive REPL startup in:

```text
/Users/kev/kevix/engine/src/cli/index.ts
```

Confirmed references:

```text
renderStartupBanner called from runInteractive only
renderEvent remains phase/event-only
```

### Runtime Checks

Interactive startup:

```text
printf '/exit\n' | node /Users/kev/kevix/engine/dist/cli/index.js
```

Result: whale astronaut banner appears once at the top, followed by REPL status and exit.

Help command:

```text
node /Users/kev/kevix/engine/dist/cli/index.js --help
```

Result: no whale banner; help text only.

Non-interactive error path:

```text
env -u DEEPSEEK_API_KEY node /Users/kev/kevix/engine/dist/cli/index.js --json 'test task'
```

Result: no whale banner; prints `DEEPSEEK_API_KEY not set` only.

### Build/Test

Command:

```text
cd /Users/kev/kevix/engine && npm run build && npm test
```

Result:

```text
Test Files: 12 passed
Tests: 72 passed
Gate Verification: 3 passed, 0 failed
```

### Status

CLI visual entry page is complete for v0.1: the mascot appears only at the top of interactive mode and does not pollute JSON, help, or non-interactive outputs.

## 2026-05-24 17:48 CST — Tool system check

### Tools Present

```text
/Users/kev/kevix/engine/src/tools/bash.ts
/Users/kev/kevix/engine/src/tools/read.ts
/Users/kev/kevix/engine/src/tools/write.ts
/Users/kev/kevix/engine/src/tools/edit.ts
/Users/kev/kevix/engine/src/tools/grep.ts
/Users/kev/kevix/engine/src/tools/glob.ts
```

### Wiring Verified

The six tools are wired into:

```text
/Users/kev/kevix/engine/src/index.ts
/Users/kev/kevix/engine/src/cli/index.ts
/Users/kev/kevix/engine/scripts/tradeoff-b-smoke.ts
/Users/kev/kevix/engine/scripts/l2-runner.ts
/Users/kev/kevix/engine/scripts/l2-smoke.ts
```

CLI tool dispatcher supports:

```text
bash -> executeBash
read -> executeRead
write -> executeWrite
edit -> executeEdit
grep -> executeGrep
glob -> executeGlob
```

### Tool Capabilities

```text
bash: exec shell command with timeout/maxBuffer, captures stdout/stderr/error
read: read file with line numbers, offset, limit
write: write file, creates parent dirs
edit: exact replacement, uniqueness check, replace_all option
grep: grep -rn search with optional include
glob: find-based file pattern search
```

### Safety Boundary

Tools are functional and connected, but `grep`/`glob` currently use shell command composition internally. Risk is mitigated by gate layers in agent execution, but these are not yet hardened structured filesystem implementations.

### Build/Test

Command:

```text
cd /Users/kev/kevix/engine && npm run build && npm test
```

Result:

```text
Test Files: 12 passed
Tests: 72 passed
Gate Verification: 3 passed, 0 failed
```

## 2026-05-24 18:00 CST — P23 Tool hardening: grep/glob Node-native

### Verified Changes

`grep` and `glob` no longer shell out.

```text
/Users/kev/kevix/engine/src/tools/grep.ts
/Users/kev/kevix/engine/src/tools/glob.ts
```

Implementation now uses Node APIs:

```text
grep: fs stat/read/readdir walk + RegExp
glob: fs readdir walk + globToRegex
```

Shell usage scan in `src/tools`:

```text
bash.ts uses child_process.execSync  (expected)
grep.ts no child_process
glob.ts no child_process
```

### Tool Set Status

```text
bash: shell execution tool, intentionally uses execSync
read: Node-native
write: Node-native
edit: Node-native
grep: Node-native
 glob: Node-native
```

### Verification

Command:

```text
cd /Users/kev/kevix/engine && npm run build && npm test
```

Result:

```text
Test Files: 12 passed
Tests: 72 passed
Gate Verification: 3 passed, 0 failed
```

### Claim Boundary

P23 completes shell-dependency removal for search tools. `bash` remains a shell execution tool by design and is governed by Bash Risk Gate and broader execution gates.

## 2026-05-24 18:04 CST — Installability check

### Package Boundary Fix

Updated package boundary:

```text
package.json files: dist, README.md, LICENSE
tsconfig excludes src/**/*.test.ts and src/**/__tests__/**
```

Added:

```text
/Users/kev/kevix/engine/README.md
/Users/kev/kevix/engine/LICENSE
```

### Pack Result

Command:

```text
cd /Users/kev/kevix/engine && npm pack
```

Result:

```text
kevix-engine-0.1.0.tgz
package size: 73.6 kB
unpacked size: 310.7 kB
total files: 131
```

Tarball now excludes local runtime/research artifacts:

```text
.pean
.kevix
src
tests
scripts
results
docs
```

### Local Install Smoke

Installed tarball into temp project:

```text
/tmp/kevix-install-INCjsf
npm install /Users/kev/kevix/engine/kevix-engine-0.1.0.tgz
```

Verified binary:

```text
./node_modules/.bin/kevix --version -> kevix v0.1.0
./node_modules/.bin/kevix --help -> help output OK
```

### Caveat

Install showed an engine warning because the temp shell used Node `v20.10.0`, while package declares:

```text
node >=22.0.0
```

The help/version commands still ran, but public install docs should clearly require Node 22+.

### Status

Kevix is installable from a local npm tarball. It is not yet published to the public npm registry.

## 2026-05-24 18:05 CST — Benchmark claim verification after P24 report

### Tradeoff-B Artifact Verified

Artifact:

```text
/Users/kev/kevix/results/tradeoff-b-smoke.json
```

Parsed values:

```text
passed: true
exit_code: 0
tradeoff_choice: B
tradeoff_events: 4
api_calls: 38
model: deepseek-v4-pro
phases: controller -> worker -> probe_plan -> worker -> probe_verify
cache_values: 35 values, min=0, max=99.73
```

### L2 Repeatability Evidence

Artifacts:

```text
/Users/kev/kevix/engine/results/l2-repeatability-20260524.json
/Users/kev/kevix/engine/results/l2-repeatability-20260524.md
```

Markdown report states:

```text
5/5 tasks passed
all passing tasks maintained build + test green
cache range approximately 89.74% -> 99.56% final by task
```

### Important Data Hygiene Note

Before using the L2 table in a public paper/report, reconcile JSON vs Markdown details. Example observed during spot check: JSON and Markdown do not present identical per-task call/cache details for some tasks. Treat the L2 conclusion as valid, but clean the reporting source-of-truth before publishing.

### Current Claim Boundary

Supported by current artifacts:

```text
Kevix can run real DeepSeek API coding tasks with high cache reuse in L2 repeatability.
Kevix can trigger Tradeoff-B escalation from memory to probe on real API execution.
Kevix records fixed-path artifacts for replayable evidence.
```

Not yet supported:

```text
official SWE-bench pass@1 superiority
comparison against DeepSeek TUI or external coding agents
paper-level statistical significance
```

## 2026-05-24 18:32 CST — CLI interaction UX correction

### User Correction

The previous interactive entry page was visually noisy and unpleasant to use. The issue was not just ASCII art; the CLI did not feel like a usable Claude Code-style workbench.

### Changes

Updated:

```text
/Users/kev/kevix/engine/src/cli/render.ts
/Users/kev/kevix/engine/src/cli/prompts.ts
/Users/kev/kevix/engine/src/cli/index.ts
```

Behavior changes:

```text
- Removed large banner/status box from interactive startup.
- Added compact Claude-Code-like header.
- Added stable readline prompt: `kevix ›`.
- Plain chat input no longer starts a coding task.
- Tasks must start via `/run <task>`.
- `/mode auto|memory|probe` changes mode explicitly.
```

### Simulated Interaction

Command:

```text
printf '你好啊 我该怎么改我的mode\n/mode probe\n/status\n/exit\n' | node dist/cli/index.js
```

Observed behavior:

```text
plain Chinese input -> no task execution; CLI prompts to use /run
/mode probe -> mode set to probe
/status -> shows mode/model/graph
/exit -> exits
```

### Verification

Command:

```text
cd /Users/kev/kevix/engine && npm run build && npm test
```

Result:

```text
Test Files: 12 passed
Tests: 72 passed
Gate Verification: 3 passed, 0 failed
```

## 2026-05-24 18:36 CST — CLI installed version mismatch and REPL usability fix

### Problem

Kev ran `kevix` from Terminal and still saw the old large whale astronaut banner. Root cause:

```text
which kevix -> /Users/kev/.npm-global/bin/kevix
```

The global install was using an older packed version, not the locally rebuilt `dist/cli/index.js`.

### UX Fix

Changed CLI interaction from large banner to compact Claude-Code-like REPL:

```text
Kevix Coding Harness  deepseek-v4-pro  mode=auto
graph: ...
Type /run <task>, /mode auto|memory|probe, /status, or /help.

kevix ›
```

Plain chat no longer starts a task. Tasks must be explicit:

```text
/run <task>
```

### Global Install Updated

Ran:

```text
npm pack
npm install -g /Users/kev/kevix/engine/kevix-engine-0.1.0.tgz
kevix --version
printf '/exit\n' | kevix
```

Verified global `kevix` now shows compact REPL, not the old banner.

### Package Boundary Re-fixed

During repack, `src/` had been included via `files`. Fixed package boundary again:

```text
files: bin, dist, README.md, LICENSE
no src in tarball
no tests/scripts/results/docs in tarball
```

`bin/kevix.js` now loads compiled dist only and does not depend on `tsx` or source fallback.

### Verification

Command:

```text
cd /Users/kev/kevix/engine && npm run build && npm test && npm pack --dry-run
```

Result:

```text
Test Files: 12 passed
Tests: 72 passed
Gate Verification: 3 passed, 0 failed
Tarball: 74.3 kB, 132 files
```

## 2026-05-24 — CLI TUI Upgrade Check

Context: User rejected the compact readline UI because it lacked the requested whale astronaut, dialog panel, and status bar. The CLI needed to move from a command script feel toward a terminal application closer to Codex/Claude Code/Gemini CLI expectations.

Changes made:
- Added `src/cli/tui.ts`: native ANSI TUI with no external dependencies.
- Interactive TTY mode now shows a full-screen framed interface with:
  - whale astronaut header
  - title area
  - two-line status panel: mode/model/phase/cache/gates/tradeoff/graph
  - dialog/log panel
  - bottom status bar with tokens/cost/elapsed/progress
  - raw-mode input at the bottom
- Non-TTY mode still falls back to readline so tests, pipes, and scripts do not break.
- Rewired CLI event handling so engine events can update the TUI instead of printing raw lines.
- Repacked and reinstalled the global `kevix` command from `/Users/kev/kevix/engine/kevix-engine-0.1.0.tgz`.

Verification:
- `npm run build`: PASS
- `npm test`: PASS, 12 test files / 72 tests / 3 gate verification checks
- `kevix --version`: `kevix v0.1.0`
- TTY launch check: `kevix` opens the framed TUI with whale astronaut, dialog panel, and bottom status bar.

Known gaps:
- This is a first native ANSI TUI, not yet a polished Codex/Claude Code-level interaction system.
- The whale astronaut is terminal art, not the exact visual richness of the mock screenshot.
- Next UX work should focus on run-time task display: persistent phase cards, approval modal polish, command palette, and clearer progress/status updates during real `/run` execution.

## 2026-05-24 — TUI Product Direction Update

Context: User provided a design preview inspired by Codex CLI, Gemini CLI, and Claude Code, and rejected the prior shell-like UI as too far from a product-grade agent CLI.

Changes made:
- TTY interactive mode now uses a native ANSI TUI rather than a simple readline screen.
- Plain text input now starts a task directly, matching Codex/Claude Code/Gemini CLI behavior. `/run <task>` remains supported as an explicit command.
- Startup TUI includes:
  - whale astronaut hero area
  - Kevix Coding Harness title/subtitle
  - structured metrics panel: mode/model/phase/cache/gates/tradeoff/graph
  - dialog panel for user commands and engine events
  - bottom status bar: tokens/cost/elapsed/progress
- Engine event routing updates TUI state for phase, cache, gates, tradeoff, result, and done events.
- Slash commands remain: `/mode`, `/memory`, `/probe`, `/auto`, `/status`, `/graph`, `/help`, `/exit`.

Verification:
- `npm run build`: PASS
- `npm test`: PASS, 12 test files / 72 tests / 3 gate verification checks
- Global tarball install refreshed from `/Users/kev/kevix/engine/kevix-engine-0.1.0.tgz`.
- `kevix --version`: `kevix v0.1.0`
- TTY launch check: `kevix` opens full-screen TUI and `/status`, `/exit` work.

Known gaps:
- The current whale astronaut is still terminal ASCII art, not the exact visual style of the mockup.
- The TUI is native ANSI, not yet a full Ink/Blessed-style component system.
- Next UX pass should improve: command history, arrow navigation, richer phase cards, approval/tradeoff modal layout, and live tool-call rendering.

## 2026-05-24 — Whale Astronaut Hero Iteration

Context: User asked whether the top whale astronaut from the preview could be reproduced. The previous 7-line art was too abstract and did not read as the requested whale astronaut.

Changes made:
- Expanded `WHALE_ASTRONAUT` in `src/cli/tui.ts` from 7 lines to 14 lines.
- Adjusted TUI hero rendering to draw all whale astronaut lines dynamically.
- New hero attempts to represent: helmet, visor/face, body panel, legs, and whale tail/flippers.
- Kept native ANSI/no dependency approach for beta package stability.

Verification:
- `npm run build`: PASS
- TTY launch check: `node dist/cli/index.js` displays the expanded whale astronaut hero.
- `npm test`: PASS, 12 test files / 72 tests / 3 gate checks.
- Repacked and reinstalled global `kevix`; `kevix --version` returns `kevix v0.1.0`.

Known gap:
- This reproduces the preview as terminal line art only. Exact image-like cuteness/glow would require a richer TUI renderer or terminal image protocol, which is not portable for beta users.

## 2026-05-24 — Local Intent Gate for Fast TUI Responses

Context: User asked Kevix how to change mode. The TUI treated the plain-language question as a coding task and entered the Controller path, causing a ~51 second DeepSeek API delay. This is incorrect for CLI UX: help/status/mode questions must be handled locally.

Changes made:
- Added local intent classification in `src/cli/index.ts` before invoking `runAgentLoop`.
- Plain text input now routes locally when it asks about:
  - mode help / changing mode
  - direct mode switches: auto, memory, probe
  - status
  - graph/history
  - help
- Only explicit coding/task-like inputs now enter the LLM agent loop.
- Ambiguous non-task chat defaults to help instead of starting Controller.

Verification:
- `npm run build`: PASS
- `npm test`: PASS, 12 test files / 72 tests / 3 gate checks
- TTY manual check: input `怎么更改模式` returned local help immediately without API/Controller phase.
- Repacked and reinstalled global `kevix`; `kevix --version` returns `kevix v0.1.0`.

Known follow-up:
- Add proper unit tests around `classifyLocalIntent` once it is exported or moved to a dedicated CLI intent module.

## 2026-05-25 — Health Check

Scope: Verify current Kevix CLI/TUI package state after the mode-response latency fix.

Checks:
- `npm run build`: PASS
- `npm test`: PASS, 12 test files / 72 tests / 3 gate verification checks
- Global command path: `/Users/kev/.npm-global/bin/kevix`
- Global package: `@kevix/engine@0.1.0`
- `kevix --version`: `kevix v0.1.0`
- `npm pack --dry-run`: package size 85.4 kB, unpacked size 366.9 kB, 136 files

Current conclusion:
- Engine tests are green.
- Global CLI package is installed and points to Kevix 0.1.0.
- TUI/local intent gate changes are present in the built package.

Open UX risks:
- TUI is still native ANSI and visually rough compared with Codex/Claude Code/Gemini CLI.
- Mode/help/status local routing lacks dedicated unit tests.
- Real task execution inside TUI still needs a focused live-run UX pass: phase cards, tool-call list, approval/tradeoff overlays, and command history.

## 2026-05-25 — P25 TUI Runtime UX Completion

Directive: `/Users/kev/kevix/.pean/directive.md`

Changes made:
- Added a dedicated runtime panel to `src/cli/tui.ts` separate from the dialog panel.
- Runtime panel now tracks task name, phase events, API calls, cache, gates, tradeoff, and result/done/error events.
- Dialog panel now stays focused on user commands and local responses.
- Added command history support in TUI with up/down arrow navigation.
- Added `setTask()` bridge from CLI to TUI so real tasks become visible before Controller starts.
- Prevented normal CLI header/done output from polluting the full-screen TUI when `prompter.handleEvent` is active.
- Kept non-TTY/script behavior unchanged.

Verification:
- `npm run build`: PASS
- `npm test`: PASS, 12 test files / 72 tests / 3 gate verification checks
- TTY smoke: launched `node dist/cli/index.js`; runtime panel/status/dialog rendered.
- TTY smoke: `怎么更改模式` returned local mode help without API/Controller.
- TTY smoke: `/mode probe` updated status panel.
- TTY smoke: up-arrow history recalled the previous command and did not crash.
- Global install refreshed from `kevix-engine-0.1.0.tgz`; `kevix --version` returns `kevix v0.1.0`.

Known gaps:
- Runtime panel currently shows API/gate/phase events but does not yet display individual tool names because the engine does not emit tool-call events explicitly.
- Approval/tradeoff modal exists but needs a visual polish pass with boxed option rows.
- Command history works but does not yet support cursor movement/editing within the line.

## 2026-05-25 — P26 Tool Events + Dialog Time Rail

Directive: `/Users/kev/kevix/.pean/directive.md`

Changes made:
- Added explicit `tool_call` engine event with tool name, call id, and compact argument preview.
- Expanded `tool_result` event with optional call id, content preview, and duration in milliseconds.
- Updated Worker tool loop to emit tool-call/result telemetry for both executed tools and PEAN gate-blocked tool attempts.
- Kept backward-compatible `tool_start` event for existing renderers.
- Updated TUI runtime panel to display `Read/Edit/Bash/Grep/Glob/Write` style tool events when the engine emits them.
- Converted dialog log entries to timestamped records so user inputs and system messages show a visible time rail.

Verification:
- `npm run build`: PASS
- `npm test`: PASS, 12 test files / 72 tests / 3 gate verification checks
- TTY smoke: launched `node dist/cli/index.js`; whale hero, status panel, runtime panel, dialog panel, and dialog timestamps rendered.
- TTY smoke: `怎么更改模式` returned local mode help without entering API/Controller.
- TTY smoke: `/mode probe` updated the status panel.
- Repacked and reinstalled global `kevix`; `kevix --version` returns `kevix v0.1.0`.

Known gaps:
- Tool event rendering is compile-verified and wired into the TUI, but this pass did not run a real API task that invokes Read/Edit/Bash/Grep, so visual proof of live tool rows is still pending.
- Dialog timestamps are visible, but jump-to-previous-input navigation is not implemented yet; the time rail is the prerequisite data layer.

## 2026-05-25 — Input Route Semantics Correction

Context: User clarified that the goal is not "local instant response" as a product feature. The correct boundary is to distinguish whether a user input needs task description / Controller execution.

Changes made:
- Renamed the CLI input classifier from `classifyLocalIntent` to `classifyInputRoute`.
- Renamed the coding path from generic `task` to `task_description`.
- Kept slash commands and control questions outside the coding harness path.
- Kept coding-like inputs routed into `runNonInteractive()` so they still enter the task description / Controller flow.

Verification:
- `npm run build`: PASS
- `npm test`: PASS, 12 test files / 72 tests / 3 gate verification checks

Design note:
- This is a semantic correction, not a UX speed claim. The classifier is a harness boundary: "does this input need task description and execution?" not "can Kevix chat quickly?"

## 2026-05-25 — P27 TUI Workbench Upgrade

Directive: `/Users/kev/kevix/.pean/directive.md`

Changes made:
- Reworked the TUI runtime panel from a flat event stream into phase-grouped workbench sections: Controller, Worker, Review, Probe, Result.
- Added short tool-call formatting for Read/Edit/Write/Bash/Grep/Glob so tool telemetry can render like a coding workbench instead of JSON-shaped logs.
- Added input editor state with cursor position, left/right movement, Ctrl+A, Ctrl+E, insertion at cursor, and safer pasted text handling.
- Upgraded approval UI into an Approval Gate card showing Product Intent, Red Flags, and explicit approve/reject actions.
- Upgraded tradeoff UI into Runtime Tradeoff cards showing evidence first and A/B/C choices with risk/cost semantics.
- Added result summary lines covering phases, gates, cache, tokens, review/tradeoff status, and next action.
- Added `/history`, `/again`, and `/timeline` commands to support input recall and task timeline inspection.

Verification:
- `npm run build`: PASS
- `npm test`: PASS, 12 test files / 72 tests / 3 gate verification checks
- TTY smoke: `node dist/cli/index.js` renders phase-grouped runtime panel.
- TTY smoke: `/history`, `/timeline`, `/help`, and `/exit` routes worked without crashing.
- TTY smoke: left-arrow insertion path did not crash the TUI.
- Repacked and reinstalled global `kevix`; `kevix --version` returns `kevix v0.1.0`.

Known gaps:
- A real API coding task was not run in this pass, so Read/Edit/Bash/Grep live tool rows are wired and compile-verified but still need visual proof from a real task.
- Input editor now supports cursor movement and insertion, but it is still a native ANSI editor rather than a full readline-quality editor with selection, mouse, or scrollback.
- `/again` only re-runs the last task kept in the current interactive session; persistent cross-session task replay is not implemented.

## 2026-05-25 — KVX-001 Standalone Real Validation

Fixture: `/Users/kev/kevix/validation/kvx-001`

Goal:
- Validate Kevix standalone, without CC+hook, on a controlled red-to-green bugfix.
- Task: fix `parseAmount(input)` so it trims valid numeric strings, rejects null/undefined/empty/whitespace input, and rejects non-numeric or non-finite values.

Baseline:
- `npm test`: FAIL
- 5 tests total: 2 pass, 3 fail

Kevix run:
- command path: global `kevix`
- mode: `auto`
- model: `deepseek-v4-pro`
- phases: `controller -> worker -> assess`
- API calls: 8
- total wall time reported by Kevix: 147s
- observed worker cache: 84%
- tools observed in the run: read source, glob tests, read test file, edit source, bash `npm test`
- output log: `/Users/kev/kevix/validation/kvx-001/kevix-run.log`

Result:
- Kevix edited `/Users/kev/kevix/validation/kvx-001/src/parseAmount.js`.
- Post-run `npm test`: PASS, 5/5.
- `.kevix/graph.json` was created in the validation project.

Honest conclusion:
- Standalone Kevix is functionally effective on this small controlled bugfix: it can leave CC+hook, inspect files, edit code, run tests, and reach green.
- This does not prove Kevix beats CC, Codex CLI, opencode, DeepSeek TUI, SWE-Agent, or Agentless.
- Product-quality gaps are still obvious: a tiny task took 147s, Controller alone was visually too long, non-TTY logs are polluted by spinner control sequences, and one non-critical SSE parse warning appeared.
- Next engineering priority from this evidence: small-task fast path plus a clean event/TUI renderer, before claiming daily-use quality.

## 2026-05-25 — Ink Engine Wiring Check

Context:
- User reported the Ink task was completed and requested a PM/user-experience oriented check plus next step.

Observed changes:
- Ink files exist under `/Users/kev/kevix/engine/src/cli/ink/`.
- `src/cli/index.ts` routes interactive TTY startup to `./ink/entry.js`.
- `src/cli/ink/app.tsx` no longer uses the earlier mock task runner. It imports and calls:
  - `runAgentLoop`
  - `DeepSeekProvider`
  - `GraphBuilder`
  - core tools: bash/read/write/edit/grep/glob
- Ink now receives real `EngineEvent` updates and maps them to phase, tool, stream, gate, decision, error, and done rows.

Verification:
- `npm run build`: PASS
- `npm test`: PASS, 12 test files / 72 tests / 3 gate verification checks
- `node /Users/kev/kevix/engine/dist/cli/index.js --version`: PASS, `kevix v0.1.0`
- Global `kevix --version`: PASS, `kevix v0.1.0`
- Global package contains the real engine-wired Ink app, not the old mock runner.

PM/product assessment:
- This is a real milestone: Ink is no longer only a visual shell. It is now wired to the actual Kevix engine.
- It is not yet a CC/Codex/opencode-grade experience. Current Ink app auto-approves the directive and auto-selects Tradeoff B, so the core Kevix value of user control is not yet exposed.
- Status bar is too thin: it shows mode/cache/gates, but not calls, elapsed time, model, cost, current task, changed files, or test status.
- Runtime stream is still a raw event list, not a polished workbench: it lacks grouped Controller/Worker/Review/Probe sections, collapsible tool outputs, and a final result card.
- Input remains weak: no multiline task composer, no cursor navigation parity, no paste ergonomics, no command palette, and no visible task submission box.

Open risks:
- A background SWE-bench auto batch is still running separately; do not mix those results with Ink UX validation.
- A separate `git add` process appears to be staging a large `.venv_metagpt/site-packages` tree in another workspace, unrelated to Kevix Ink.

Next recommended step:
- P29: turn the real-engine Ink app into a user-controlled workbench:
  1. Add real Approval Gate UI instead of auto-approve.
  2. Add real Tradeoff A/B/C UI instead of auto-select B.
  3. Add Result Card with changed files, tests, phases, calls, cache, time, and next action.
  4. Add a task composer with multiline input and command handling.
  5. Repack/reinstall global `kevix` after the UX pass.

## 2026-05-25 — P29 Ink User-Controlled Workbench Check

Directive: `/Users/kev/kevix/.pean/directive.md`

Scope:
- Upgrade the real-engine Ink shell into a user-controlled PEAN workbench.
- Focus only on three core gaps: Approval Gate, Tradeoff A/B/C card, and Result card.

Observed changes:
- `src/cli/ink/app.tsx` now uses stateful Approval UI:
  - `onApprovalRequired` creates a pending approval card.
  - User selects approve/reject with arrow keys and confirms with Enter.
  - The earlier automatic approve behavior is removed.
- `src/cli/ink/app.tsx` now uses stateful Tradeoff UI:
  - `onTradeoffRequired` creates a pending tradeoff card.
  - Evidence shown includes active signals, gate count, and cache trend.
  - User selects A/B/C with arrow keys and confirms with Enter.
  - The earlier automatic B behavior is removed.
- `src/cli/ink/app.tsx` now renders a result card after completion:
  - phases
  - request calls
  - average cache
  - gates
  - escalation status
  - review status

Verification:
- `npm run build`: PASS
- `npm test`: PASS, 12 test files / 72 tests / 3 gate verification checks
- Static check: no remaining `Mock task runner`, `return "approve"`, or `return "B"` in `src/cli/ink`.
- Global installed package contains the P29 card code (`Directive Ready`, `Tradeoff Required`, `Task Complete`).

PM/product assessment:
- This is the first Ink version that actually reflects the PEAN philosophy: the user sees the directive/tradeoff evidence and chooses, instead of Kevix silently deciding.
- It is still not CC/Codex/opencode-level. The result card is too shallow: it lacks changed files, tests run, elapsed time, cost, and next suggested action.
- Runtime stream is still flat and noisy; it needs grouped Controller/Worker/Review/Probe sections.
- Input remains primitive: no multiline task composer, no cursor movement parity, no paste ergonomics, no persistent history replay.
- The workbench is now philosophically correct, but not yet ergonomically strong enough for daily use.

Next recommended step:
- P30: Workbench usability hardening:
  1. Group runtime timeline by phase.
  2. Improve tool rows (`Read`, `Edit`, `Bash`, `Grep`) and collapse long outputs.
  3. Add elapsed time/calls/model/cache/gates to a stronger status bar.
  4. Add changed-files and tests-run extraction to the result card.
  5. Add multiline task composer and paste-safe input handling.

## 2026-05-25 — P30 Workbench Usability Check

Directive: `/Users/kev/kevix/.pean/directive.md`

Observed changes:
- `StreamView` now builds phase groups from `step` events and renders phase headers.
- Tool calls render as compact rows, and tool results show the first line with long output collapsed.
- `StatusBar` now includes mode, model (`v4-pro`), calls, cache, gates, and elapsed seconds.
- `Result` card now includes phases, calls, average cache, gates, elapsed time, estimated cost, escalation, and review status.
- `app.tsx` tracks calls, elapsed time, cache values, gate count, and estimated cost.

Verification:
- `npm run build`: PASS
- `npm test`: PASS, 12 test files / 72 tests / 3 gate verification checks
- Global installed package contains the P30 StreamView/StatusBar/Result code.

PM/product assessment:
- P30 meaningfully improves observability: the UI now looks more like a coding workbench than a raw log stream.
- The strongest completed pieces are phase grouping, compact tool rows, stronger status bar, and richer result summary.
- The weak point is input: Ctrl+A/Ctrl+E are placeholders that return early but do not move a cursor because the input still has no cursor state. It remains append-only with backspace.
- Result card still lacks changed-files extraction and tests-run extraction; current cost is an estimate and may be inaccurate when summary token totals are zero.

Next recommended step:
- P31: Real task UX validation in Ink:
  1. Run a small controlled fixture through the Ink UI.
  2. Verify the approval card appears and user approval starts Worker.
  3. Verify tool rows show real Read/Edit/Bash calls.
  4. Verify result card appears with real calls/cache/elapsed.
  5. Capture remaining UX friction before adding more features.

## 2026-05-25 — P31 Ink Real UX Validation

Fixture:
- `/Users/kev/kevix/validation/ink-ux-001`
- Baseline: `npm test` failed 3/3 before Kevix.
- Task submitted through real installed `kevix` TTY, not a mock runner.

Observed real run:
- Approval card appeared after Controller and required manual approval.
- Approval worked: selecting approve transitioned into Worker.
- Worker performed real tools: `read`, `glob`, `write`, and `bash`.
- The task completed with phases `controller → worker → assess`.
- Result card appeared with calls/cache/gates/elapsed/cost/review fields.
- Final fixture verification: `npm test` passed 3/3 after Kevix modified `src/normalizeEmail.js`.

Runtime metrics observed in the TUI:
- Result card: `Calls: 12 | Cache: 89% | Gates: 1 | 200s | ~$0.0198`
- Status bar at completion still showed stale values before the P31 fix: `calls: 9 | cache: 97% | gates: 1 | 128s`

UX failures found:
- During long Controller/Worker waits, the status bar stayed at `calls: 0 | 0s` until the first API/tool-loop event. This made the app feel hung.
- Approval card appeared while the phase spinner still implied active execution.
- Status bar and result card disagreed at completion because the status bar only counted `api_call` events from the tool loop, while the result card used summary request counts.
- Tool rows were present but paths were overly truncated, e.g. `/Users/kev/kevix/validation/in`, which loses the important file identity.
- `/exit` did not exit in the observed session; Ctrl+C was required.
- The task was functionally successful, but UX still does not meet CC/Codex/opencode-level expectations.

Fixes applied after validation:
- Added a heartbeat timer so elapsed time updates while the agent is waiting for long API calls.
- Stopped the active spinner during approval/tradeoff wait states.
- Synchronized status bar calls/cache/elapsed with the final task summary at completion.
- Added `/exit` and `/quit` command handling.
- Improved tool argument preview so long paths keep their last path segments instead of truncating from the front.
- Repacked and globally reinstalled `kevix-engine-0.1.0.tgz`.

Verification after fixes:
- `npm run build`: PASS
- `npm test`: PASS, 12 test files / 72 tests / 3 gate verification checks

PM/product verdict:
- Kevix can now complete a real small coding task from the Ink TUI, with manual approval and visible tool execution.
- It is not yet good enough to replace CC/Codex/opencode as a daily UX. The next blocker is not engine correctness; it is interaction quality.
- The next UX pass should focus on a real composer and a stronger workbench layout: multiline input, cursor movement, paste handling, changed-files/test summary, history jump, and a clearer live timeline.

## 2026-05-25 — P32 TUI Upgrade Verification

Scope:
- Check the latest Ink/TUI upgrade after the user reported the implementation was finished.
- Verify build/test, inspect the actual TUI code, run a real TTY smoke test, and reinstall the global `kevix` package.

Observed changes:
- `app.tsx` now tracks changed files from `write`/`edit` tool calls.
- `app.tsx` now attempts to detect test pass/fail from bash tool results.
- `app.tsx` now keeps an in-memory `taskHistory` and adds `/history` plus `/again`.
- `/help` now lists `/history`, `/again`, and `/exit`.
- Result card now includes changed files and test status when detected.

Verification:
- `npm run build`: PASS
- `npm test`: PASS, 12 test files / 72 tests / 3 gate verification checks
- Local TTY smoke with `node dist/cli/index.js`: PASS after input fix
  - `/help` rendered command list.
  - `/exit` exited the TUI.
- Global install refreshed with `npm install -g /Users/kev/kevix/engine/kevix-engine-0.1.0.tgz --ignore-scripts`.
- Global package check: `dist/cli/ink/app.js` contains the newline/return input fix, `/history`, and changed-file tracking.

Bug found during smoke:
- Enter handling was still broken in a PTY path: `\r`/`\n` could be appended as text instead of submitting if `key.return` was not set by Ink.

Fix applied:
- `app.tsx` now treats `key.return || val === "\r" || val === "\n"` as submit.
- Return is ignored after command handling so newline characters are not appended to the input buffer.
- Backspace/delete now runs before appending normal characters.

PM/product verdict:
- This is a real incremental upgrade, not fake completion: history, changed-files, test-status, help, and exit are now present.
- It is still below CC/Codex/opencode interaction quality because input is still a one-line buffer with no real cursor model, no multiline composer, no paste ergonomics, and no persistent history across sessions.
- The next product-critical step is a real composer component, not more status text.

## 2026-05-25 — P33 TUI + SWE-bench Experiment Check

Scope:
- Verify the latest TUI state and inspect the completed experiment outputs under `results/swebench`.

Engineering verification:
- `npm run build`: PASS
- `npm test`: PASS, 12 test files / 72 tests / 3 gate verification checks

TUI state:
- Ink/TUI still contains the P32 features: changed-file tracking, test-status detection, `/history`, `/again`, `/help`, `/exit`, and newline-safe submit handling.
- No new full composer was detected in this check. Input is still a one-line buffer rather than a CC/Codex-style task composer.

Experiment output summary from `results/swebench`:
- Instances found: 20
- `direct`: 20 runs, 12 non-empty patches, avg 1.00 call, avg 3,543 tokens, avg cache 0.0%
- `memory`: 20 runs, 10 non-empty patches, avg 1.95 calls, avg 7,835 tokens, avg cache 6.9%
- `auto`: 20 runs, 14 non-empty patches, avg 2.55 calls, avg 7,889 tokens, avg cache 14.7%
- `generic`: 17 runs, 10 non-empty patches, avg 2.00 calls, avg 5,800 tokens, avg cache 0.8%

Paired comparison:
- `direct + memory + auto`: 20 complete instances
- `direct + generic + memory + auto`: 17 complete instances

Auto-select observation:
- `auto_assess.md` files found for 16 auto runs.
- No auto run in this 20-instance set appears to request probe upgrade.
- This is consistent with the earlier hypothesis that this sampled SWE-bench set is mostly internal logic fixes, not API-boundary/wire-level risk.

Validity warning:
- No official SWE-bench evaluator output was found in this check (`eval`, `score`, `pass`, `resolved`, or similar files were absent).
- Current results support cost/cache/patch-production analysis, but do not yet support official `pass@1` or superiority claims over SWE-Agent/Agentless/Claude Code/Codex.

Current interpretation:
- The experiment is useful as a harness-cost/control-plane dataset.
- It does not yet prove coding correctness superiority.
- The next necessary step is official evaluator integration and a boundary-risk subset where Auto can be expected to upgrade probe.

## 2026-05-25 — P34 Composer Computer-Use TTY Check

Scope:
- Verify the reported Composer upgrade using a real TTY session, not only static code inspection.

Initial verification:
- `npm run build`: PASS
- `npm test`: PASS, 12 test files / 72 tests / 3 gate verification checks
- `Composer.tsx` exists and is wired from `app.tsx`.
- Static features present: multiline lines/cursor state, Ctrl+A/E handlers, arrow movement, history, `.kevix/history.json`, inverse cursor, and persistent history.

Bug found by real TTY smoke:
- App-level `useInput` still owned normal text input while Composer also owned it, causing duplicated/incorrect input handling.
- Bulk input/paste such as `/help` could render incorrectly during smoke because Composer inserted multi-character input through repeated async cursor updates.
- Bulk `/help\n` was treated as multiline paste rather than command submission.

Fixes applied:
- Removed normal text input handling from App-level `useInput`; App now only handles approval/tradeoff/global escape. Composer owns all normal input.
- Rewrote Composer insertion as one atomic `insertText()` update so paste/IME text does not race cursor updates.
- Moved Shift/Ctrl+Enter newline handling before submit handling.
- Added single-line trailing-newline submit behavior: `/help\n` submits, while true multiline paste remains multiline.

Post-fix verification:
- `npm run build`: PASS
- `npm test`: PASS, 12 test files / 72 tests / 3 gate verification checks
- Real TTY smoke:
  - `/help\n` submits and renders command list.
  - Pasted multiline text `first line\nsecond line` remains a two-line composer buffer.
- Repacked and globally reinstalled `kevix-engine-0.1.0.tgz`.
- Global package contains `Composer.js` with `trailingSubmit` and `insertText`, and `app.js` with Composer/history wiring.

PM/product verdict:
- Composer is now real enough to count as a TUI upgrade, not just a cosmetic shell.
- It still needs deeper UX testing against actual long prompts and real task sessions, especially cursor movement across long wrapped lines and history behavior after completed tasks.

## 2026-05-25 — P35 Composer Long-Prompt Full-Task Test

Scope:
- Run a real long-prompt coding task through the global `kevix` TTY to test Composer, manual approval, history persistence, and full task execution.

Fixture:
- `/Users/kev/kevix/validation/composer-long-001`
- Target file: `src/summarizeOrder.js`
- Baseline: `npm test` failed 2/4 before Kevix.

Long-prompt Composer results:
- Pasted a multi-paragraph task with context, constraints, and seven behavior requirements.
- Composer preserved the long prompt as readable multiline input.
- Submit worked and the full prompt appeared in the runtime event stream.
- `.kevix/history.json` was written and contains the full multi-line task.

Execution result:
- Controller started and eventually produced an approval card.
- Approval card appeared after about 85 seconds, which is too slow for this small fixture.
- Approval card content was truncated, making it impossible to fully audit the directive and red flags from the TUI.
- Manual approve worked and transitioned to Worker.
- Worker failed before any tool call because DeepSeek API returned `fetch failed` after provider retries.
- The TUI process crashed with an uncaught `ProviderError` before the fix in this entry.
- Fixture remained unchanged and `npm test` still failed 2/4 after the failed run.

Fix applied after failure:
- Added a `try/catch` boundary around `runAgentLoop` in `app.tsx`.
- Provider/runtime errors now push a visible `Task failed: ...` error into the TUI, stop the running state, save graph, clear phase, and preserve elapsed time instead of crashing into a stack trace.
- Repacked and globally reinstalled `kevix-engine-0.1.0.tgz`.

Verification after fix:
- `npm run build`: PASS
- `npm test`: PASS, 12 test files / 72 tests / 3 gate verification checks

PM/product verdict:
- Composer itself passed the long-prompt input and history persistence test.
- Full-task UX did not pass because provider failure crashed the old TUI and the task did not complete.
- The new error boundary fixes the crash class, but the workflow still needs a rerun under stable API conditions.
- Priority UX issues found: slow Controller feedback, approval-card truncation, and missing "API pending/retrying" status while calls are in flight.

## 2026-05-25 — P36 Network-Restored Long-Prompt Rerun

Scope:
- Rerun the same global `kevix` TTY long-prompt fixture after network recovery.
- Fixture: `/Users/kev/kevix/validation/composer-long-001`
- Command path: global `kevix` → `/again` → manual approval → Worker.

Observed successful pieces:
- `/again` reused the persisted multi-line task from `.kevix/history.json`.
- Controller eventually returned and displayed the approval card.
- Manual approval worked.
- Worker tool timeline rendered Read/Glob/Bash/Edit/Write attempts in the Ink TUI.
- Cache reached about 98-99% during Worker calls.

Failures found:
- Controller latency was very poor: first approval took about 132 seconds for a small fixture.
- During long Controller/Worker waits, the status bar showed `calls: 0`, which makes the UI feel frozen even though an API call is pending.
- The approval card still truncates directive content, so users cannot fully audit Product Intent / Red Flags.
- The Controller put the explicit target file `src/summarizeOrder.js` into Red Flags even though the prompt said "The file to change is src/summarizeOrder.js".
- Red Flag Gate then correctly blocked `write` and `edit` on the target file, leaving Worker stuck in a contradiction: the task requires editing the file, but the directive forbids it.
- Worker also attempted a shell command referencing `/home/user`, correctly blocked by Scope Gate. This is useful safety evidence, but noisy for this small task.

Result:
- The task did not complete successfully in this rerun and was manually interrupted.
- This is a PEAN directive consistency bug, not merely a coding-model failure.

Fixes applied after P36:
- Added Controller prompt rules clarifying that target implementation files must not be placed in Red Flags.
- Added `sanitizeDirectiveForProblem()` to remove explicitly declared target files from Red Flags before approval and gate checks.
- Updated Worker-facing raw directive so the sanitized Red Flags also reach the model, not only the gate layer.
- Added TUI test-status parsing for Node TAP/Vitest summaries. The previous parser could show `Tests: FAIL` on a passing Node `--test` output because it looked for `passed/failed` keywords rather than `# fail 0`.

Verification:
- `npm run build`: PASS
- `npm test`: PASS, 14 files / 79 tests / 3 gate verification checks
- `npm pack` + global `npm install -g ./kevix-engine-0.1.0.tgz --force --ignore-scripts`: PASS

Product verdict:
- Composer/history/input path is now real enough to keep.
- Full-task experience is still not near CC/Codex quality because latency visibility, directive auditability, and directive consistency need stronger runtime treatment.
- Next highest-value fix: add API pending/retry visibility and a directive consistency panel before approval, then rerun this fixture end-to-end.

## 2026-05-25 — P37 TUI Usability / Mode Ownership Check

Scope:
- Check the latest Ink TUI from a PM/user-experience perspective after the "waiting..." update.
- Verify build/test, inspect runtime mode routing, and ensure global `kevix` is updated.

Engineering verification:
- `npm run build`: PASS
- `npm test`: PASS, 14 files / 79 tests / 3 gate verification checks
- `npm pack` + global reinstall: PASS

Findings:
- The extra `}` in `src/cli/ink/PhaseBar.tsx` initially broke `npm run build`; it was removed and build now passes.
- `StatusBar` now shows `waiting...` when a task is running with zero API calls, which reduces the "frozen UI" feeling.
- `PhaseBar` now shows elapsed seconds and an idle marker.
- A route bug was found: slash commands such as `/memory`, `/help`, `/history` were placed after `inputMode === "chat"`, so default chat mode could send them to the model instead of handling them locally.
- The route bug was fixed by handling all slash commands before mode dispatch.
- Auto-routing from chat text to coding pipeline was removed. User explicitly owns `/chat` vs `/code`, consistent with PEAN's tradeoff philosophy.

PM verdict:
- This is closer to a usable TUI, but still below CC/Codex/opencode for serious daily use.
- The biggest remaining usability gaps are directive auditability, cancellability during long API waits, and a proper command palette/help layer.

## 2026-05-25 — P38 TUI Help + Approval Card + Real Code Task Smoke

Scope:
- Verify latest globally installed `kevix` after grouped `/help` and expanded approval card updates.
- Fixture: `/Users/kev/kevix/validation/composer-long-001`
- Task: `Fix src/summarizeOrder.js so npm test passes. Do not edit tests. Keep summarizeOrder export.`

Engineering verification:
- `npm run build`: PASS
- `npm test`: PASS, 14 files / 79 tests / 3 gate verification checks
- `npm pack` + global `npm install -g ./kevix-engine-0.1.0.tgz --force --ignore-scripts`: PASS

TTY observations:
- Startup now opens directly into the Ink workbench with status bar and `kevix/chat ›` prompt.
- `/help` works locally in chat mode and displays grouped sections: Mode, Input, History, System.
- `/code` switches to `kevix/code ›` without calling the model.
- Controller approval card appears and includes Product Intent, Red Flags, Constraints, and Worker Directive.
- Worker timeline displays compact Read / Glob / Bash rows and gate warnings.
- Status bar reached `calls: 12`, `cache: 98%`, `gates: 3`.
- Scope Gate correctly blocked suspicious absolute paths such as `/home/user/repo` and `/src/summarizeOrder.js`.

Task result:
- The Worker did modify `src/summarizeOrder.js`.
- Manual post-check: `npm test` in the fixture passed all 4 tests.
- The TUI did not reach a clean Result card promptly; it remained in Worker spinner around 248s and was manually interrupted.

UX failures:
- The top whale/brand visual is absent from the real TTY view. The product now feels functional but not yet like the intended Kevix workbench identity.
- Approval card is not truly "full directive"; Constraints and Worker Directive are hard-truncated, including broken text like `cu`.
- The task achieved the code result, but the interface failed to recognize/communicate completion quickly enough.
- For a small fixture, 12 calls / about 4 minutes is too slow compared with CC/Codex expectations.
- There is no "stall guard" when Worker has already run tests and produced a valid fix but keeps exploring.

PM verdict:
- Capability: real. The engine can complete the fixture and preserve high cache.
- Daily-use UX: not yet. This still feels below CC/Codex/opencode because the user cannot trust the loop to stop, summarize, and hand control back.
- Next priority: implement a completion authority / stall guard for code mode: when tests pass after file edits, force Review/Result or ask the user whether to stop, continue, or upgrade probe.

## 2026-05-26 — P39 Smart Truncation + Stall Guard Rerun

Scope:
- Verify the latest smart truncation and stall guard changes in the real globally installed `kevix`.
- Fixture: `/Users/kev/kevix/validation/composer-long-001`
- Baseline was reset to failing implementation before running.
- Task: `Fix src/summarizeOrder.js so npm test passes. Do not edit tests. Keep summarizeOrder export.`

Engineering verification:
- `npm run build`: PASS
- `npm test`: PASS, 14 files / 79 tests / 3 gate verification checks
- Fixture baseline before run: `npm test` failed 2/4.

Input UX finding:
- Pasting `/code` plus the task as a multi-line input was treated as chat, not as a command followed by a task.
- This is a real usability bug for CC/Codex-like workflows. Multi-line paste should either parse a leading slash command or reject with a local hint.
- Running `/code` first and then submitting the task separately worked.

Approval-card finding:
- Smart truncation improved the display: no broken fragments like `cu`; truncation now occurs around word boundaries with `…`.
- The card still hides important directive content and has no expand/scroll mode.
- Controller produced an incorrect Product Intent: it claimed `summarizeOrder` must produce a string summary, while the actual tests require an object `{ id, total, status }`.

Runtime result:
- Worker read tests and source, edited `src/summarizeOrder.js`, ran `npm test`, and produced a passing implementation.
- Manual post-check: `npm test` passed all 4 fixture tests.
- Scope Gate blocked a hallucinated absolute path `/home/user/pean`, which is useful safety evidence.
- TUI reached a Result card instead of hanging forever.
- Final displayed metrics: phases `controller → worker → worker → assess`, `Calls: 19`, `Cache: 88%`, `Gates: 1`, elapsed about `290s`, cost estimate about `$0.0314`.

Remaining product failure:
- Result card said `Tests: ✓ PASS`, but also displayed Review issues saying the patch violated Product Intent because it returned an object instead of a string.
- The contradiction came from the Controller's wrong Product Intent, not from the actual tests.
- This proves the next bottleneck is directive/evidence correctness, not only stall control.

PM verdict:
- Smart truncation: improved.
- Stall guard / completion return: partially validated; the TUI now returns a result card.
- Daily-use readiness: still below CC/Codex/opencode because a small fixture took ~290s and produced a contradictory result card.
- Next priority: evidence-first Controller. Product Intent must cite observed tests/source, or be marked unverified until Worker reads them. Review must not overrule passing tests using a hallucinated Controller intent.

## 2026-05-26 — P40 Multi-line Code Route + Evidence-first Controller Recheck

Scope:
- Re-verify the latest globally installed `kevix` after `/code` multi-line parsing, Controller evidence-first prompt, and Review test-deferential prompt updates.
- Fixture: `/Users/kev/kevix/validation/composer-long-001`
- Task submitted as one multi-line input:
  - `/code`
  - `Fix src/summarizeOrder.js so npm test passes. Do not edit tests. Keep summarizeOrder export.`

Engineering verification:
- `npm run build`: PASS
- `npm test`: PASS, 14 files / 79 tests / 3 gate verification checks
- Fixture baseline before run: `npm test` failed 2/4.
- Source scan confirmed:
  - Multi-line `/code` + rest-of-input routes into `runTask(restLines)`.
  - Controller prompt includes an `EVIDENCE-FIRST RULE`.
  - Review prompt includes "If tests pass, the implementation is CORRECT" and "DEFAULT is PASS".

Runtime UX verification:
- Multi-line `/code` input now correctly entered `controller` instead of chat.
- This fixes the P39 input routing failure.
- Controller took about 69-75 seconds before showing the approval card.

Critical failure:
- The approval card still hallucinated the product requirement.
- Actual test evidence requires the output shape to remain exactly `["id", "total", "status"]`.
- Controller Product Intent instead said `summarizeOrder` should return `subtotal`, `discount`, `tax`, and `total`.
- This contradicts `test/summarizeOrder.test.js`, especially the `preserves output shape` test.
- The directive was rejected/cancelled before Worker execution; approving it would violate PEAN's evidence-first principle.

Post-check:
- `src/summarizeOrder.js` remained at the failing baseline.
- Fixture post-check still failed 2/4, as expected after cancelling the bad directive.

PM verdict:
- Fixed: multi-line `/code` route.
- Not fixed: Controller evidence grounding.
- Current usability status: still not daily-use ready against CC/Codex/opencode standards. The user cannot trust the approval card yet.
- Next priority: move evidence collection before Controller intent generation. Controller must either inspect source/tests via tools before writing Product Intent, or the engine should insert a pre-controller evidence pack generated by deterministic local scans.

## 2026-05-26 — P41 ToolCard UX Claim Check

Scope:
- Verify the reported ToolCard / auto-approval TUI update without modifying implementation.

Engineering verification:
- `npm run build`: PASS
- `npm test`: PASS, 14 files / 79 tests / 3 gate verification checks
- `npm pack` + global `npm install -g ./kevix-engine-0.1.0.tgz --force --ignore-scripts`: PASS

Confirmed implementation:
- `src/cli/ink/StreamView.tsx` now defines `ToolCard` and `buildToolCard`.
- `src/cli/ink/app.tsx` stores pending tool args and renders cards from `tool_result`.
- Low-risk auto-approval exists in `onApprovalRequired`.

PM findings:
- ToolCard rendering exists, so the interface is moving away from naked logs.
- The current card title uses raw lowercase tool names such as `read(...)` / `edit(...)`, not yet the polished `Read(...)` / `Update(...)` style.
- The reported `Update(...): Added 12, removed 3` is not reliably supported by the current tool result contract. `executeEdit` still returns text like `Replaced 1 occurrence in <file>`, not a real diff. `buildToolCard` counts plus/minus characters in `resultContent`, which can produce misleading added/removed numbers unless tools emit actual diff data.
- Low-risk auto-approval is too shallow: it checks red flags string equality and simple keywords (`api`, `serialize`, `protocol`). It does not yet account for tests/source evidence, changed files, or directive confidence.

Verdict:
- Build/install: PASS.
- ToolCard direction: PASS as a first UI layer.
- Diff evidence claim: NOT VERIFIED / likely misleading until edit/write tools emit structured diff summaries.
- Auto-approve safety: NOT READY for real default use. It should wait for pre-controller evidence confidence and/or deterministic risk signals.

## 2026-05-26 — P42 Structured Diff + Evidence-confidence Claim Check

Scope:
- Verify the reported structured diff / evidence-confidence auto-approve update.

Engineering verification:
- `npm run build`: PASS
- `npm test`: PASS, 14 files / 79 tests / 3 gate verification checks
- `npm pack` + global `npm install -g ./kevix-engine-0.1.0.tgz --force --ignore-scripts`: PASS
- `kevix --version`: `kevix v0.1.0`

Confirmed implementation:
- `EngineEvent.tool_result` now includes optional `added_lines` and `removed_lines`.
- `src/cli/ink/StreamView.tsx` accepts structured `addedLines` / `removedLines` and displays `Added X, removed Y`.
- `src/cli/ink/app.tsx` passes `(e as any).added_lines` and `(e as any).removed_lines` into `buildToolCard`.
- `src/loop/agent-loop.ts` emits diff stats into `tool_result` when `toolName` is `edit` or `write`.
- `onApprovalRequired` now includes an evidence-confidence path and a `Need review — intent not fully grounded` warning path.

Critical caveats:
- The current diff stats are computed from `result.content` via `computeDiff(result.content)`.
- `executeEdit` still returns text like `Replaced 1 occurrence in <file>`, not a unified diff.
- `executeWrite` still returns text like `Wrote N bytes to <file>`, not a unified diff.
- Therefore, the structured diff fields exist, but they may be absent for normal edit/write calls unless tool results actually contain diff-like lines.
- Evidence-confidence computes `hasTestEvidence` from `changedFiles`, but that variable is not used in the auto-approve condition. The current condition is mainly `!hasRedFlags && !hasWireRisk && intentGrounded`.

Verdict:
- Build/install: PASS.
- Structured field plumbing: PASS.
- Real structured diff evidence: PARTIAL / not fully closed. The tool layer still needs to emit actual diff metadata or the engine must compute diffs from file snapshots before/after tool execution.
- Evidence-confidence auto-approve: PARTIAL. It is better than the previous red-flag-only check, but it still does not truly require test/source evidence.

Required next correction:
- For `edit`: compute added/removed from `old_string` and `new_string`, or snapshot file before/after and compute a real unified diff.
- For `write`: snapshot old file content before write, compare with new content, and emit real `added_lines`, `removed_lines`, and optional `unified_diff_preview`.
- Auto-approve must require an actual evidence signal, not just directive length.

## 2026-05-26 — P43 Edit Diff Source + Evidence-confidence Recheck

Scope:
- Verify the reported second-pass fix for edit/write diff metadata and evidence-confidence auto-approve.

Engineering verification:
- `npm run build`: PASS
- `npm test`: PASS, 14 files / 79 tests / 3 gate verification checks
- `npm pack` + global `npm install -g ./kevix-engine-0.1.0.tgz --force --ignore-scripts`: PASS
- `kevix --version`: `kevix v0.1.0`

Confirmed implementation:
- `computeDiff(content, toolName, args)` now branches by tool.
- For `edit`, diff stats are computed from `args.old_string` and `args.new_string`, not from `Replaced 1 occurrence`.
- For `write`, the implementation only uses diff-like `result.content` when present, otherwise it does not fake added/removed.
- `buildToolCard` reads `added_lines` / `removed_lines` fields from the event.
- The approval path now checks whether the directive mentions file-like paths and test/spec/assert/expect terms, and displays `Need review — intent not evidence-grounded...` when missing.

Remaining caveats:
- `edit` diff stats are now meaningfully grounded in tool args. This is acceptable for first-pass ToolCard evidence.
- `write` still does not snapshot old/new file contents, so it cannot reliably produce added/removed for ordinary write operations. It safely avoids fake stats, which is acceptable but incomplete.
- The `evidenceBased` check is still text-based: it checks directive content for file references and test keywords. It does not prove the controller actually read test/source files.
- Current auto-approve condition still permits auto-approval when `intentComplete && !hasRedFlags && !hasWireRisk`, even if `evidenceBased` is false. This is better than before but not yet the strict evidence-first policy.

Verdict:
- Build/install: PASS.
- Edit diff evidence: PASS for the common `edit` tool path.
- Write diff evidence: PARTIAL; no fake stats, but no snapshot-based diff yet.
- Evidence-confidence auto-approve: PARTIAL; improved, but still not strict enough to guarantee source/test grounding.

Next correction:
- If the product goal is CC/Codex-level trust, auto-approve should require `evidenceBased === true` or a deterministic pre-controller evidence pack.
- Add tests for:
  1. edit old/new string produces correct added/removed.
  2. write without diff does not show fake added/removed.
  3. auto-approve does not happen when directive lacks test/source evidence.

## 2026-05-26 — P44 Minimal Evidence Fast Path Check

Scope:
- Verify the reported Minimal Evidence Fast Path update.

Engineering verification:
- `npm run build`: PASS
- `npm test`: PASS, 14 files / 79 tests / 3 gate verification checks
- `npm pack` + global `npm install -g ./kevix-engine-0.1.0.tgz --force --ignore-scripts`: PASS
- `kevix --version`: `kevix v0.1.0`

Confirmed implementation:
- TUI now pushes `Inspecting local evidence...` immediately before Controller.
- TUI scans task-mentioned file paths matching `src|lib|tests?|app/...`.
- TUI attempts a simple same-name test variant for found `src/...` files.
- TUI reports either `Found N evidence file(s) (Xms)` or `Low evidence — will inspect source first (Xms)`.
- `computeDiff` has large-result guards: `content.length > 200_000` or `> 3000` lines returns null.

Critical caveats:
- The fast scan is currently UI-local and only detects explicit file paths in the user task. It does not inspect failing test output, package/test config, same-directory tests, or function/export shape.
- The found evidence is not passed into `runAgentLoop` or Controller prompts, so it improves UI feedback but does not yet ground Controller reasoning.
- Auto-approve still allows `Confident — auto-approved` when `evidenceBased` is false, because `confidenceHigh = intentComplete && (evidenceBased || !hasRedFlags)`.
- Therefore, the report line `Evidence-based 才 auto-approve` is not true yet.
- Large diff skipping is implemented against `result.content`, not actual file size snapshots. It prevents expensive display parsing, but it is not yet a complete large-file write strategy.

Verdict:
- Fast visible feedback: PASS.
- Minimal explicit-file evidence scan: PASS as a first UI signal.
- Controller grounding from evidence: NOT IMPLEMENTED.
- Strict evidence-based auto-approve: FAIL / not yet true.
- Large diff skip: PARTIAL.

Next correction:
- Pass `foundEvidence` or a compact evidence pack into Controller `hints`.
- Change auto-approve condition to require `evidenceBased === true` or `foundEvidence.length > 0` plus no red flags/wire risk.
- Add tests for: explicit file evidence found, no evidence triggers review, and auto-approve cannot happen without evidence.

## 2026-05-26 — P45 Evidence Hints + Strict Auto-approve Recheck

Scope:
- Verify the reported fixes:
  1. `foundEvidence` is passed to Controller hints.
  2. Controller is explicitly told to ground Product Intent in evidence files.
  3. auto-approve requires evidence-based grounding.
  4. no-evidence path goes to Need Review, not confident auto-approve.

Engineering verification:
- `npm run build`: PASS
- `npm test`: PASS, 14 files / 79 tests / 3 gate verification checks
- `npm pack` + global `npm install -g ./kevix-engine-0.1.0.tgz --force --ignore-scripts`: PASS
- `kevix --version`: `kevix v0.1.0`

Confirmed implementation:
- TUI creates `evidenceHints`:
  - `Evidence files found: ... Use these to ground Product Intent.`
  - or `No evidence files found. Worker MUST inspect source before making changes.`
- `runAgentLoop` is called with `hints: evidenceHints`.
- `evidenceBased` now checks directive file/test references and whether directive references found evidence.
- The previous `Confident — auto-approved` branch is gone.
- If `!evidenceBased`, TUI pushes `Need review — intent not evidence-grounded`.
- Auto-approve path is now `Evidence-based — auto-approved` only when no red flags, no wire risk, and directive is complete.

Caveat:
- The evidence pack is still plain-text hints plus regex matching, not a typed evidence schema.
- `directiveRefsEvidence` uses string transformations such as `tests/` -> `src/` and `.test` removal. This is acceptable as a first pass but may miss nonstandard layouts or create false confidence.

Verdict:
- P43 requirements: PASS with caveat.
- Next hardening should be schema-based evidence:
  - `{ sourceFiles: [], testFiles: [], failingOutput?: string, confidence: "high|low" }`
  - Controller receives this as a structured block, not a prose hint.

## 2026-05-26 — P46 Real TUI Usability Run Against Composer Fixture

Scope:
- Use Kevix from the interactive TUI, not by direct engine invocation.
- Complete a real small coding task in `/Users/kev/kevix/validation/composer-long-001`.
- Evaluate usability against CC/Codex-style coding agents from a PM perspective.

Task submitted in TUI:
- First line: `/code`
- Task: `Fix src/summarizeOrder.js so npm test passes. Do not edit tests. Keep summarizeOrder export.`

Pre-run baseline:
- `src/summarizeOrder.js` was 8 lines and ignored item quantity / validation.
- `npm test`: 2/4 passing, 2/4 failing.
- Engine self-check before run: `npm run build && npm test`: PASS, 79/79 tests.

Observed TUI behavior:
- Code-mode routing worked: the multi-line `/code` input entered Controller instead of chat.
- Fast evidence scan returned in 12ms and found `src/summarizeOrder.js`.
- Fast evidence scan missed `test/summarizeOrder.test.js`, even though Worker later found and read it. Likely cause: scan maps `src/...` to `tests/...`, but the fixture uses singular `test/...`.
- Controller took roughly 92 seconds before showing the approval card.
- Controller Product Intent no longer hallucinated the prior wrong `subtotal/discount/tax` shape. It was broadly correct but still generic.
- TUI showed `Need review — risk detected`, requiring approval for a small local bugfix.
- After approval, Worker read:
  - `src/summarizeOrder.js`
  - `test/summarizeOrder.test.js`
  - `package.json`
- Worker ran tests and eventually produced a correct implementation.
- Worker displayed tool cards, but several cards are still hard to interpret:
  - `glob` repeated three times without query labels.
  - `bash(npm test 2>&1)` output is truncated at `# Subtest: computes qu`, hiding the actionable failure details.
  - A bare `bash` card appeared with no command label.
- Gate/control-plane issues:
  - `bash` was blocked for `/home/user/repo`, then recovered with `pwd && ls -la`.
  - `write` and `edit` were blocked for `src/summarizeOrder.js` because `src/` was treated as a Red Flag.
  - This is a serious false-positive: the user explicitly asked to modify `src/summarizeOrder.js`, while tests were the forbidden files.
  - Later a `bash` command referencing `/summarizeOrder.js` was also blocked.
- Worker ran for over 240 seconds on a tiny 8-line function task. I killed the TUI process manually.

Post-run verification:
- Final `src/summarizeOrder.js` handles:
  - missing order
  - empty items
  - invalid price
  - invalid quantity
  - default quantity = 1
  - rounded quantity-aware total
- `npm test`: PASS, 4/4 tests passing.
- No lingering `kevix` process after manual kill.

Usability verdict:
- Capability result: PASS. Kevix solved the task and made tests green.
- Interaction quality: FAIL for daily-use readiness against CC/Codex/OpenCode expectations.
- The current TUI proves the harness can work, but the user experience still feels slow, over-cautious, and not yet trustworthy.

Key product gaps:
- Time-to-first-useful-feedback is too high: local evidence is fast, but Controller still waits roughly 92s before a user can act.
- Completion latency is too high: a tiny bugfix exceeded 240s in Worker.
- Gate policy over-blocks valid target edits: `src/` should not become a red flag when the user explicitly requested a file inside `src/`.
- Tool cards need higher information density and better labeling: repeated glob/bare bash/truncated test output are not enough for a user to understand progress.
- Approval should be risk-calibrated: low-risk source-only fixes with test evidence should not feel like security incidents.
- Result state is missing: after a task succeeds, the user needs an explicit summary with files changed, tests run, gates triggered, cache/cost, and next action.

PM requirement direction:
- Treat this as a successful engine run but an unsuccessful interaction run.
- Next milestone should be "CC/Codex-level task readability and control recovery", not more benchmark data.

## 2026-05-26 — P47 New User Router + Latency Usability Recheck

Scope:
- Recheck the reported P44/P45 usability fixes from a new-user perspective.
- Fixture: `/private/tmp/kevix-usability-fixture`.
- User action: start `kevix`, do NOT type `/code`, directly submit `fix bug in src/summarizeOrder.js so npm test passes`.

Baseline:
- `npm test`: 2/4 passing, 2/4 failing before Kevix run.

Observed improvements:
- Coding task router now routes the plain `fix bug...` input into the code pipeline instead of plain chat.
- The prior chat-mode pseudo-tool-call failure did not recur in this run.
- TUI immediately showed `Inspecting local evidence...`.
- Evidence scan returned quickly: `Found 1 evidence file(s) (24ms): src/summarizeOrder.js`.
- Approval card eventually appeared and was better than the previous hallucinated version:
  - It stated the return should be an object, not a string.
  - It referenced the expected shape `{ id, total, status }`.
  - It instructed Worker to run `npm test`, open the failing test file, and read exact assertions.

Remaining usability failures:
- Test discovery is still incomplete: it found only `src/summarizeOrder.js`, not `test/summarizeOrder.test.js`.
- Latency fallback did not meet product expectations:
  - Controller showed only `waiting...` until roughly 65 seconds.
  - The claimed `Analyzing task... (complex tasks may take a moment)` message was not visible in the observed TUI.
  - No action choices were offered before the approval card.
- During the wait, the visible task/evidence text disappeared in later frames, leaving mostly spinner + status bar; this reduces trust.
- Approval appeared only after roughly 65 seconds, still too slow for a tiny single-file task.
- The approval card says `Based on: src/summarizeOrder.js`, but the directive depends on a "companion test suite" that was not included in the evidence list.

Verdict:
- Coding router: PASS.
- Chat pseudo-tool-call guard: PASS in this run.
- Test discovery: FAIL / incomplete.
- Latency fallback: FAIL from a usability perspective.
- Evidence-grounded approval card: PARTIAL.

Next required fixes:
- Evidence scan must include `test/`, `tests/`, `__tests__/`, `*.test.*`, and `*.spec.*`.
- Approval card should not claim test-grounded reasoning unless the test file is listed in `Based on`.
- Controller waiting state needs a real 10s/30s fallback path with visible choices.
- For simple local tasks, consider a fast path that runs local evidence/test discovery before invoking the full Controller.

## 2026-05-26 — P48 Test Discovery + Latency Fallback Recheck

Scope:
- Recheck reported fixes:
  1. Test discovery supports `test/`, `tests/`, `__tests__/`, `spec/`, `.test.*`, `.spec.*`.
  2. 10s/30s latency messages are visible.
  3. Approval card lists both source and test evidence.
- Fixture: `/private/tmp/kevix-usability-fixture`.
- User action: start `kevix`, submit `fix bug in src/summarizeOrder.js so npm test passes` without `/code`.

Observed improvements:
- Coding router still works: plain `fix bug...` entered the controller/code path.
- Test discovery now works for this fixture:
  - TUI showed `Found 2 evidence file(s) (24ms): src/summarizeOrder.js, test/summarizeOrder.test.js`.
- 10-second latency message is visible:
  - TUI showed `Analyzing task and evidence...` around 10 seconds.
- Approval card now lists complete evidence:
  - `Based on: src/summarizeOrder.js, test/summarizeOrder.test.js`.
- Approval card is substantially more grounded:
  - It says the return must be an object and must match the test suite.
  - Worker directive explicitly tells Worker to open both source and test and inspect exact assertions.

Remaining issues:
- 30-second fallback did not provide an actionable choice in the observed run.
  - After 30s, TUI continued to show mostly `waiting...`; I did not see a visible `Controller taking longer...` action panel.
- Long-wait readability still degrades:
  - Around 45s+, the visible task/evidence text disappeared in repeated frames, leaving mainly spinner + status bar.
- Approval card appeared around 57s. This is improved versus 65-133s prior runs but still too slow for a tiny single-file bugfix.
- Product Intent still contains small speculative wording (`zero items`, `missing discount`) that may not be directly evidenced by the tests. Less severe than prior hallucinations, but still not ideal.

Verdict:
- Coding router: PASS.
- Test discovery: PASS for this fixture.
- 10s latency message: PASS.
- 30s actionable fallback: FAIL / not observed.
- Evidence-grounded approval card: PASS with minor wording caveat.
- New-user path: IMPROVED, but not yet CC/Codex-level because the user still waits nearly a minute before approving a tiny task.

Next required fixes:
- At 30s, show an actionable control panel:
  - `[F] Fast local plan`
  - `[W] Wait`
  - `[C] Cancel`
- Preserve task/evidence context during long waits; do not let the screen collapse to spinner-only.
- Add a simple-task fast path for source+test evidence cases to avoid full Controller latency.

## 2026-05-26 — P49 Latency Actions + End-to-End Usability Recheck

Scope:
- Recheck reported P49 latency action card and fast/cancel controls.
- Fixture: `/private/tmp/kevix-usability-fixture`.
- User action: start `kevix`, submit `fix bug in src/summarizeOrder.js so npm test passes` without `/code`.
- Baseline before previous Kevix run: `npm test` had 2/4 passing, 2/4 failing.

Observed improvements:
- Coding router still works: plain `fix bug...` entered the code pipeline.
- Evidence scan works and is fast:
  - `Found 2 evidence file(s) (20ms): src/summarizeOrder.js, test/summarizeOrder.test.js`.
- 10s latency message works:
  - TUI showed `Analyzing task and evidence...`.
- Actionable latency card exists:
  - TUI showed `Controller taking longer than expected` with `[F] Fast local plan`, `[W] Wait`, `[C] Cancel`.
- Worker tool cards are much closer to a real workbench:
  - `read(test/summarizeOrder.test.js)` -> `28 lines`.
  - `read(src/summarizeOrder.js)` -> `8 lines`.
  - `read(package.json)` -> `7 lines`.
  - Bash/test output is summarized in a card.
- Functional outcome succeeded despite UX issues:
  - After stopping the hanging TUI and checking manually, `/private/tmp/kevix-usability-fixture/src/summarizeOrder.js` had been fixed.
  - `npm test` passed 4/4.
  - Cache reached 96-98% during Worker calls.

Usability failures found:
- Latency card timing is still not product-grade:
  - In the observed run, the actionable card appeared around 43-44s, not reliably at 30s.
- Stale card bug:
  - After Controller produced the approval card, the old `Controller taking longer than expected` card stayed visible underneath.
  - This creates conflicting state: the screen simultaneously says `Directive Ready` and `Controller taking longer`.
- Focus/hotkey ambiguity:
  - Pressing `f` while the latency card was visible did not trigger Fast mode.
  - The visible selection remained on `[W] Wait`, while the active interaction was actually the approval card.
- Approval/latency state collision:
  - User sees two action panels and cannot know whether Enter approves directive, waits, or confirms the latency choice.
- Red Flag / scope contradiction:
  - Approval card says `src/summarizeOrder.js` is the intended target / in scope.
  - Gate then reports `edit: File "src/summarizeOrder.js" is in Red Flags: "src/summarizeOrder.js"` and blocks edit/write.
  - This is a trust-breaking contradiction: the system tells Worker to modify a file and then blocks that same file as forbidden.
- Worker recovery is too noisy:
  - After the false red-flag block, Worker tried extra bash/read commands and eventually fixed the file, but the user experience looked like confusion rather than controlled recovery.
- Cancel/interrupt failed from user perspective:
  - Ctrl+C and Esc did not immediately return the TUI to a clean prompt.
  - I had to kill the `node /Users/kev/.npm-global/bin/kevix` process externally.
- Completion state failed:
  - Although the file was fixed and tests passed, the TUI did not present a clean Result card or return control within a reasonable time.

Verdict:
- Functional engine result: PASS for this fixture (`npm test` 4/4 after run).
- Evidence scan: PASS.
- 10s latency feedback: PASS.
- 30s actionable fallback: PARTIAL (exists, late/ambiguous).
- Fast `[F]` path: FAIL / not usable in observed interaction.
- Cancel/escape path: FAIL.
- Gate/directive consistency: FAIL.
- Product usability vs CC/Codex/OpenCode: still NOT ready. The engine can do the work, but the user cannot reliably understand or control the work.

Next required fixes:
1. Clear stale latency card once Controller returns or approval card appears.
2. Ensure only one active action panel owns keyboard focus at a time.
3. Make `[F]`, `[W]`, `[C]` hotkeys global while the latency card is active, or remove hotkey labels.
4. Fix directive-to-gate contract: files in Worker target/scope must not be treated as Red Flags.
5. Add hard stop behavior: Ctrl+C/Esc should cancel current task and return to prompt within 1 second.
6. Add Result card once tests pass or the Worker stops: files changed, tests run, gates triggered, cache, elapsed, next actions.

## 2026-05-26 — P50 Recheck After Stale Card / Gate / Cancel / Result Fixes

Scope:
- Recheck user-reported fixes after P49:
  1. Clear stale fallback when approval appears.
  2. Remove target file from Red Flags via `sanitizeDirectiveForProblem`.
  3. Hard cancel returns to prompt.
  4. Result card displays files/tests/gates/cache/next action.
- Fixture: `/private/tmp/kevix-usability-fixture`.
- User action: start `kevix`, submit `fix bug in src/summarizeOrder.js so npm test passes` without `/code`.
- Fixture was reset before run: `npm test` = 2/4 passing, 2/4 failing.

Observed passes:
- Build/test baseline for Kevix: global `kevix v0.1.0`; engine test suite `79 passed`.
- Coding router works: plain natural-language bugfix entered code pipeline.
- Evidence scan works and is fast:
  - `Found 2 evidence file(s) (10ms): src/summarizeOrder.js, test/summarizeOrder.test.js`.
- Stale fallback card is fixed in the approval state:
  - When approval card appeared, the old `Controller taking longer` card was not visible underneath.
- Approval card is more evidence-grounded:
  - `Based on: src/summarizeOrder.js, test/summarizeOrder.test.js`.
  - Product Intent is test-grounded and says `npm test` should exit with zero failures.
  - Red Flags visually list tests/config/out-of-scope files, not the target file.
- Worker tool cards are readable:
  - `read(test/summarizeOrder.test.js) -> 28 lines`.
  - `read(src/summarizeOrder.js) -> 8 lines`.
  - `read(package.json) -> 7 lines`.
- Result card exists and returns control:
  - `✓ Task Complete`.
  - `Phases: controller → worker → assess`.
  - `Tests: ✓ PASS`.
  - `Calls: 15 | Cache: 90% | Gates: 4 | 233s | ~$0.0248`.
  - `Next: /again to re-run | /history to review | type new task`.
  - Prompt returned as `kevix/code ›`.
- External verification after TUI:
  - `npm test` passed 4/4.
  - No lingering `kevix` process remained.

Remaining failures / concerns:
- Directive-gate contract is still not truly fixed at runtime:
  - TUI still showed `edit: File "/private/tmp/kevix-usability-fixture/src/summarizeOrder.js" is in Red Flags: "src/summarizeOrder.js"`.
  - TUI also showed `write: File ...src/summarizeOrder.js is in Red Flags`.
  - The approval card no longer displays target as Red Flag, but the gate still blocks the target file internally.
- Worker succeeded by workaround, not by clean edit path:
  - It used extra bash/read/write-like operations after gate blocks.
  - This makes the work trace look confused and risky even though the final code is correct.
- Bash path rendering / command display has bugs:
  - `bash(ivate/tmp/kevix-usability-fixture && npm test 2>&1)` appears truncated/malformed.
  - `bash(/tmp/kevix-usability-fixture/src/summarizeOrder.js)` is not understandable as a user-facing command label.
  - Bash gate reports references like `/home/user/repo` and `/summarizeOrder.js`, which look like model hallucinations leaking into UX.
- Latency is still high for a tiny task:
  - Approval appeared around 41s.
  - Completion took 233s and 15 calls.
  - This is functionally acceptable for an agent, but still below CC/Codex/OpenCode perceived responsiveness for a tiny fixture.
- Gate count is shown as 4 in the successful result, but the user cannot tell which gates were helpful vs false-positive noise.

Verdict:
- Functional task completion: PASS.
- Result card / return control: PASS.
- Stale fallback card: PASS.
- Approval evidence quality: PASS.
- Hard cancel after completion/exit: PASS for ending session; not re-tested mid-worker because task reached result.
- Directive-gate runtime consistency: FAIL.
- Work trace clarity: PARTIAL.
- Product usability level: improved, but still not CC/Codex/OpenCode-level until gate false positives and malformed bash labels are fixed.

Next required fixes:
1. Fix gate source of truth: allowed target/scope files must be passed into Red Flag Gate and override red-flag string matches.
2. Add result-card gate breakdown: separate `blocked helpful` vs `false-positive/recovered` gates.
3. Fix bash tool labels: show normalized shell command or short command summary, never truncated fragments.
4. Reduce tiny-task path latency: for source+test evidence, consider optional fast controller or compact controller prompt.

## 2026-05-26 — P51 Recheck: Gate Contract / Tool Labels / Result Breakdown

Scope:
- Recheck reported P51 fixes:
  1. `targetFiles` whitelist prevents target file from being blocked by Red Flag Gate.
  2. Tool labels render as readable `bash(npm test)` / `edit(file)` style labels.
  3. Result card distinguishes useful gate blocks from recovered false positives.
- Fixture: `/private/tmp/kevix-usability-fixture`.
- User action: start `kevix`, submit `fix bug in src/summarizeOrder.js so npm test passes` without `/code`.
- Fixture was reset before run: `npm test` = 2/4 passing, 2/4 failing.

Observed passes:
- Kevix build/test baseline: global `kevix v0.1.0`, engine `79 passed`.
- Coding router still works: plain task entered code pipeline.
- Evidence scan remains fast and correct:
  - `Found 2 evidence file(s) (14ms): src/summarizeOrder.js, test/summarizeOrder.test.js`.
- Graph context is now visible in the initial task state:
  - `graph: 1 tasks, 7 patterns`.
- Stale fallback card did not appear under the approval card.
- Reject did eventually return to the prompt; fixture was not modified.

New failure found:
- Controller produced a wrong directive despite correct evidence files:
  - Claimed `summarizeOrder` accepts a `cart array`.
  - Claimed return shape should include `orderId`, `total`, `status`, `itemCount`.
  - Claimed `orderId` should be timestamp-based and status should be `pending/empty`.
- Actual fixture/test expects an `order` object with `{ id, total, status }`, quantity-aware totals, and validation errors.
- This is not a minor wording issue. It is a task-invalidating hallucination inside the approval card.

Usability observations:
- Approval card did its job in the sense that a careful user can reject the bad directive.
- However, a new user could easily approve this because the card is long and looks authoritative.
- The TUI should flag this as low-confidence because Product Intent introduces entities not found in evidence (`cart`, `orderId`, timestamp, `pending/empty`).
- Reject selection had poor responsiveness:
  - Moving selection to `Reject` worked.
  - Pressing Enter did not visibly respond for several seconds; final rejection appeared around 79s.
- Rejected task result semantics are wrong:
  - TUI showed `✓ Task Complete`, `Review: PASS`, and `Next: /again...` after rejection.
  - This should be `Task Cancelled` or `Directive Rejected`, not a successful completion.

Not fully verifiable in this run:
- Target-file gate contract and tool labels were not exercised because the correct user action was to reject the invalid directive before Worker.
- Since the directive itself was wrong, approving it would be an invalid usability path and would not be a fair test of the Worker fixes.

Verdict:
- Evidence scan: PASS.
- Stale fallback cleanup: PASS.
- Approval safety as a concept: PASS, because it allowed catching a bad directive before edits.
- Controller evidence grounding: FAIL.
- Reject/cancel semantics: FAIL / misleading result card.
- Target-file gate whitelist: NOT VERIFIED in this run due bad directive.
- Tool label cleanup: NOT VERIFIED in this run due bad directive.
- Product usability: still blocked. The top priority shifted from Worker gate polish to Controller evidence-faithfulness and rejection semantics.

Next required fixes:
1. Add directive-evidence validator before showing Approve:
   - Product Intent may only mention symbols/files/shapes found in source/test evidence or user task.
   - Flag invented entities like `cart`, `orderId`, timestamp, `pending/empty` as `low confidence`.
2. Add a `Regenerate directive` action on approval cards:
   - Options should be `Approve`, `Regenerate`, `Reject`.
   - Regenerate should feed the mismatch evidence back to Controller.
3. Fix rejected task result semantics:
   - Rejection should show `Task Cancelled — directive rejected`, not `Task Complete` / `Review: PASS`.
4. Re-run P51 Worker path only after Controller produces a correct directive for this fixture.

## 2026-05-26 — P52 Recheck: Directive Validity Control Plane / Regenerate / Worker Completion

Scope:
- Recheck reported P52 fixes:
  1. Evidence validator compares Controller directive with evidence.
  2. Low-confidence directive defaults to Regenerate.
  3. Regenerate reruns Controller with stronger evidence hints.
  4. Approval card has Approve / Regenerate / Reject.
- Fixture: `/private/tmp/kevix-usability-fixture`.
- User action: start `kevix`, submit `fix bug in src/summarizeOrder.js so npm test passes` without `/code`.
- Fixture reset before run: `npm test` = 2/4 passing, 2/4 failing.

Observed passes:
- Build/test baseline: global `kevix v0.1.0`, engine `79/79` tests passing.
- Coding router works: plain natural-language task entered code pipeline without explicit `/code`.
- Evidence scan is immediate and useful:
  - `Found 2 evidence file(s) (7ms): src/summarizeOrder.js, test/summarizeOrder.test.js`.
- Approval card now exposes the P52 control plane:
  - Low-confidence directive defaulted to `Regenerate` instead of `Approve`.
  - Options include Regenerate, Approve, Reject.
- Regenerate path works mechanically:
  - Pressing Enter on Regenerate reran Controller.
  - New Controller prompt included explicit evidence instructions:
    `EVIDENCE: src/summarizeOrder.js, test/summarizeOrder.test.js. INSTRUCTIONS: read test first, do NOT invent fields...`.
- Manual approve allowed Worker to proceed.
- Worker completed the fixture successfully:
  - Result card: `✓ Task Complete`.
  - Phases: `controller → worker → assess`.
  - Tests: PASS.
  - Calls: 12, cache: 89%, gates: 1, elapsed: 264s.
- External verification after TUI exit:
  - `npm test` = 4/4 passing.
  - Final source correctly handles null order, missing/invalid items, default quantity, negative price, quantity-aware total, rounding, and preserves `{ id, total, status }`.
- Tool cards improved for file reads:
  - `read(summarizeOrder.test.js)` and `read(summarizeOrder.js)` are readable and CC-like enough for basic tracing.
- No lingering kevix/node process after exit.

Failures / usability gaps:
- Evidence validator is too noisy and over-strict:
  - First low-confidence reason: `directive invents entities not in evidence: product, intent, need, read, source`.
  - Second low-confidence reason: `product, intent, need, files, before`.
  - These are ordinary directive/control words, not invented domain entities.
  - This creates a Regenerate loop risk even when the directive is actually safe.
- Regenerate improved safety but did not clear false positives:
  - The regenerated directive correctly instructed Worker to read the test first and only modify `src/summarizeOrder.js`.
  - It did not invent the previous bad entities (`cart`, `orderId`, timestamp, `pending/empty`).
  - But validator still defaulted to Regenerate because generic words were misclassified as invented entities.
- Evidence list has duplicates / inflated count after regenerate:
  - It displayed `Found 5 evidence file(s)` while repeating `src/summarizeOrder.js` and still representing basically two core files.
- Low-confidence warning persists into Worker after the user approves:
  - The banner remains visible above Worker logs, creating noise and undermining the meaning of approval.
  - After approval, it should either collapse into a small audit note or disappear from active phase UI.
- Worker latency remains a major product issue:
  - The task took 264s for a tiny 26-line source file and 28-line test file.
  - Functional success is real, but this is not yet CC/Codex-level responsiveness.
- Bash tool labels are still not product-grade:
  - Observed `bash(pwd &&)` and `bash(cd /private/tmp/kevix-usability-fixture)`.
  - One warning referenced `/home/user/repo`, which is confusing in a local fixture rooted at `/private/tmp/kevix-usability-fixture`.
  - Labels should summarize command intent (`bash(npm test)`, `bash(check cwd)`) and hide implementation path noise.
- Test output snippets are too truncated:
  - Tool card showed only partial TAP output (`# Subtest: computes qu...`) before later success.
  - A user cannot confidently understand what failed or passed from the card alone.

Verdict:
- Functional task completion: PASS.
- P52 Regenerate control plane mechanics: PASS.
- Controller hallucination protection direction: PASS.
- Validator precision: FAIL / too many false positives.
- Evidence dedupe: FAIL.
- Worker trace readability: PARTIAL.
- Responsiveness: FAIL for tiny task UX, despite eventual success.
- Product usability level: improving, but still below CC/Codex/OpenCode because false-positive validation, long latency, and noisy tool cards force the user to babysit the run.

Next required fixes:
1. Replace naive invented-entity detection with evidence-aware symbol extraction:
   - Only compare identifiers, string literals, file paths, exported function names, object field names, and test assertion terms.
   - Ignore directive boilerplate words like product, intent, need, read, source, files, before.
2. Deduplicate evidence files before display and before validator input.
3. After user approves a low-confidence directive, collapse the warning into an audit line instead of keeping a large active banner in Worker.
4. Improve bash label normalization:
   - `npm test`, `git diff`, `pwd`, `check cwd`, etc.
   - Never show truncated fragments like `pwd &&`.
5. Add a tiny-task fast path target:
   - For source+test evidence under a small size threshold, aim for <90s end-to-end or provide an explicit `Fast` path before Controller.
6. Expand tool result cards:
   - Show final test summary (`4 passed, 0 failed`) prominently, with expandable raw output.

## 2026-05-26 — P53 Static Check: Validator Precision Regression

Scope:
- Check reported P53/P52 precision fix without trusting the summary table.
- Files inspected: `/Users/kev/kevix/engine/src/cli/ink/app.tsx`.
- Build/test baseline: `npx tsc --noEmit && npx vitest run` = 79/79 passing.

Observed implementation:
- Entity extraction now limits terms to file paths, camelCase/PascalCase, snake_case, and a small field-name list.
- Boilerplate filter now includes directive words such as product/intent/need/worker/directive/constraints.
- Low-confidence approval selection defaults to Regenerate.
- Approval resolve clears the approval card after user action.

Critical regression found:
- Evidence validator still builds `evidenceTerms` from evidence file *paths* plus user task only:
  - `extractTerms(evidenceRef.current.join(" ") + " " + taskRef.current)`
- It does not read or index evidence file contents.
- Therefore a correct directive that mentions actual test/source fields can still be flagged as invented when those terms are absent from the filename or user task.

Minimal reproduction:
- Evidence text: `src/summarizeOrder.js test/summarizeOrder.test.js fix bug in src/summarizeOrder.js so npm test passes`
- Correct directive: `Fix summarizeOrder so it reads order.items, multiplies price by quantity, returns { id, total, status }, and throws for invalid order.`
- Current extractor result:
  - evidenceTerms: `src/summarizeorder.js`, `test/summarizeorder.test.js`, `summarizeorder`
  - directiveTerms: `summarizeorder`, `order`, `items`, `id`, `total`, `status`
  - invented: `order`, `items`, `total`, `status`
- This contradicts the claim that `summarizeOrder/id/total/status` will not be misclassified.

Secondary issue:
- Evidence dedupe is only applied to `evidenceRef.current`.
- UI display and `evidenceHints` still use `foundEvidence`, not `uniqueEvidence`:
  - `Found ${foundEvidence.length} evidence file(s)`
  - `Evidence files found: ${foundEvidence.slice(0, 3)...}`
- So duplicate/inflated evidence count can still appear in the TUI even if internal ref is deduped.

Verdict:
- Build/test: PASS.
- Boilerplate false positive improvement: PARTIAL.
- Correct-domain-term false positive prevention: FAIL.
- Evidence dedupe display: FAIL.
- Invariant status: still violates Validator Precision invariant.

Required next fix:
1. Build `evidenceTerms` from a lightweight local evidence index, not only paths:
   - read small evidence files already discovered by fast scan
   - extract function names, object fields, string literals, assertion keys, exported symbols
   - size cap: skip files >200KB or >3000 lines
2. Use `uniqueEvidence` for both display and `evidenceHints`.
3. Add regression tests for:
   - correct directive containing `order/items/id/total/status/quantity` should not be Low confidence when these terms exist in evidence file contents
   - invented `cart/orderId/timestamp/pending` should be Low confidence when absent from evidence
   - boilerplate words do not count as invented entities

## 2026-05-26 — P54 Static Check: Evidence Content Index Added, But Invented Entity Recall Regressed

Scope:
- Check reported P54 fix:
  - evidence validator now reads evidence file contents
  - unique evidence is used for UI/hints
  - `id/total/status/quantity/items` should no longer be misclassified
  - `cart/orderId/timestamp/pending` should be caught as invented
- Files inspected: `/Users/kev/kevix/engine/src/cli/ink/app.tsx`.
- Build/test baseline: `npx tsc --noEmit && npx vitest run` = 79/79 passing.

What improved:
- Evidence file contents are now read from `uniqueEvidence` with caps:
  - skip files >200KB
  - skip files >3000 lines
- `evidenceTerms` now includes:
  - evidence paths
  - evidence file contents
  - user task text
- UI display and `evidenceHints` now use `uniqueEvidence`, not raw `foundEvidence`.
- This fixes the previous evidence dedupe display/hints issue.

Critical remaining bug:
- `extractTerms()` now avoids generic lowercase words, which reduces false positives but creates false negatives.
- It extracts:
  - file paths
  - camelCase/PascalCase
  - snake_case
  - a hard-coded field list: id/total/status/name/type/count/size/item/items/order/user/data/value/result
- Therefore invented lowercase domain entities such as `cart`, `timestamp`, and `pending` are not extracted from the directive at all.
- `orderId` is extracted, but the low-confidence threshold is `inventedTerms.length > 2`, so a single invented high-signal entity does not trigger Low confidence.

Minimal reproduction:
- Evidence content includes summarizeOrder test shape: `{ id, total, status }`, `items`, `quantity`.
- Correct directive:
  - `Fix summarizeOrder so it reads order.items, multiplies price by quantity, returns { id, total, status }, and throws for invalid order.`
  - Current result: mostly safe, but may still flag `order` if source content is missing from evidence index.
- Bad directive:
  - `Change summarizeOrder to accept a cart, return orderId, timestamp, and pending status.`
  - Current extractor result:
    - directiveTerms: `summarizeorder`, `orderid`, `status`
    - invented: `orderid`
  - Because only one invented term is counted, current `inventedTerms.length > 2` does NOT mark Low confidence.

Verdict:
- Build/test: PASS.
- Evidence content indexing: PASS.
- Unique evidence display/hints: PASS.
- Correct field false-positive reduction: PARTIAL.
- Invented entity recall: FAIL.
- The reported claim `cart/orderId/timestamp/pending will be caught` is false under the current extractor and threshold.

Required next fix:
1. Split entity classes by severity instead of only counting terms:
   - high-signal invented camelCase/entity fields (`orderId`, `itemCount`) should trigger Low confidence even if count = 1.
   - suspicious lowercase domain nouns in directive sections should be extracted when they appear near return/field/entity/status/type language.
2. Add a denylist only as a guardrail, not as the whole validator:
   - cart/orderId/timestamp/pending/itemCount should be caught for this fixture when absent from evidence.
3. Replace `inventedTerms.length > 2` with weighted scoring:
   - unknown field/path/function = high weight
   - unknown noun near output shape = medium weight
   - boilerplate = zero weight
4. Add regression tests for both sides:
   - `id/total/status/items/quantity/order` present in evidence => no Low confidence
   - `cart/orderId/timestamp/pending` absent from evidence => Low confidence

## 2026-05-26 — P55 Static Check: Weighted Validator Exists, But Rules Do Not Match Behavior

Scope:
- Check reported P55 weighted entity validator:
  - unknown camelCase/PascalCase = high risk, one term triggers Low confidence
  - unknown ordinary nouns >= 2 = Low confidence
  - boilerplate = zero weight
- Files inspected: `/Users/kev/kevix/engine/src/cli/ink/app.tsx`.
- Build/test baseline: `npx tsc --noEmit && npx vitest run` = 79/79 passing.

What improved:
- There is now an `assessConfidence()` function with high-risk and medium-risk buckets.
- Bad directives containing multiple unknown words can trigger Low confidence.
- `cart/timestamp/pending` no longer disappear completely if they appear as ordinary directive words.

Critical behavior mismatch:
- `assessConfidence()` lowercases the entire directive before matching words:
  - `directiveText.toLowerCase().match(...)`
- This destroys camelCase/PascalCase shape before `isHighRiskTerm()` runs.
- Therefore `orderId` becomes `orderid`, and the high-risk camelCase rule does not actually fire.
- In the minimal reproduction, `orderId` was marked Low only because it was counted as a medium-risk word together with `change`, not because one unknown camelCase term triggered high risk.

False positive still present:
- A correct directive can still become Low confidence because ordinary verbs/nouns are counted as medium risk:
  - `fix`, `reads`, `multiplies`, `throws`, `invalid`
- Terms like `quantity` and `price` are not extracted by `extractTerms()` unless they are in the small hard-coded field list or camel/snake case.
- So even if the evidence file contains `quantity` or `price`, they may not become safe evidence terms.

Minimal reproduction results:
- Bad: `Change summarizeOrder to return orderId.`
  - result: Low confidence, but highRisk=[], medRisk=[change, orderid]
  - This proves high-risk camelCase did not work as designed.
- Bad: `Change summarizeOrder to accept cart timestamp pending.`
  - result: Low confidence, medRisk includes change/accept/cart/timestamp/pending.
- Good: `Fix summarizeOrder so it reads order.items, multiplies price by quantity, returns { id, total, status }, and throws for invalid order.`
  - result: Low confidence, medRisk includes fix/reads/order/multiplies/price/quantity/throws/invalid.
  - This violates the requirement that evidence-backed `id/total/status/items/quantity/order` should be safe.

Verdict:
- Build/test: PASS.
- Weighted validator structure: PARTIAL.
- High-risk camelCase behavior: FAIL due lowercasing before shape detection.
- Correct directive false-positive prevention: FAIL.
- Claimed invariant `id/total/status/quantity safe` is not yet proven and currently fails in minimal reproduction.

Required next fix:
1. Preserve original token casing for risk classification:
   - classify `orderId` as high risk before lowercasing for evidence lookup.
2. Expand evidence extraction from file contents:
   - include all identifiers from JS/TS source and tests, not only camelCase/snake_case/small fixed field list.
   - include object keys and property access terms: `.quantity`, `.price`, `quantity:`, `price:`.
3. Restrict medium-risk nouns to semantic zones:
   - only count unknown nouns near output shape, return fields, entity/type/status language.
   - do not count generic task verbs like fix/read/multiply/throw as domain entities.
4. Add direct unit tests for `assessConfidence()`; do not rely on broad TUI tests.

## 2026-05-26 — P55 Recheck After Reported Fix: Not Accepted

Scope:
- Recheck worker claim: `BUILD OK + 79/79 tests`, weighted entity validator complete.
- Checked against PM brief: `/Users/kev/kevix/engine/docs/pm/p55-tui-day1-validator-brief.md`.

Observed:
- Build/test still passes: 79/79.
- No dedicated validator module exists:
  - no `src/cli/ink/evidence-validator.ts`
- No dedicated validator test exists:
  - no `tests/evidence-validator.test.ts`
- Validator logic remains inline in `src/cli/ink/app.tsx`.
- The casing bug remains:
  - `assessConfidence()` still does `directiveText.toLowerCase().match(...)` before risk classification.
  - This destroys camelCase/PascalCase token shape before `isHighRiskTerm()` runs.
- Therefore the reported rule `orderId unknown camelCase -> 1 term triggers Low confidence` is not implemented as specified.

Current code still contains:
```ts
const directiveWords = new Set(
  directiveText.toLowerCase().match(/\b[a-z][a-z0-9_]*\b/gi) ?? []
);
```

Verdict:
- Build/test: PASS but not meaningful for P55.
- Dedicated module: FAIL.
- Dedicated validator tests: FAIL.
- High-risk casing bug: FAIL.
- PM brief compliance: FAIL.
- P55 status: NOT ACCEPTED.

Required correction:
- Worker must follow the P55 PM brief exactly before claiming completion.
- Do not report `BUILD OK` as P55 done unless validator-specific tests exist and pass.

## 2026-05-26 — P55-PM Acceptance: Weighted Entity Validator Precision

Scope:
- Recheck reported P55-PM completion against PM brief:
  - `/Users/kev/kevix/engine/docs/pm/p55-tui-day1-validator-brief.md`
- Files inspected:
  - `src/cli/ink/evidence-validator.ts`
  - `tests/evidence-validator.test.ts`
  - `src/cli/ink/app.tsx`

Validation commands:
- `npx tsc --noEmit`
- `npx vitest run tests/evidence-validator.test.ts`
- `npx vitest run`

Results:
- Dedicated validator test: 9/9 passing.
- Full suite: 88/88 passing.
- Validator module exists and is imported by TUI:
  - `src/cli/ink/evidence-validator.ts`
  - `app.tsx` calls `extractEvidenceTerms()` and `assessDirectiveConfidence()`.
- Previous casing bug fixed:
  - `assessDirectiveConfidence()` extracts raw tokens preserving casing.
  - `orderId` is classified before lower-case evidence lookup.
- Evidence-backed fixture fields are covered by tests:
  - `summarizeOrder`, `id`, `total`, `status`, `items`, `quantity`, `price`.
- Invented-entity regressions are covered by tests:
  - `orderId` high risk.
  - `itemCount` high risk.
  - `cart/timestamp/pending` medium-risk semantic-zone case.
- Boilerplate/action terms are covered by tests:
  - product/intent/read/source/worker/directive/constraints/red flags ignored.
  - fix/reads/multiplies/throws/validates/invalid ignored.

Verdict:
- Dedicated module: PASS.
- Dedicated tests: PASS.
- High-risk casing behavior: PASS.
- Good directive false-positive prevention: PASS by unit test.
- Invented entity recall: PASS by unit test.
- P55 status: ACCEPTED for Day 1 validator precision.

Remaining PM caveat:
- This validates the validator logic and TUI integration statically/unit-wise.
- A full interactive fixture run is still useful before moving to P56, but P55's acceptance criteria are satisfied.

Next planned mainline:
- P56 Tool Timeline 2.0: make worker trajectory CC/Codex-like without regressing P55 validator behavior.

## 2026-05-26 — P55 Interactive Fixture Check: Unit Pass, Product Acceptance Partial

Scope:
- User challenged static/unit acceptance: "you did not actually use it, how can you accept?"
- Ran real `kevix` TUI in `/private/tmp/kevix-usability-fixture`.
- Fixture reset to broken state before run; baseline `npm test` = 2/4 pass, 2/4 fail.
- Submitted: `fix bug in src/summarizeOrder.js so npm test passes`.

Observed:
- Evidence scan worked in real TUI:
  - `Found 2 evidence file(s) (13ms): src/summarizeOrder.js, test/summarizeOrder.test.js`.
  - No duplicate evidence count observed.
- Controller reached approval card after ~56s.
- No `Low confidence: unknown entities: ...` message appeared.
  - This supports that P55 entity-validator no longer falsely flags `id/total/status/items/quantity/price` in this fixture path.
- Approval card content was safe and evidence-directed:
  - Product Intent: `Need to read test/source files before finalizing intent.`
  - Red Flags: `test/summarizeOrder.test.js (do NOT modify test file)`.
  - Constraints: only modify `src/summarizeOrder.js`, no new deps, preserve function signature/export.
  - Worker Directive: read test, read source, modify source, run `npm test`.

Product issue found:
- Approval default selection was still `Regenerate` even though no unknown entity warning appeared.
- Cause appears outside P55 entity validator: current routing folds any `red_flags` into `confidence="low"`, so normal red flags like "do not edit tests" force default Regenerate.
- From PM/user perspective, this still feels like a false low-confidence state:
  - The directive is safe and useful.
  - The user is still nudged to Regenerate.
- Therefore P55 validator logic is accepted, but the approval-routing product behavior is not fully acceptable.

Session handling:
- Pressed Esc at approval card after observation.
- TUI exited cleanly.

Verdict:
- P55 unit/static acceptance: PASS.
- P55 real TUI evidence scan: PASS.
- P55 entity false-positive fix in fixture: PASS (no unknown-entity warning observed).
- Product-level approval default: PARTIAL / needs follow-up.
- Overall P55 as validator task: ACCEPTED.
- Overall Day 1 approval UX: NOT fully done because red_flags still default to Regenerate.

Next PM task before P56 or as P55.1:
- Separate `entityConfidence` from `riskReviewRequired`.
- Normal protective red flags (e.g. `do not edit tests`) should require review but should not default to Regenerate.
- Suggested default behavior:
  - invented entity low confidence => default Regenerate
  - normal red flags / scope risk => default Approve or manual review with Approve selected, depending severity
  - unsafe red flags touching secrets/destructive paths => default Reject or manual review
