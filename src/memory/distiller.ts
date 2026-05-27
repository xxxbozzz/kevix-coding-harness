// P57: Distiller — offline LLM research job that reads recent sandbox records
// and produces WikiSkills (or nothing). Stub only. No real LLM yet.

import type { RawMemoryRecord, WikiSkill } from "./types.js";

export interface DistillInput {
  records: RawMemoryRecord[]; // recent records (within TTL, from sandbox)
  projectId: string;
}

export interface DistillOutput {
  skills: WikiSkill[]; // empty if nothing to distill
}

/**
 * Distiller examines recent sandbox records for patterns.
 * If a structured skill can be abstracted, it produces a WikiSkill.
 * Otherwise, returns empty array.
 *
 * P57: Interface-only stub. P57.x will implement with real LLM.
 */
export interface Distiller {
  distill(input: DistillInput): Promise<DistillOutput>;
}

/** Stub distiller — always returns empty (no skills to distill). */
export function createStubDistiller(): Distiller {
  return {
    async distill(_input: DistillInput): Promise<DistillOutput> {
      return { skills: [] };
    },
  };
}
