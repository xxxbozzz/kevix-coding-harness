## Product Intent

P57 Rolling Memory Sandbox + Autonomous Skill Distillation.

Raw MemoryRecords expire after 3 days. LLM research job periodically distills recent records into WikiSkills (or produces nothing). WikiSkills are the only long-lived artifact. No approval queue. No permanent raw memory.

## Hidden Semantics

- Sandbox is a 3-day rolling research window, not permanent storage
- RawMemoryRecord.defaultTTL = 3 * 86400 * 1000 (3 days)
- purgeExpired(now) only removes raw records, never WikiSkills
- distill() may return empty array — records still expire on schedule
- No human approval, no candidate queue
- WikiSkill is the only persistent product

## Acceptance Tests

1. Record saved → queryable → expiresAt = createdAt + 3 days
2. purgeExpired removes records past TTL, keeps fresh ones
3. purgeExpired never touches WikiSkills
4. distill interface: records → WikiSkill[] (empty array is valid)
5. WikiSkills persist across save/load
6. 163 existing tests still pass
7. tsc clean

## Red Flags

- agent-loop, auto mode, TUI — do NOT touch
- No real LLM calls
- No graph/ modification

## Coding Worker Directive

1. Rewrite src/memory/types.ts: RawMemoryRecord (with TTL), WikiSkill
2. Rewrite src/memory/store.ts: save/load/query + purgeExpired + wiki skill storage
3. Rewrite src/memory/distiller.ts: distillSandboxToWiki interface (stub)
4. Rewrite tests/memory-store.test.ts: TTL, purge, wiki skill persistence
5. Clean up accidental files: src/graph/memory-wiki.ts, tests/memory-wiki.test.ts, agent-loop/index.ts changes
6. npx tsc --noEmit && npx vitest run → all pass
