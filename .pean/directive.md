## Product Intent

Close the three human-first gaps:

1. Scope inference — engine can infer editableScope/readOnlyEvidence/successChecks from problem text + filesystem
2. Scope approval hook — human can confirm/modify scope before Worker runs
3. Six-point summary — TUI layer, noted as pending

## Hidden Semantics

- inferScopeContract scans candidate files from problem text, separates test files (readOnlyEvidence) from source files (editableScope)
- `onScopeProposed` fires once before Worker, receives inferred scope, returns confirmed scope (or rejects)
- If no callback provided, inferred scope is used directly
- Only called when no explicit scopeContract was passed by caller

## Acceptance Tests

1. Problem "fix bug in src/foo.ts so npm test passes" → editableScope: [src/foo.ts], readOnlyEvidence: [test/foo.test.ts], successChecks: [npm test]
2. onScopeProposed can modify scope → modified scope used
3. onScopeProposed can reject → task cancelled
4. Without onScopeProposed → inferred scope used directly
5. Existing 229 tests pass

## Coding Worker Directive

1. Add inferScopeContract(problem, cwd?) to src/memory/scope-inference.ts
2. Add onScopeProposed? callback to AgentLoopOptions
3. Integrate into runAgentLoop: if no scopeContract given, infer + propose
4. Add tests
5. npx tsc --noEmit && npx vitest run
