## Product Intent

P60: Add comprehensive tests for all untested engine modules. Priority: tools (filesystem safety) → core utilities (pure functions) → cleanup.

## Scope

1. Tools: bash, read, write, edit, grep, glob
2. Utilities: computeDiff, extractPatch, extractJson, normalizeThrown, globToRegex
3. Cleanup: unused types, temp-vitest.config.ts

## Acceptance Tests

Per tool:
- bash: executes command, returns output, handles non-zero exit
- read: reads file with line numbers, errors on missing file
- write: creates file, overwrites, creates parent dirs
- edit: replaces exact string, fails on non-unique match
- grep: finds pattern, handles no match, walks directories
- glob: matches patterns, handles **, handles no match

Utilities:
- computeDiff: counts additions/removals
- extractPatch: extracts diff from LLM output
- extractJson: parses JSON from markdown blocks
- normalizeThrown: handles Error/string/object/null
- globToRegex: ** matches any path, * matches single segment

Cleanup:
- Remove unused types from types.ts (ToolHandler, PEAState, ReviewResult, SessionState)
- Delete temp-vitest.config.ts

## Red Flags

- TUI, agent-loop, gates — do NOT modify behavior

## Coding Worker Directive

1. tests/tools/bash.test.ts
2. tests/tools/read.test.ts
3. tests/tools/write.test.ts
4. tests/tools/edit.test.ts
5. tests/tools/grep.test.ts
6. tests/tools/glob.test.ts
7. tests/pean/utils.test.ts (extractPatch, extractJson, computeDiff)
8. tests/tools/bash-utils.test.ts (normalizeThrown)
9. tests/tools/glob-utils.test.ts (globToRegex)
10. Clean types.ts + delete temp-vitest.config.ts
11. npx tsc --noEmit && npx vitest run
