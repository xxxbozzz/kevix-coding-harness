## Product Intent

Wire testsPassed into RawMemoryRecord capture. Currently always undefined.

## Hidden Semantics

- Detect test pass/fail from bash tool output when command looks like a test run
- Track in gateData, pass to memory capture
- Default: undefined (no test was run)

## Acceptance Tests

1. Bash "npm test" output containing "pass" → testsPassed=true
2. Bash output with failures → testsPassed=false
3. No bash test run → testsPassed=undefined
4. 225 existing tests still pass

## Red Flags

- TUI — do NOT touch

## Coding Worker Directive

1. Add testsPassed ref to agent-loop tracking variables
2. Detect test status from bash results in runToolLoop
3. Pass value to RawMemoryRecord capture
4. Add test
5. npx tsc --noEmit && npx vitest run
