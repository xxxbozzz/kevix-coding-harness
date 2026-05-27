// P57: Memory Sandbox + Capability Wiki — structured data schemas

/** Raw evidence from a single engine run. Engine writes after task completion. */
export interface MemoryRecord {
  id: string;
  timestamp: string; // ISO 8601
  taskId: string;
  taskText: string;
  mode: "memory" | "probe" | "auto";
  scopeContract?: {
    editableScope: string[];
    readOnlyEvidence: string[];
    successChecks: string[];
  };
  outcome: {
    scopeRespected?: boolean;
    scopeExpansionRequests: number;
    expandedScope: string[];
    filesChanged: string[];
    testsPassed?: boolean;
    reviewVerdict?: "PASS" | "BLOCKED";
    escalated: boolean;
  };
  cost: {
    promptTokens: number;
    completionTokens: number;
    cacheHitRatio: number;
    requestCount: number;
  };
  gateEvents: string[];
  phasesCompleted: string[];
  patchSize?: { additions: number; deletions: number };
}

/** Distilled pattern from multiple MemoryRecords. Created offline by LLM Distiller. */
export interface CapabilityCard {
  id: string; // stable hash: `${file}::${taskCategory}`
  file: string;
  taskCategory: string; // "bugfix" | "refactor" | "feature" | "test" | "unknown"
  summary: string;
  recommendedMode: "memory" | "probe";
  successRate: number; // 0-1
  recordCount: number;
  commonFailureModes: string[];
  lastUpdated: string; // ISO 8601
  distilledFrom: string[]; // record IDs
}
