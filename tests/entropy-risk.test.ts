// P12+P13: Entropy advisory + Graph risk hint tests

import { describe, it, expect } from "vitest";
import { runAgentLoop } from "../src/loop/agent-loop.js";
import { GraphBuilder } from "../src/graph/builder.js";
import type { LLMProvider, ToolExecutor } from "../src/loop/agent-loop.js";
import type { LLMResponse, TokenUsage } from "../src/types.js";

const emptyUsage: TokenUsage = {
  prompt_tokens: 100, completion_tokens: 50,
  prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 100,
  total_tokens: 150, cache_hit_ratio: 0,
};

function directive(): string {
  return [
    "## Product Intent", "Fix login bug in src/auth/login.ts.",
    "", "## Hidden Semantics", "Handle null and empty inputs.",
    "", "## Acceptance Tests", "1. Null handled. 2. Empty handled.",
    "", "## Implementation Constraints", "Keep function signatures.",
    "", "## Red Flags", "- src/auth/secrets.ts",
    "", "## Coding Worker Directive", "1. Read login.ts. 2. Add guards. 3. Test.",
  ].join("\n");
}

function mockTools(): ToolExecutor {
  return { definitions: [], execute: async (c) => ({ tool_call_id: c.id, content: "ok" }) };
}

// Provider that returns multiple tool_calls which keep getting gate-blocked
function gateTriggerProvider(gateFilePath: string): LLMProvider {
  let toolCallCount = 0;
  return {
    async call(params): Promise<LLMResponse> {
      const lastMsg = params.messages?.[params.messages.length - 1]?.content ?? "";
      const isFirstWorker = lastMsg.includes("Directive");

      // Review phase
      if (lastMsg.includes("Patch to Review")) {
        return { message: { role: "assistant", content: '{"verdict":"PASS","issues":[]}' }, finish_reason: "stop", usage: { ...emptyUsage } };
      }

      // Worker phase: return tool calls until we've had 4 blocks
      if (isFirstWorker || lastMsg.includes("PEAN Gate") || (lastMsg.includes("editing") && toolCallCount > 0)) {
        if (toolCallCount < 4) {
          toolCallCount++;
          return {
            message: { role: "assistant", content: "editing", tool_calls: [
              { id: `c${toolCallCount}`, type: "function", function: { name: "write", arguments: JSON.stringify({ file_path: gateFilePath, content: "x" }) } },
            ] },
            finish_reason: "tool_calls", usage: { ...emptyUsage, cache_hit_ratio: 95 - toolCallCount * 10 },
          };
        }
        return { message: { role: "assistant", content: "```diff\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n```" }, finish_reason: "stop", usage: { ...emptyUsage } };
      }

      // Controller
      return { message: { role: "assistant", content: directive() }, finish_reason: "stop", usage: { ...emptyUsage } };
    },
  };
}

// ============================================================
// P12: Entropy Advisory
// ============================================================
describe("P12 Entropy Advisory", () => {
  it("emits tradeoff_required when gate >= 3 and cache declining", async () => {
    const tradeoffs: Array<{ evidence: { activeSignals: string[] } }> = [];

    await runAgentLoop({
      provider: gateTriggerProvider("src/auth/secrets.ts"),
      tools: mockTools(),
      mode: "memory",
      problem: "Fix bug in src/auth/login.ts",
      taskId: "p12-test",
      onTradeoffRequired: async (evidence) => {
        tradeoffs.push({ evidence });
        return "A";
      },
      onEvent: (e) => { if (e.type === "tradeoff_required") tradeoffs.push({ evidence: e.evidence }); },
    });

    expect(tradeoffs.length).toBeGreaterThanOrEqual(1);
    expect(tradeoffs[0]!.evidence.activeSignals).toContain("gate_frequency");
  });

  it("does not emit advisory when gate events < 3", async () => {
    const advisories: Array<unknown> = [];
    const provider: LLMProvider = {
      async call(): Promise<LLMResponse> {
        const lastMsg = arguments[0]?.messages?.[arguments[0].messages.length - 1]?.content ?? "";
        if (lastMsg.includes("Directive") || lastMsg.includes("directive")) {
          return { message: { role: "assistant", content: "```diff\n--- a/x\n+++ b/x\n-old\n+new\n```" }, finish_reason: "stop", usage: { ...emptyUsage } };
        }
        if (lastMsg.includes("Patch to Review")) {
          return { message: { role: "assistant", content: '{"verdict":"PASS","issues":[]}' }, finish_reason: "stop", usage: { ...emptyUsage } };
        }
        return { message: { role: "assistant", content: directive() }, finish_reason: "stop", usage: { ...emptyUsage } };
      },
    };

    await runAgentLoop({
      provider, tools: mockTools(), mode: "memory",
      problem: "Fix bug", taskId: "p12-no-advisory",
      onEvent: (e) => { if (e.type === "advisory") advisories.push(e); },
    });

    expect(advisories.length).toBe(0);
  });
});

