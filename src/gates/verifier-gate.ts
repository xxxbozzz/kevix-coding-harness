// Gate 5: Verifier Verdict Gate
// In probe mode, verifier must return "clean" before task can complete.
// If verdict is "needs_revision" and revision budget remains, block completion.

import type { Gate, GateResult, GateContext, GateToolCall } from "./types.js";

export const verifierGate: Gate = {
  name: "verifier-verdict",

  check(ctx: GateContext, _call: GateToolCall): GateResult {
    // Only relevant for probe mode
    if (ctx.mode !== "probe") {
      return { decision: "allow", gate: "verifier-verdict", reason: "Not probe mode" };
    }

    // Probe verification not yet run
    if (ctx.verifierVerdict === null) {
      return {
        decision: "deny",
        gate: "verifier-verdict",
        reason: "Probe mode requires verification. Probe verify phase has not been executed.",
      };
    }

    // Verification found issues, revision budget remaining
    if (
      ctx.verifierVerdict === "needs_revision" &&
      ctx.revisionCount < ctx.maxRevisions
    ) {
      return {
        decision: "deny",
        gate: "verifier-verdict",
        reason: `Verification found issues (cycle ${ctx.revisionCount}/${ctx.maxRevisions}). Revision required before completion.`,
      };
    }

    // Verification found issues, budget exhausted
    if (
      ctx.verifierVerdict === "needs_revision" &&
      ctx.revisionCount >= ctx.maxRevisions
    ) {
      return {
        decision: "allow",
        gate: "verifier-verdict",
        reason: `Max revisions (${ctx.maxRevisions}) reached. Allowing completion despite verification issues.`,
      };
    }

    // Clean verdict
    return { decision: "allow", gate: "verifier-verdict", reason: "Verdict: clean" };
  },
};
