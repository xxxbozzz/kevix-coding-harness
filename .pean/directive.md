## Product Intent

Make ScopeContract a first-class engine type. Currently scope is pieced together across TUI/approval/gate layers. The engine must formally accept:

```ts
interface ScopeContract {
  editableScope: string[];      // files Worker CAN modify
  readOnlyEvidence: string[];   // files for Read-only
  successChecks: string[];      // bash commands that verify success
}
```

All tool calls respect this contract:
- Edit/Write → only editableScope (deny otherwise)
- Read → prefer readOnlyEvidence (not enforced, but scoped)
- Bash → allow successChecks; other bash must be safe
- Crossing scope → emit scope_expansion_required event

## Hidden Semantics

- If scopeContract is not provided (undefined), the gate behaves as before (project-root-only check) — backward compatible
- scope_expansion_required is an event, not a hard block — the TUI/harness layer decides how to handle it
- editableScope paths are resolved relative to projectRoot
- successChecks are whitelisted bash commands that always pass the bash gate

## Acceptance Tests

1. Write to file in editableScope → allowed
2. Write to file NOT in editableScope → denied with scope_expansion_required
3. Read of readOnlyEvidence → allowed (read is always allowed, but tracked)
4. Bash matching successCheck → allowed
5. No scopeContract provided → backward compatible (project-root-only check)
6. npx tsc --noEmit && npx vitest run passes

## Implementation Constraints

Only touch:
- src/types.ts (add ScopeContract)
- src/gates/types.ts (add scopeContract to GateContext)
- src/gates/scope-gate.ts (enforce editableScope)
- src/loop/agent-loop.ts (accept and pass scopeContract)
- tests/ (add scope-gate tests)

Do NOT touch: provider, pean prompts, other gates, tools, TUI

## Red Flags

- src/cli/ink/* — do NOT modify (TUI layer)
- src/provider/* — do NOT modify
- src/pean/prompts.ts — do NOT modify

## Coding Worker Directive

1. Add ScopeContract to src/types.ts
2. Add scopeContract?: ScopeContract to GateContext in src/gates/types.ts
3. Update src/gates/scope-gate.ts: enforce editableScope on Edit/Write, whitelist successChecks in bash
4. Update src/loop/agent-loop.ts: accept scopeContract param, pass to gate context
5. Add scope_expansion_required event type
6. Add tests to tests/scope-gate.test.ts
7. npx tsc --noEmit && npx vitest run → all pass
