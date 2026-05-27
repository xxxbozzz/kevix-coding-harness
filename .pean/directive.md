## Product Intent

P57: Define the structured data layer for Kevix's memory system. Two schemas at different abstraction levels:

MemoryRecord — raw evidence from a single engine run. Engine writes after task completion.
CapabilityCard — distilled pattern from multiple MemoryRecords. LLM Distiller creates offline (not in hot path).

MemoryStore provides save/load/query over both. Distiller interface is a stub — no real LLM yet.

## Hidden Semantics

- MemoryRecord is append-only. Never update existing records.
- CapabilityCard replaces previous card with same (file, taskCategory) key.
- Query by file path, task category, outcome, or recency.
- The Distiller is NOT called during task execution. It's a background/offline process.
- Store is file-based JSON. One file for records, one for cards. No database.

## MemoryRecord schema

```ts
interface MemoryRecord {
  id: string;                    // uuid
  timestamp: string;             // ISO 8601
  taskId: string;
  taskText: string;
  mode: "memory" | "probe" | "auto";
  scopeContract?: { editableScope: string[]; readOnlyEvidence: string[]; successChecks: string[] };
  outcome: {
    scopeRespected?: boolean;
    scopeExpansionRequests: number;
    expandedScope: string[];
    filesChanged: string[];
    testsPassed?: boolean;
    reviewVerdict?: "PASS" | "BLOCKED";
    escalated: boolean;
  };
  cost: { promptTokens: number; completionTokens: number; cacheHitRatio: number; requestCount: number };
  gateEvents: string[];
  phasesCompleted: string[];
  patchSize?: { additions: number; deletions: number };
}
```

## CapabilityCard schema

```ts
interface CapabilityCard {
  id: string;                    // stable: hash of (file, taskCategory)
  file: string;                  // primary file this card is about
  taskCategory: string;          // e.g. "bugfix", "refactor", "feature"
  summary: string;               // one-line capability description
  recommendedMode: "memory" | "probe";
  successRate: number;           // 0-1 from distilled records
  recordCount: number;           // how many records informed this card
  commonFailureModes: string[];
  lastUpdated: string;           // ISO 8601
  distilledFrom: string[];       // record IDs
}
```

## Acceptance Tests

1. MemoryStore.save(record) → persisted, queryable
2. MemoryStore.save(card) → replaces existing card with same key
3. MemoryStore.query({ file: "src/foo.ts" }) → returns matching records
4. MemoryStore.query({ taskCategory: "bugfix" }) → returns matching cards
5. MemoryStore.load() → returns all records + cards
6. Round-trip: save multiple records, load, verify count
7. Distiller interface exists as type-only stub
8. tsc + vitest pass

## Red Flags

- TUI sandbox — do NOT touch
- agent-loop, gates, provider — do NOT touch
- graph/ — do NOT modify existing graph code
- No LLM calls

## Coding Worker Directive

1. Create src/memory/types.ts — MemoryRecord, CapabilityCard
2. Create src/memory/store.ts — MemoryStore class with save/load/query
3. Create src/memory/distiller.ts — Distiller interface stub
4. Create src/memory/index.ts — barrel export
5. Create tests/memory-store.test.ts — save/load/query tests
6. npx tsc --noEmit && npx vitest run
