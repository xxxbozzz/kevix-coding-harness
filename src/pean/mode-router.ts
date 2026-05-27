// PEAN Mode Router & State Machine
// Drives the Controller → Worker → Verifier pipeline
// Three execution paths: memory, probe, auto

import type { PEANMode, PEANPhase, PEANDirective, AutoAssessResult } from "../types.js";

// ============================================================
// State Machine
// ============================================================

export interface ModeState {
  mode: PEANMode;
  phase: PEANPhase | "done";
  controller_done: boolean;
  probe_plan_done: boolean;
  worker_done: boolean;
  probe_verify_done: boolean;
  assess_done: boolean;
  revision_count: number;
  last_verdict_clean: boolean;
  max_revisions: number;
  // User approval gates
  waiting_user_approval: boolean;
  user_approved: boolean;
}

export function createModeState(mode: PEANMode, maxRevisions = 2): ModeState {
  return {
    mode,
    phase: "controller",
    controller_done: false,
    probe_plan_done: false,
    worker_done: false,
    probe_verify_done: false,
    assess_done: false,
    revision_count: 0,
    last_verdict_clean: true,
    max_revisions: maxRevisions,
    waiting_user_approval: false,
    user_approved: false,
  };
}

/**
 * Determine the next phase based on current state and mode.
 * Returns null when the pipeline is complete.
 */
export function nextPhase(state: ModeState): PEANPhase | "done" | null {
  const { mode, phase, assess_done } = state;

  // After controller: route based on mode
  if (phase === "controller" && state.controller_done) {
    if (mode === "probe") return "probe_plan";
    return "worker"; // memory and auto go straight to worker
  }

  // After probe plan: go to worker
  if (phase === "probe_plan" && state.probe_plan_done) {
    return "worker";
  }

  // After worker: route based on mode
  if (phase === "worker" && state.worker_done) {
    if (mode === "memory") return "done";
    if (mode === "probe") return "probe_verify";
    if (mode === "auto") return "assess";
  }

  // After probe verify: check if revision needed
  if (phase === "probe_verify" && state.probe_verify_done) {
    if (!state.last_verdict_clean && state.revision_count < state.max_revisions) {
      return "worker"; // revise
    }
    return "done";
  }

  // After assess: route based on decision
  if (phase === "assess" && assess_done) {
    return "done"; // caller checks assess result and may restart probe path
  }

  return null;
}

/**
 * Step the state machine forward, returning the new phase.
 * Caller is responsible for executing the phase and calling markPhaseComplete.
 */
export function stepPhase(state: ModeState): PEANPhase | "done" | null {
  const next = nextPhase(state);
  if (next) {
    state.phase = next;
  }
  return next;
}

export function markPhaseComplete(state: ModeState): void {
  switch (state.phase) {
    case "controller":
      state.controller_done = true;
      break;
    case "probe_plan":
      state.probe_plan_done = true;
      break;
    case "worker":
      state.worker_done = true;
      break;
    case "probe_verify":
      state.probe_verify_done = true;
      break;
    case "assess":
      state.assess_done = true;
      break;
  }
}

// ============================================================
// Mode Routing Logic
// ============================================================

/**
 * After auto assess, decide whether to trigger probe.
 * If need_probe is true, reset the state to enter the probe path.
 */
export function handleAssessDecision(
  state: ModeState,
  assess: AutoAssessResult,
): { should_probe: boolean } {
  if (assess.need_probe) {
    // Upgrade: restart from probe_plan with worker output as base
    state.phase = "probe_plan";
    state.worker_done = false;
    state.probe_plan_done = false;
    state.probe_verify_done = false;
    state.assess_done = false;
    return { should_probe: true };
  }
  return { should_probe: false };
}

// ============================================================
// Directive Parser
// ============================================================

/**
 * Parse raw markdown from Controller into structured PEANDirective.
 * Handles LLM output variations (extra whitespace, missing headers, etc.)
 */
export function parseDirective(raw: string): PEANDirective {
  const extract = (heading: string): string => {
    // Match "## Heading" or "## Heading\n" multiline until next "## " or end
    const regex = new RegExp(
      `##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`,
      "i",
    );
    const match = raw.match(regex);
    return match?.[1]?.trim() ?? "";
  };

  return {
    product_intent: extract("Product Intent"),
    hidden_semantics: extract("Hidden Semantics"),
    acceptance_tests: extract("Acceptance Tests"),
    implementation_constraints: extract("Implementation Constraints"),
    red_flags: extract("Red Flags"),
    worker_directive: extract("Coding Worker Directive"),
    raw,
  };
}

export function sanitizeDirectiveForProblem(
  directive: PEANDirective,
  problem: string,
): PEANDirective {
  const targetFiles = extractDeclaredTargetFiles(problem);
  if (targetFiles.length === 0 || !directive.red_flags.trim()) {
    return directive;
  }

  const redFlagLines = directive.red_flags
    .split("\n")
    .filter((line) => {
      const normalizedLine = normalizePathText(line);
      return !targetFiles.some((target) => normalizedLine.includes(target));
    });

  const red_flags = redFlagLines.join("\n").trim() || "None.";
  return {
    ...directive,
    red_flags,
  };
}

function extractDeclaredTargetFiles(problem: string): string[] {
  const files = new Set<string>();
  const patterns = [
    /(?:file\s+to\s+change\s+is|target\s+file\s+is|change\s+file|modify\s+file|edit\s+file)\s+`?([\w./-]+\.(?:ts|tsx|js|jsx|py|go|rs))`?/gi,
    /(?:fix|update|change|modify|edit)\s+`?((?:src|lib|app|packages|tests?)\/[\w./-]+\.(?:ts|tsx|js|jsx|py|go|rs))`?/gi,
  ];

  for (const pattern of patterns) {
    for (const match of problem.matchAll(pattern)) {
      const file = match[1]?.trim();
      if (file) files.add(normalizePathText(file));
    }
  }

  return [...files];
}

function normalizePathText(value: string): string {
  return value
    .replace(/[`'"]/g, "")
    .replaceAll("\\", "/")
    .trim()
    .toLowerCase();
}

/**
 * Validate that a directive has all required sections.
 * Returns missing sections, if any.
 */
export function validateDirective(d: PEANDirective): string[] {
  const required: [string, string][] = [
    ["Product Intent", d.product_intent],
    ["Hidden Semantics", d.hidden_semantics],
    ["Acceptance Tests", d.acceptance_tests],
    ["Implementation Constraints", d.implementation_constraints],
    ["Red Flags", d.red_flags],
    ["Worker Directive", d.worker_directive],
  ];
  return required.filter(([, v]) => !v || v.length < 20).map(([k]) => k);
}
