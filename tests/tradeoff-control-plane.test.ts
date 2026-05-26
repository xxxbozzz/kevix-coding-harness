// P15: Runtime Control Plane — tradeoff tests

import { describe, it, expect } from "vitest";
import { runAgentLoop } from "../src/loop/agent-loop.js";
import { GraphBuilder } from "../src/graph/builder.js";
import type { LLMProvider, ToolExecutor } from "../src/loop/agent-loop.js";
import type { LLMResponse, TokenUsage, TradeoffEvidence, TradeoffOption } from "../src/types.js";

const emptyUsage: TokenUsage = {
  prompt_tokens: 100, completion_tokens: 50,
  prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 100,
  total_tokens: 150, cache_hit_ratio: 0,
};

function directive(): string {
  return [
    "## Product Intent", "Fix API bug in src/api/handler.ts.",
    "", "## Hidden Semantics", "Handle boolean serialization.",
    "", "## Acceptance Tests", "1. true→string. 2. false→string.",
    "", "## Implementation Constraints", "Keep signatures.",
    "", "## Red Flags", "- src/api/secrets.ts",
    "", "## Coding Worker Directive", "1. Read handler.ts. 2. Fix. 3. Test.",
  ].join("\n");
}

function mockTools(): ToolExecutor {
  return { definitions: [], execute: async (c) => ({ tool_call_id: c.id, content: "ok" }) };
}

// Provider that triggers 3 gate blocks (forces gate_frequency signal)
function multiBlockProvider(redFlaggedFile: string): LLMProvider {
  let blockCount = 0;
  return {
    async call(params): Promise<LLMResponse> {
      const lastMsg = params.messages?.[params.messages.length - 1]?.content ?? "";
      const isWorker = lastMsg.includes("Directive");
      const isAfterBlock = lastMsg.includes("PEAN Gate");

      if (lastMsg.includes("Patch to Review")) {
        return { message: { role: "assistant", content: '{"verdict":"PASS","issues":[]}' }, finish_reason: "stop", usage: { ...emptyUsage } };
      }

      if (isWorker || isAfterBlock) {
        if (blockCount < 3) {
          blockCount++;
          return { message: { role: "assistant", content: "editing", tool_calls: [
            { id: `c${blockCount}`, type: "function", function: { name: "write", arguments: JSON.stringify({ file_path: redFlaggedFile, content: "x" }) } },
          ] }, finish_reason: "tool_calls", usage: { ...emptyUsage, cache_hit_ratio: 95 - blockCount * 5 } };
        }
        return { message: { role: "assistant", content: "```diff\n```" }, finish_reason: "stop", usage: { ...emptyUsage, cache_hit_ratio: 85 } };
      }

      return { message: { role: "assistant", content: directive() }, finish_reason: "stop", usage: { ...emptyUsage } };
    },
  };
}

describe("P15 Runtime Control Plane", () => {
  it("emits tradeoff_required when gate_frequency + cache_declining", async () => {
    const tradeoffs: Array<{ evidence: TradeoffEvidence }> = [];

    await runAgentLoop({
      provider: multiBlockProvider("src/auth/secrets.ts"),
      tools: mockTools(), mode: "memory",
      problem: "Fix API serialization in src/api/handler.ts", taskId: "p15-tradeoff",
      onTradeoffRequired: async (evidence, _opts) => {
        tradeoffs.push({ evidence });
        return "A"; // continue memory
      },
      onEvent: (e) => {
        if (e.type === "tradeoff_required") tradeoffs.push({ evidence: e.evidence });
      },
    });

    expect(tradeoffs.length).toBeGreaterThanOrEqual(1);
    expect(tradeoffs[0]!.evidence.activeSignals).toContain("gate_frequency");
  });

  it("user choice B: can return upgrade to probe", async () => {
    let chosenOption = "";

    await runAgentLoop({
      provider: multiBlockProvider("src/auth/secrets.ts"),
      tools: mockTools(), mode: "memory",
      problem: "Fix API bug", taskId: "p15-choice-b",
      onTradeoffRequired: async (_evidence, opts) => {
        chosenOption = opts[1]!.id; // B
        return "B";
      },
    });

    expect(chosenOption).toBe("B");
  });

  it("no tradeoff with < 2 signals", async () => {
    const tradeoffs: unknown[] = [];

    const provider: LLMProvider = {
      async call(): Promise<LLMResponse> {
        const lastMsg = arguments[0]?.messages?.[arguments[0].messages.length - 1]?.content ?? "";
        if (lastMsg.includes("Patch to Review")) {
          return { message: { role: "assistant", content: '{"verdict":"PASS","issues":[]}' }, finish_reason: "stop", usage: { ...emptyUsage } };
        }
        if (lastMsg.includes("Directive")) {
          return { message: { role: "assistant", content: "```diff\n```" }, finish_reason: "stop", usage: { ...emptyUsage, cache_hit_ratio: 95 } };
        }
        return { message: { role: "assistant", content: directive() }, finish_reason: "stop", usage: { ...emptyUsage } };
      },
    };

    await runAgentLoop({
      provider, tools: mockTools(), mode: "memory",
      problem: "Fix bug", taskId: "p15-no-tradeoff",
      onTradeoffRequired: async () => "A",
      onEvent: (e) => { if (e.type === "tradeoff_required") tradeoffs.push(e); },
    });

    expect(tradeoffs.length).toBe(0);
  });
});
