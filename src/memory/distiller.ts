// P57: Distiller interface — offline LLM process that creates CapabilityCards from MemoryRecords.
// Not called during task execution. Stub only — no real LLM integration yet.

import type { MemoryRecord, CapabilityCard } from "./types.js";

export interface DistillerInput {
  records: MemoryRecord[];
  file: string;
  taskCategory: string;
}

export interface DistillerOutput {
  card: CapabilityCard;
}

/**
 * Distiller converts raw MemoryRecords into a CapabilityCard.
 *
 * P57: Interface-only stub. P57.x will implement with real LLM.
 * The LLM prompt will receive:
 *  - All MemoryRecords for a given (file, taskCategory)
 *  - Task: produce a CapabilityCard with summary, recommendedMode,
 *    successRate, commonFailureModes
 */
export interface Distiller {
  distill(input: DistillerInput): Promise<DistillerOutput>;
}

/** Minimal no-op stub — returns empty card. Replace with LLM implementation. */
export function createStubDistiller(): Distiller {
  return {
    async distill(input: DistillerInput): Promise<DistillerOutput> {
      const id = `${input.file}::${input.taskCategory}`;
      return {
        card: {
          id,
          file: input.file,
          taskCategory: input.taskCategory,
          summary: "(pending distillation)",
          recommendedMode: "memory",
          successRate: 0,
          recordCount: input.records.length,
          commonFailureModes: [],
          lastUpdated: new Date().toISOString(),
          distilledFrom: input.records.map((r) => r.id),
        },
      };
    },
  };
}
