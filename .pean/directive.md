## Product Intent

P56.3b: Fix scopeExpansionRequests ref bug + add real agent-loop integration tests.

Fix 1: `let scopeExpansionRequests = 0` → `const scopeExpansionRequests = { value: 0 }`. Currently the number is wrapped in an object at gateDataRef assignment time, creating a copy. The gateData increment doesn't propagate back to the summary. Declare as ref from the start.

Fix 2: Integration tests proving the full scope expansion cycle through runAgentLoop with mock provider.

## Acceptance Tests

Fix 1:
- scopeExpansionRequests correctly tracks count in summary after agent-loop completes

Fix 2:
- approve: Worker tries out-of-scope write → callback approves → second attempt succeeds → summary.scopeRespected=true, scopeExpansionRequests=1, expandedScope includes file, filesChanged includes file
- reject: callback rejects → write not executed → summary.scopeExpansionRequests=1, expandedScope empty, filesChanged empty

## Red Flags

- TUI sandbox — do NOT touch
- Provider, prompts — do NOT touch

## Coding Worker Directive

1. Fix `let scopeExpansionRequests = 0` → `const scopeExpansionRequests = { value: 0 }` in agent-loop, remove wrapping in gateDataRef
2. Write integration tests with mock provider+tool executor
3. npx tsc --noEmit && npx vitest run → all pass
