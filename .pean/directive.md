## Product Intent

P56.4: Wiki-driven auto mode routing. When mode is "auto", query the sandbox wiki for skills matching the current task. If a high-confidence skill recommends "probe", start with probe directly. Otherwise, use default memory-first behavior.

This replaces the current hardcoded "auto = memory first, assess decides probe" with pattern-driven routing.

## Hidden Semantics

- Wiki lookup happens once, before state machine starts
- Match by: file paths in problem text, task category keywords, skill triggers
- Confidence threshold: successRate >= 0.7 AND recordCount >= 3
- Only use wiki routing if sandbox store is provided
- If no match, fall back to default auto behavior (memory first)
- The router is a pure function — no side effects on the store

## Acceptance Tests

1. Wiki has skill with successRate=0.9, recordCount=5 for matching file → auto routes to probe
2. Wiki has skill with successRate=0.5 (low) → no match, default memory
3. Wiki has skill with recordCount=1 (too few) → no match, default memory
4. No wiki store provided → default auto behavior
5. Wiki has no matching skills → default auto behavior
6. Existing 181 tests still pass
7. tsc clean

## Red Flags

- TUI — do NOT touch
- Gates, provider — do NOT touch

## Coding Worker Directive

1. Create src/memory/router.ts — routeAutoMode(task, store) → "memory" | "probe" | null
2. Update agent-loop: in auto mode, call router before state machine starts
3. If router returns "probe", set currentMode = "probe"
4. Add tests
5. npx tsc --noEmit && npx vitest run
