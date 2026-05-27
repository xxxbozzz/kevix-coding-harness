## Product Intent

P58.1: Fill RawMemoryRecord.toolTimeline with real tool execution data captured during runToolLoop. Currently empty — LLM research sandbox has no process material.

## Hidden Semantics

- Record both successful and gate-blocked tools
- Only structured summary: name, filePath/command, blocked, durationMs, addedLines/removedLines
- No full output (avoid memory bloat)
- Capture failure must not affect task execution

## Acceptance Tests

1. Successful edit → toolTimeline entry with blocked=false
2. Gate-blocked edit → toolTimeline entry with blocked=true
3. Bash → command field recorded
4. 178 existing tests still pass
5. tsc clean

## Red Flags

- TUI, provider, gates, distiller — do NOT touch

## Coding Worker Directive

1. Add `command?` to toolTimeline item type
2. Create toolTimeline array at runAgentLoop top, pass ref through gateData
3. In runToolLoop: capture filePath/command from tool args, push on gate deny (blocked=true) and execute success (blocked=false)
4. Wire real timeline into RawMemoryRecord capture
5. Add tests
6. npx tsc --noEmit && npx vitest run
