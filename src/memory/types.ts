// P57: Rolling Memory Sandbox + Autonomous Skill Distillation

/** Raw task memory — expires after 3 days by default. */
export interface RawMemoryRecord {
  id: string;
  taskId: string;
  projectId: string;
  createdAt: string; // ISO 8601
  expiresAt: string; // ISO 8601 — createdAt + TTL
  problem: string;
  mode: "memory" | "probe" | "auto";
  scopeContract?: {
    editableScope: string[];
    readOnlyEvidence: string[];
    successChecks: string[];
  };
  phases: string[];
  toolTimeline: Array<{ name: string; filePath?: string; command?: string; blocked?: boolean; durationMs?: number; addedLines?: number; removedLines?: number }>;
  gateEvents: string[];
  reviewFindings: string[];
  outcome: {
    scopeRespected?: boolean;
    scopeExpansionRequests: number;
    expandedScope: string[];
    filesChanged: string[];
    testsPassed?: boolean;
    reviewVerdict?: "PASS" | "BLOCKED";
    escalated: boolean;
  };
  patchSummary?: { additions: number; deletions: number };
  tags: string[]; // extracted keywords: file names, error types, task category
}

/** Long-lived skill distilled from multiple RawMemoryRecords. */
export interface WikiSkill {
  id: string; // stable hash: `${problemClass}::${triggers.join(",")}`
  title: string;
  problemClass: string; // e.g. "null-check", "type-mismatch", "api-boundary"
  triggers: string[]; // patterns that suggest this skill applies
  recommendedMode: "memory" | "probe";
  requiredEvidence: string[]; // what must be read before applying
  editableScopeHints: string[]; // files typically modified
  readOnlyEvidenceHints: string[]; // files typically read for context
  successCheckHints: string[]; // commands that typically verify success
  playbook: string; // step-by-step approach
  commonFailureModes: string[];
  verificationChecklist: string[];
  sourceMemoryIds: string[]; // which records informed this skill
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}


// ── Working Layer: LLM draft space between raw and wiki ──

export type DraftKind = "summary" | "cluster" | "candidate" | "failed_abstraction";

export interface WorkingDraft {
  id: string;
  sessionId: string;       // groups drafts from one distillation run
  kind: DraftKind;
  title: string;
  content: string;          // free-form LLM output
  sourceRecordIds: string[];
  createdAt: string;        // ISO 8601
  expiresAt: string;        // ISO 8601 — working/ TTL: 7 days
}

/** Working layer TTL: 7 days (longer than raw/ to allow multi-session refinement) */
export const WORKING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Default sandbox TTL: 3 days in milliseconds */
export const SANDBOX_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/** Compute expiresAt from createdAt + TTL */
export function computeExpiresAt(createdAt: Date, ttlMs: number = SANDBOX_TTL_MS): string {
  return new Date(createdAt.getTime() + ttlMs).toISOString();
}
