// P14: Auto assess with graph history

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
    "## Product Intent", "Fix API serialization bug in src/api/handler.ts.",
    "", "## Hidden Semantics", "Boolean values must be serialized correctly.",
    "", "## Acceptance Tests", "1. true→'true'. 2. false→'false'.",
    "", "## Implementation Constraints", "Keep function signatures.",
    "", "## Red Flags", "- src/api/secrets.ts",
    "", "## Coding Worker Directive", "1. Read handler.ts. 2. Fix encoding. 3. Test.",
  ].join("\n");
}

function mockTools(): ToolExecutor {
  return { definitions: [], execute: async (c) => ({ tool_call_id: c.id, content: "ok" }) };
}

function mockProvider(assessNeedProbe: boolean = false): LLMProvider {
  return {
    async call(params): Promise<LLMResponse> {
      const lastMsg = params.messages?.[params.messages.length - 1]?.content ?? "";

      if (lastMsg.includes("Assess wire-level risk")) {
        return {
          message: { role: "assistant", content: JSON.stringify({ need_probe: assessNeedProbe, reason: assessNeedProbe ? "historical risk data found" : "no wire risk" }) },
          finish_reason: "stop", usage: { ...emptyUsage },
        };
      }
      if (lastMsg.includes("Patch to Review")) {
        return { message: { role: "assistant", content: '{"verdict":"PASS","issues":[]}' }, finish_reason: "stop", usage: { ...emptyUsage } };
      }
      if (lastMsg.includes("Directive")) {
        return { message: { role: "assistant", content: "```diff\n--- a/x\n+++ b/x\n-old\n+new\n```" }, finish_reason: "stop", usage: { ...emptyUsage } };
      }
      return { message: { role: "assistant", content: directive() }, finish_reason: "stop", usage: { ...emptyUsage } };
    },
  };
}

describe("P14 Auto Assess + Graph", () => {
  it("auto mode works without graph (behavior unchanged)", async () => {
    const phases: string[] = [];
    await runAgentLoop({
      provider: mockProvider(false), tools: mockTools(), mode: "auto",
      problem: "Fix serialization in src/api/handler.ts", taskId: "p14-no-graph",
      onEvent: (e) => { if (e.type === "step_complete") phases.push(e.phase); },
    });
    expect(phases).toContain("controller");
    expect(phases).toContain("assess");
  });

  it("auto mode includes assess phase when graph has history for target file", async () => {
    // Build graph with gate event on handler.ts
    const builder = new GraphBuilder();
    builder.handleEvent(
      { type: "state_snapshot", snapshot: { taskId: "old-task", mode: "memory", directive: directive(), phasesCompleted: ["controller"], tokenUsage: { ...emptyUsage }, gateEvents: [], patch: null, timestamp: Date.now() } },
      "old-task", "Fix serialization", "memory",
    );
    builder.handleEvent(
      { type: "log", level: "warn", text: "Gate blocked write: [scope] write: outside project: src/api/handler.ts" },
      "old-task", "Fix serialization", "memory",
    );
    const graph = builder.toGraph();

    const decisions: Array<{ need_probe: boolean }> = [];
    await runAgentLoop({
      provider: mockProvider(false), tools: mockTools(), mode: "auto",
      problem: "Fix serialization in src/api/handler.ts", taskId: "p14-graph",
      graph,
      onEvent: (e) => {
        if (e.type === "decision") decisions.push({ need_probe: e.need_probe });
      },
    });

    expect(decisions.length).toBeGreaterThanOrEqual(1);
  });

  it("probe mode still works with graph", async () => {
    const builder = new GraphBuilder();
    builder.handleEvent(
      { type: "state_snapshot", snapshot: { taskId: "old", mode: "memory", directive: directive(), phasesCompleted: ["controller"], tokenUsage: { ...emptyUsage }, gateEvents: [], patch: null, timestamp: Date.now() } },
      "old", "Fix serialization", "memory",
    );
    const graph = builder.toGraph();

    let provider = {
      async call(params: any): Promise<LLMResponse> {
        const lastMsg = params.messages?.[params.messages.length - 1]?.content ?? "";
        if (lastMsg.includes("Enumerate all wire-level risks")) {
          return { message: { role: "assistant", content: "[]" }, finish_reason: "stop", usage: { ...emptyUsage } };
        }
        if (lastMsg.includes("Verify each risk")) {
          return { message: { role: "assistant", content: '{"verdict":"clean"}' }, finish_reason: "stop", usage: { ...emptyUsage } };
        }
        if (lastMsg.includes("Directive")) {
          return { message: { role: "assistant", content: "```diff\n--- a/x\n+++ b/x\n-old\n+new\n```" }, finish_reason: "stop", usage: { ...emptyUsage } };
        }
        return { message: { role: "assistant", content: directive() }, finish_reason: "stop", usage: { ...emptyUsage } };
      },
    };

    const summary = await runAgentLoop({
      provider, tools: mockTools(), mode: "probe",
      problem: "Fix serialization in src/api/handler.ts", taskId: "p14-probe-graph",
      graph,
    });

    expect(summary.phases_completed).toContain("probe_verify");
  });
});
