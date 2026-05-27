## Product Intent

P56.2 Scope Expansion Runtime — turn scope violations from hard failures into recoverable human-in-the-loop events.

When Worker tries to write outside editableScope and scope gate denies, instead of just erroring, the engine calls onScopeExpansionRequired callback. The harness (TUI or auto-policy) decides: expand scope or reject.

## Hidden Semantics

- Expanded scope is runtime-only — does not modify the original ScopeContract
- Expansion persists for the rest of the current task execution
- If callback is not provided → current behavior preserved (tool error only)
- Callback runs during the tool loop gate check, so it's async
- The callback receives: file, reason, current editableScope

## Acceptance Tests

1. No callback → deny behavior preserved (existing tests pass)
2. Callback rejects → scope not expanded, tool error
3. Callback approves → subsequent write to same file allowed
4. scope_expansion_required emitted before callback prompt
5. tsc + full vitest pass (145+)

## Red Flags

- TUI sandbox — do NOT touch
- Provider, prompts, benchmark — do NOT touch

## Coding Worker Directive

1. Add onScopeExpansionRequired to AgentLoopOptions
2. Add runtimeExpandedScope to ToolLoopGateData
3. In agent-loop gate denial block: if scopeExpansion and callback exists, await callback; if approve, add file to runtimeExpandedScope
4. Update scope-gate or gate context to also check runtime-expanded files
5. Add tests: callback approve, callback reject, no callback default
6. npx tsc --noEmit && npx vitest run → all pass
