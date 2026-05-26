// Gate 1: Directive Gate
// No valid directive → no Write/Edit/Bash. Read/Glob/Grep still allowed.

import type { Gate, GateResult, GateContext, GateToolCall } from "./types.js";

const READONLY_TOOLS = new Set(["read", "grep", "glob"]);

const REQUIRED_SECTIONS = [
  "product_intent",
  "hidden_semantics",
  "acceptance_tests",
  "implementation_constraints",
  "red_flags",
  "worker_directive",
] as const;

export const directiveGate: Gate = {
  name: "directive",

  check(ctx: GateContext, call: GateToolCall): GateResult {
    // Always allow read-only tools — worker can explore before directive
    if (READONLY_TOOLS.has(call.name)) {
      return { decision: "allow", gate: "directive", reason: "Read-only tool" };
    }

    // No directive at all
    if (!ctx.directive) {
      return {
        decision: "deny",
        gate: "directive",
        reason: "No PEAN directive exists. Controller must produce a directive before Worker can write code.",
      };
    }

    // Check required sections have content
    const missing: string[] = [];
    for (const section of REQUIRED_SECTIONS) {
      const value = ctx.directive[section];
      if (!value || value.trim().length < 20) {
        missing.push(section.replace(/_/g, " "));
      }
    }

    if (missing.length > 0) {
      return {
        decision: "deny",
        gate: "directive",
        reason: `Directive missing or incomplete sections: ${missing.join(", ")}`,
      };
    }

    return { decision: "allow", gate: "directive", reason: "Directive valid" };
  },
};
