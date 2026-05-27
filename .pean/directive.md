## Product Intent

P56.1 Scope Contract Hardening — fix three semantic holes in the engine's scope enforcement. The ScopeContract skeleton exists and tests pass, but three edge cases allow Worker to slip through the boundary.

Fix 1: `editableScope: []` must deny ALL writes. Current code only checks when editableScope.length > 0, so an empty array is silently permissive.

Fix 2: When scope gate denies a write, it must emit `scope_expansion_required` event so the harness layer can decide (expand scope or reject). Currently it silently denies.

Fix 3: `successChecks` whitelist must reject compound shell commands (`&&`, `;`, `|`, `||`). Currently `npm test && rm -rf /` would pass because it starts with "npm test".

## Hidden Semantics

- Fix 1: empty editableScope means "no files can be written" — this is a valid contract (e.g., read-only investigation tasks)
- Fix 2: the event is informational — the gate still denies. The harness layer decides what to do with the event.
- Fix 3: split on `&&`, `;`, `|`, `||` — only the FIRST segment is checked against successChecks. If any segment is NOT a successCheck, the compound command is rejected.

## Acceptance Tests

1. editableScope=[] + write → deny with clear reason
2. scope deny on write → scope_expansion_required event emitted
3. `npm test && echo done` → NOT whitelisted as successCheck
4. `npm test; rm -rf /tmp` → NOT whitelisted
5. `npm test` (exact match) → still whitelisted
6. Existing 128 tests still pass
7. npx tsc --noEmit clean

## Red Flags

- TUI sandbox — do NOT touch
- Provider, prompts, benchmark — do NOT touch
- Other gates — do NOT touch

## Coding Worker Directive

1. Fix `src/gates/scope-gate.ts`:
   a. editableScope=[] → deny all Edit/Write with reason "Editable scope is empty"
   b. On deny, return result that triggers scope_expansion_required in agent-loop
   c. Reject compound bash commands (&&, ;, |, ||) in successChecks whitelist

2. Update `tests/scope-contract.test.ts`: add tests for all three fixes

3. npx tsc --noEmit && npx vitest run → all pass
