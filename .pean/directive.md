## Product Intent

P57.3: Replace createStubDistiller with real LLM-driven distillation. Takes recent sandbox records, groups by file/taskCategory, calls LLM to produce WikiSkills, saves to store.

## Hidden Semantics

- Distillation runs OFFLINE — not during task execution
- Groups >= 3 records for same file before attempting distillation
- LLM prompt is structured to output WikiSkill JSON
- Failed LLM calls skip the group, don't crash the distill run
- Skills are upserted (same file+category → update existing)
- Not called from agent-loop — exposed as export for periodic/batch use

## Acceptance Tests

1. distillSandbox with 3+ records for same file → produces >= 1 WikiSkill
2. distillSandbox with < 3 records → produces 0 skills
3. Produced skill has valid WikiSkill shape
4. Skill saved to store and queryable
5. Distiller stub still works (backward compat)
6. Existing 190 tests still pass
7. tsc clean

## Red Flags

- agent-loop, auto mode — do NOT modify (distiller is offline)
- TUI — do NOT touch

## Coding Worker Directive

1. Add distillSandbox(store, provider) to src/memory/distiller.ts
2. Group records by file, call LLM per group, parse WikiSkill JSON
3. Save produced skills to store
4. Add tests with mock provider
5. npx tsc --noEmit && npx vitest run