// ============================================================
// P13: Graph Risk Hint
// ============================================================
describe("P13 Graph Risk Hint", () => {
  it("emits risk_hint when graph has historical data for relevant files", async () => {
    // Build graph with historical gate event on the target file
    const builder = new GraphBuilder();
    builder.handleEvent(
      { type: "state_snapshot", snapshot: { taskId: "old-task", mode: "memory", directive: directive(), phasesCompleted: ["controller"], tokenUsage: { ...emptyUsage }, gateEvents: [], patch: null, timestamp: Date.now() } },
      "old-task", "Fix login", "memory",
    );
    builder.handleEvent(
      { type: "log", level: "warn", text: "Gate blocked write: [scope] write: path outside project: src/auth/login.ts" },
      "old-task", "Fix login", "memory",
    );
    const graph = builder.toGraph();

    const hints: Array<{ findings: unknown[] }> = [];

    const provider: LLMProvider = {
      async call(): Promise<LLMResponse> {
        const lastMsg = arguments[0]?.messages?.[arguments[0].messages.length - 1]?.content ?? "";
        if (lastMsg.includes("Directive")) {
          return { message: { role: "assistant", content: "```diff\n--- a/x\n+++ b/x\n-old\n+new\n```" }, finish_reason: "stop", usage: { ...emptyUsage } };
        }
        if (lastMsg.includes("Patch to Review")) {
          return { message: { role: "assistant", content: '{"verdict":"PASS","issues":[]}' }, finish_reason: "stop", usage: { ...emptyUsage } };
        }
        return { message: { role: "assistant", content: directive() }, finish_reason: "stop", usage: { ...emptyUsage } };
      },
    };

    await runAgentLoop({
      provider, tools: mockTools(), mode: "memory",
      problem: "Fix bug in src/auth/login.ts", taskId: "p13-test",
      graph,
      onEvent: (e) => { if (e.type === "risk_hint") hints.push({ findings: e.findings }); },
    });

    expect(hints.length).toBeGreaterThanOrEqual(1);
  });

  it("does not crash when no graph provided", async () => {
    const provider: LLMProvider = {
      async call(): Promise<LLMResponse> {
        const lastMsg = arguments[0]?.messages?.[arguments[0].messages.length - 1]?.content ?? "";
        if (lastMsg.includes("Directive")) {
          return { message: { role: "assistant", content: "```diff\n```" }, finish_reason: "stop", usage: { ...emptyUsage } };
        }
        if (lastMsg.includes("Patch to Review")) {
          return { message: { role: "assistant", content: '{"verdict":"PASS","issues":[]}' }, finish_reason: "stop", usage: { ...emptyUsage } };
        }
        return { message: { role: "assistant", content: directive() }, finish_reason: "stop", usage: { ...emptyUsage } };
      },
    };

    const summary = await runAgentLoop({
      provider, tools: mockTools(), mode: "memory",
      problem: "Fix bug", taskId: "p13-no-graph",
      // no graph
    });

    expect(summary.phases_completed).toContain("controller");
  });
});
