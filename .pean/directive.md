## Product Intent

P57.1: Export memory module from package root. SandboxStore.saveRecord auto-sets expiresAt when missing.

## Hidden Semantics

- Auto-set expiresAt only when record.expiresAt is falsy/empty
- Explicit expiresAt is always preserved

## Acceptance Tests

1. src/index.ts exports all memory types
2. saveRecord without expiresAt → auto-computed
3. saveRecord with explicit expiresAt → preserved
4. tsc + vitest all green

## Red Flags

- agent-loop, auto mode, TUI — do NOT touch

## Coding Worker Directive

1. Update src/index.ts to export memory module
2. Update SandboxStore.saveRecord to auto-set expiresAt from computeExpiresAt
3. Update tests to verify
4. npx tsc --noEmit && npx vitest run
