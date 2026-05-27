## Product Intent

P56.2a + P56.3: Close the Scope Contract loop.

P56.2a: Write a working integration test that proves scope expansion flows end-to-end through the agent-loop.

P56.3: Add scope artifact to TaskSummary so every completed task records whether it respected its contract boundary. This is the evidence layer — without it, benchmark and paper data can't answer "did the task stay within scope?"

## Hidden Semantics

- scopeExpansionRequests: count of scope_expansion_required events emitted
- expandedScope: files added to scope via onScopeExpansionRequired approval
- scopeRespected: true if no writes to files outside final editableScope (runtime-expanded scope included)
- filesChanged: deduplicated list of files actually written/edited during the task run
- These fields are populated regardless of whether scopeContract was provided (null/empty if no contract)

## Acceptance Tests

1. P56.2a: Scope expansion integration test passes against agent-loop
2. TaskSummary.scopeRespected tracks whether scope was violated
3. TaskSummary.scopeExpansionRequests counts expansion events
4. TaskSummary.expandedScope lists files added during expansion
5. TaskSummary.filesChanged lists files modified
6. Without scopeContract → fields are empty/neutral
7. tsc + full vitest pass (149+)

## Red Flags

- TUI sandbox — do NOT touch
- Provider, prompts, benchmark — do NOT touch

## Coding Worker Directive

1. Add scope fields to TaskSummary type in src/types.ts
2. Track filesChanged in agent-loop (collect from tool calls)
3. Track scopeExpansionRequests + expandedScope in gateData
4. Populate scopeRespected at summary construction time
5. Write integration test for scope expansion in agent-loop
6. npx tsc --noEmit && npx vitest run → all pass
