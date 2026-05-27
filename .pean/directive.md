## Product Intent

P58: Auto-capture raw memory after each runAgentLoop completion. This is the inlet for the LLM Wiki — without capture, sandbox is empty.

## Hidden Semantics

- Capture happens after summary construction, before return
- Best-effort: failure emits warn log, never breaks the task
- Only raw memory, no distillation
- Record contains all evidence needed for future LLM research

## Acceptance Tests

1. memoryStore provided → RawMemoryRecord written
2. Record has correct TTL, taskId, problem, mode, phases
3. Record has scopeContract, filesChanged, scopeExpansionRequests, expandedScope
4. Record has toolTimeline, gateEvents, outcome.escalated
5. memoryStore not provided → no crash, normal summary
6. memoryStore write fails → task still succeeds, warn logged
7. Existing 176 tests still pass

## Red Flags

- TUI, gates, provider — do NOT touch
- No distillation

## Coding Worker Directive

1. Add memoryStore?: SandboxStore to AgentLoopOptions
2. Build RawMemoryRecord from summary + runtime state at end of runAgentLoop
3. Wrap in try/catch — failure is non-fatal
4. Add tests: capture on, capture off, capture failure
5. npx tsc --noEmit && npx vitest run
