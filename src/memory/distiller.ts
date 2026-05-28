// P57.3: Distiller — offline LLM research job that reads recent sandbox records
// and produces WikiSkills (or nothing).

import type { RawMemoryRecord, WikiSkill } from "./types.js";
import type { SandboxStore } from "./store.js";

export interface DistillInput {
  records: RawMemoryRecord[];
  projectId: string;
}

export interface DistillOutput {
  skills: WikiSkill[];
}

export interface Distiller {
  distill(input: DistillInput): Promise<DistillOutput>;
}

/** Stub distiller — always returns empty. For testing and backward compat. */
export function createStubDistiller(): Distiller {
  return {
    async distill(_input: DistillInput): Promise<DistillOutput> {
      return { skills: [] };
    },
  };
}

// ── P57.3 Real LLM Distiller ──

const DISTILL_SYSTEM = `You are Kevix Distiller, an offline research agent. You analyze recent coding task records and extract reusable skills.

Given a group of task execution records for the SAME FILE, produce a WikiSkill JSON object.

Output ONLY valid JSON, no markdown:
{
  "id": "problemClass::primaryTrigger",
  "title": "short descriptive title",
  "problemClass": "null-check | type-mismatch | api-boundary | async | logic-error | scope-violation | other",
  "triggers": ["keyword1", "keyword2"],
  "recommendedMode": "memory | probe",
  "playbook": "step-by-step approach, 2-4 sentences",
  "commonFailureModes": ["failure1", "failure2"],
  "verificationChecklist": ["check1", "check2"],
  "requiredEvidence": ["file1"],
  "editableScopeHints": ["file1"],
  "readOnlyEvidenceHints": ["file1"],
  "successCheckHints": ["command1"],
  "successRate": 0.0-1.0,
  "recordCount": N
}

Rules:
- id: combine problemClass with the most distinctive trigger, e.g. "null-check::TypeError"
- recommendedMode: "memory" if all records used memory and most succeeded; "probe" if any needed probe or had gate activity
- successRate: fraction of records where testsPassed AND reviewVerdict was PASS and NOT escalated
- recordCount: total records analyzed (same as input count)
- triggers: keywords from error messages, exceptions, or task descriptions
- playbook: concrete steps based on what ACTUALLY worked in the records
- commonFailureModes: what went wrong in FAILED records
- If records are too diverse or contradictory, output {"id":"SKIP","reason":"<why>"}`;

interface MinimalProvider {
  call(params: {
    messages: Array<{ role: string; content: string }>;
    max_tokens: number;
    temperature: number;
    response_format?: { type: "json_object" };
  }): Promise<{ message: { content: string | null } }>;
}

function buildDistillPrompt(records: RawMemoryRecord[]): string {
  const summaries = records.map((r) => {
    const outcome = r.outcome;
    const success = outcome.testsPassed !== false && outcome.reviewVerdict !== "BLOCKED" && !outcome.escalated;
    return [
      `Task: ${r.problem.slice(0, 200)}`,
      `Mode: ${r.mode} | Success: ${success} | Tests: ${outcome.testsPassed ?? "unknown"} | Review: ${outcome.reviewVerdict ?? "none"} | Escalated: ${outcome.escalated}`,
      `Scope: ${r.scopeContract?.editableScope.join(", ") ?? "none"} | Files changed: ${outcome.filesChanged.join(", ")}`,
      `Gates: ${r.gateEvents.length > 0 ? r.gateEvents.join("; ") : "none"}`,
      `Tags: ${r.tags.join(", ")}`,
    ].join("\n");
  });

  return `Analyze these ${records.length} task records and produce a WikiSkill.\n\n${summaries.join("\n\n")}`;
}

function parseSkillJson(raw: string): WikiSkill | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.id === "SKIP" || !parsed.title) return null;
    const now = new Date().toISOString();
    return {
      id: String(parsed.id || `skill-${Date.now()}`),
      title: String(parsed.title || ""),
      problemClass: String(parsed.problemClass || "other"),
      triggers: Array.isArray(parsed.triggers) ? parsed.triggers.map(String) : [],
      recommendedMode: parsed.recommendedMode === "probe" ? "probe" : "memory",
      requiredEvidence: Array.isArray(parsed.requiredEvidence) ? parsed.requiredEvidence.map(String) : [],
      editableScopeHints: Array.isArray(parsed.editableScopeHints) ? parsed.editableScopeHints.map(String) : [],
      readOnlyEvidenceHints: Array.isArray(parsed.readOnlyEvidenceHints) ? parsed.readOnlyEvidenceHints.map(String) : [],
      successCheckHints: Array.isArray(parsed.successCheckHints) ? parsed.successCheckHints.map(String) : [],
      playbook: String(parsed.playbook || ""),
      commonFailureModes: Array.isArray(parsed.commonFailureModes) ? parsed.commonFailureModes.map(String) : [],
      verificationChecklist: Array.isArray(parsed.verificationChecklist) ? parsed.verificationChecklist.map(String) : [],
      sourceMemoryIds: records.map((r: RawMemoryRecord) => r.id),
      successRate: typeof parsed.successRate === "number" ? parsed.successRate : 0,
      recordCount: typeof parsed.recordCount === "number" ? parsed.recordCount : records.length,
      createdAt: now,
      updatedAt: now,
    };
  } catch {
    return null;
  }
}

let records: RawMemoryRecord[] = []; // captured for parseSkillJson closure

/** Real LLM-driven distillation. Groups sandbox records by file, calls LLM per group. */
export async function distillSandbox(
  store: SandboxStore,
  provider: MinimalProvider,
  options: { minRecords?: number } = {},
): Promise<number> {
  const minRecords = options.minRecords ?? 3;
  const allRecords = store.allRecords();

  // Group by primary file (first in editableScope or filesChanged)
  const groups = new Map<string, RawMemoryRecord[]>();
  for (const r of allRecords) {
    const primaryFile = r.scopeContract?.editableScope[0] || r.outcome.filesChanged[0];
    if (!primaryFile) continue;
    const existing = groups.get(primaryFile) || [];
    existing.push(r);
    groups.set(primaryFile, existing);
  }

  let skillsCreated = 0;
  for (const [file, group] of groups) {
    if (group.length < minRecords) continue;

    try {
      records = group; // for parseSkillJson closure
      const prompt = buildDistillPrompt(group);
      const resp = await provider.call({
        messages: [
          { role: "system", content: DISTILL_SYSTEM },
          { role: "user", content: prompt },
        ],
        max_tokens: 800,
        temperature: 0.2,
        response_format: { type: "json_object" },
      });

      const raw = resp.message.content ?? "";
      const skill = parseSkillJson(raw);
      if (skill) {
        store.saveWikiSkill(skill);
        skillsCreated++;
      }
    } catch {
      // Skip this group on LLM failure
    }
  }

  return skillsCreated;
}
