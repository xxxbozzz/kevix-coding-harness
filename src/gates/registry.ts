// PEAN Gate Registry
// Chains all gates for BeforeToolUse and BeforeComplete checkpoints.

import type { Gate, GateResult, GateContext, GateToolCall } from "./types.js";
import { directiveGate } from "./directive-gate.js";
import { redFlagGate } from "./red-flag-gate.js";
import { scopeGate } from "./scope-gate.js";
import { bashRiskGate } from "./bash-risk-gate.js";
import { verifierGate } from "./verifier-gate.js";
import { probeRequiredGate } from "./probe-required-gate.js";

// ============================================================
// Gate ordering — fail-closed: deny-strongest gates first
// ============================================================

const BEFORE_TOOL_USE_GATES: Gate[] = [
  directiveGate,   // No directive → no writes (but reads ok)
  redFlagGate,     // Red flag files → no writes
  scopeGate,       // Outside scope → deny
  bashRiskGate,    // Dangerous commands → deny/ask
];

const BEFORE_COMPLETE_GATES: Gate[] = [
  verifierGate,        // Probe mode: verdict must be clean
  probeRequiredGate,   // Wire risk tasks: probe must complete
];

// ============================================================
// Check runners
// ============================================================

export interface CheckResult {
  allowed: boolean;
  denied: GateResult[];
  asked: GateResult[];
}

export function checkBeforeToolUse(
  ctx: GateContext,
  call: GateToolCall,
): CheckResult {
  return runGates(BEFORE_TOOL_USE_GATES, ctx, call);
}

export function checkBeforeComplete(ctx: GateContext): CheckResult {
  return runGates(BEFORE_COMPLETE_GATES, ctx, { name: "__complete__", args: {} });
}

function runGates(gates: Gate[], ctx: GateContext, call: GateToolCall): CheckResult {
  const denied: GateResult[] = [];
  const asked: GateResult[] = [];

  for (const gate of gates) {
    const result = gate.check(ctx, call);
    if (result.decision === "deny") {
      denied.push(result);
    } else if (result.decision === "ask") {
      asked.push(result);
    }
  }

  return {
    allowed: denied.length === 0,
    denied,
    asked,
  };
}

// ============================================================
// Non-interactive wrapper: deny on ask
// ============================================================

export function checkBeforeToolUseStrict(
  ctx: GateContext,
  call: GateToolCall,
): GateResult | null {
  const result = checkBeforeToolUse(ctx, call);

  if (result.denied.length > 0) {
    return result.denied[0]!;
  }

  if (result.asked.length > 0) {
    // In non-interactive mode, treat "ask" as "deny"
    return {
      decision: "deny",
      gate: result.asked[0]!.gate,
      reason: `[requires user approval] ${result.asked[0]!.reason}`,
    };
  }

  return null; // allowed
}

export function checkBeforeCompleteStrict(ctx: GateContext): GateResult | null {
  const result = checkBeforeComplete(ctx);

  if (result.denied.length > 0) {
    return result.denied[0]!;
  }

  return null; // allowed
}
