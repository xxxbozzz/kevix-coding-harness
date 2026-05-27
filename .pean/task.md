## Product Intent

P56.3c: Add real agent-loop integration tests for Scope Contract expansion.

P56.3b fixed the ref bug, but current tests only simulate scope expansion at gate level. We need one integration test that proves runAgentLoop actually emits scope expansion, calls the callback, expands scope, executes the tool, and records summary evidence.

## Acceptance Tests

1. Approve path:
   - Start with scopeContract.editableScope = ["src/foo.ts"]
   - Mock Worker attempts edit/write to "src/bar.ts"
   - Gate blocks and emits scope_expansion_required
   - onScopeExpansionRequired is called once
   - callback returns "approve"
   - engine expands editableScope
   - Worker eventually executes edit/write for "src/bar.ts"
   - summary.scopeExpansionRequests === 1
   - summary.expandedScope includes "src/bar.ts"
   - summary.filesChanged includes "src/bar.ts"
   - summary.scopeRespected === true

2. Reject path:
   - Same setup
   - callback returns "reject"
   - edit/write for "src/bar.ts" is not executed
   - summary.scopeExpansionRequests === 1
   - summary.expandedScope is empty
   - summary.filesChanged does not include "src/bar.ts"

## Implementation Constraints

- Only add tests unless a real engine bug is found.
- Prefer adding tests to tests/scope-contract.test.ts or a new tests/scope-contract-integration.test.ts.
- Do not modify gates, provider, prompts, or TUI.
- Use a deterministic mock LLMProvider and ToolExecutor.
- Run:
  - npx tsc --noEmit
  - npx vitest run