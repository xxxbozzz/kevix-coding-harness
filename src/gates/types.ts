// PEAN Gate Layer — Code-level permission gates
import type { ScopeContract } from "../types.js";
// Each gate is a pure function: input → allow | deny | ask

export type GateDecision = "allow" | "deny" | "ask";

export interface GateResult {
  decision: GateDecision;
  gate: string;
  reason: string;
}

export interface Gate {
  name: string;
  check(ctx: GateContext, call: GateToolCall): GateResult;
}

export interface GateContext {
  directive: {
    product_intent: string;
    hidden_semantics: string;
    acceptance_tests: string;
    implementation_constraints: string;
    red_flags: string;
    worker_directive: string;
    raw: string;
  } | null;
  mode: "memory" | "probe" | "auto";
  projectRoot: string;
  // Probe state
  probeCompleted: boolean;
  verifierVerdict: "clean" | "needs_revision" | null;
  revisionCount: number;
  maxRevisions: number;
  needProbe: boolean | null;
  problemText: string;
  /** Files explicitly targeted by the task — gate must NOT block these */
  targetFiles: string[];
  /** P56: Formal task boundary contract — if set, gates enforce editable scope */
  scopeContract?: ScopeContract;
}

export interface GateToolCall {
  name: string;
  args: Record<string, unknown>;
}
