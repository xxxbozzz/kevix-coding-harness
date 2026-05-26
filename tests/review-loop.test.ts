// Review Auto-loop tests — PASS, BLOCKED→revise, escalate

import { describe, it, expect } from "vitest";
import { runAgentLoop } from "../src/loop/agent-loop.js";
import type { LLMProvider, ToolExecutor } from "../src/loop/agent-loop.js";
import type { LLMResponse, TokenUsage } from "../src/types.js";

const emptyUsage: TokenUsage = {
  prompt_tokens: 100, completion_tokens: 50,
  prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 100,
  total_tokens: 150, cache_hit_ratio: 0,
};

function directive(): string {
  return [
    "## Product Intent", "Fix login validation bug.",
    "", "## Hidden Semantics", "Empty and null inputs must not crash.",
    "", "## Acceptance Tests", "1. Empty input handled. 2. Null input handled.",
    "", "## Implementation Constraints", "Preserve function signatures.",
    "", "## Red Flags", "- src/auth/secrets.ts",
    "", "## Coding Worker Directive", "1. Read src/login.ts. 2. Add null guard. 3. Verify.",
  ].join("\n");
}

function mockTools(): ToolExecutor {
  return { definitions: [], execute: async (c) => ({ tool_call_id: c.id, content: "ok" }) };
}

// Provider that returns proper review verdicts
function reviewProvider(verdicts: Array<"PASS" | "BLOCKED">, patch?: string): LLMProvider {
  let reviewIdx = 0;

  return {
    async call(params): Promise<LLMResponse> {
      const lastMsg = params.messages[params.messages.length - 1]?.content ?? "";

      // Review phase — return configured verdict
      if (lastMsg.includes("Patch to Review")) {
        const v = verdicts[reviewIdx] ?? verdicts[verdicts.length - 1]!;
        reviewIdx++;
        if (v === "PASS") {
          return { message: { role: "assistant", content: "## Verdict: PASS\n## Issues Found\nNone." }, finish_reason: "stop", usage: { ...emptyUsage } };
        }
        return { message: { role: "assistant", content: "## Verdict: BLOCKED\n## Issues Found\n1. Missing null check in processInput\n2. No test for empty string\n\n**Evidence**: line 15 does not guard against null.\n\n**Required Fixes**: Add `if (input == null) return '';` at the top of processInput." }, finish_reason: "stop", usage: { ...emptyUsage } };
      }

      // Worker — return patch
      if (lastMsg.includes("Directive") || lastMsg.includes("directive")) {
        return { message: { role: "assistant", content: patch || "```diff\n--- a/src/login.ts\n+++ b/src/login.ts\n@@ -1,0 +1,1 @@\n+  if (!input) return '';\n```" }, finish_reason: "stop", usage: { ...emptyUsage } };
      }

      // Controller — return directive
      return { message: { role: "assistant", content: directive() }, finish_reason: "stop", usage: { ...emptyUsage } };
    },
  };
}

describe("Review Auto-loop", () => {
  it("completes when review PASSes on first attempt", async () => {
    const summary = await runAgentLoop({
      provider: reviewProvider(["PASS"]), tools: mockTools(),
      mode: "memory", problem: "Fix login", taskId: "review-pass",
    });
    expect(summary.escalated).toBeFalsy();
    expect(summary.review_issues?.length ?? 0).toBe(0);
  });

  it("revises and retries when review BLOCKED then PASSes", async () => {
    const summary = await runAgentLoop({
      provider: reviewProvider(["BLOCKED", "PASS"]), tools: mockTools(),
      mode: "memory", problem: "Fix login", taskId: "review-retry",
    });
    expect(summary.escalated).toBeFalsy();
    expect(summary.review_issues).toBeTruthy();
    expect(summary.review_issues!.length).toBe(2); // from BLOCKED verdict
  });

  it("escalates after 2 BLOCKED reviews (max cycles exhausted)", async () => {
    const events: string[] = [];
    const summary = await runAgentLoop({
      provider: reviewProvider(["BLOCKED", "BLOCKED"]), tools: mockTools(),
      mode: "memory", problem: "Fix login", taskId: "review-escalate",
      onEvent: (e) => { if (e.type === "escalate") events.push("escalate"); },
    });
    expect(summary.escalated).toBe(true);
    expect(events).toContain("escalate");
  });
});
