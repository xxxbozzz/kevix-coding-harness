// P16: Graph persistence + Tradeoff B/C action

import { describe, it, expect } from "vitest";
import { rmSync, existsSync } from "node:fs";
import { GraphBuilder } from "../src/graph/builder.js";
import { emptyGraph } from "../src/graph/types.js";
import { runAgentLoop } from "../src/loop/agent-loop.js";
import type { LLMProvider, ToolExecutor } from "../src/loop/agent-loop.js";
import type { LLMResponse, TokenUsage } from "../src/types.js";

const emptyUsage: TokenUsage = {
  prompt_tokens: 100, completion_tokens: 50,
  prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 100,
  total_tokens: 150, cache_hit_ratio: 0,
};

const TEST_PATH = "/tmp/kevix-test-graph.json";

function directive(): string {
  return [
    "## Product Intent", "Fix bug.", "## Hidden Semantics", "Handle nulls.",
    "## Acceptance Tests", "1. Works.", "## Implementation Constraints", "None.",
    "## Red Flags", "- src/secrets.ts", "## Coding Worker Directive", "Fix it.",
  ].join("\n");
}

function mockTools(): ToolExecutor {
  return { definitions: [], execute: async (c) => ({ tool_call_id: c.id, content: "ok" }) };
}

describe("P16 Graph Persistence", () => {
  it("save and load round-trips correctly", () => {
    rmSync(TEST_PATH, { force: true });

    const builder = new GraphBuilder();
    builder.handleEvent(
      { type: "state_snapshot", snapshot: { taskId: "p16-task", mode: "memory", directive: directive(), phasesCompleted: ["controller"], tokenUsage: { ...emptyUsage }, gateEvents: [], patch: null, timestamp: Date.now() } },
      "p16-task", "Fix bug", "memory",
    );
    const before = builder.toGraph();
    expect(before.nodes["task:p16-task"]).toBeTruthy();

    builder.save(TEST_PATH);
    expect(existsSync(TEST_PATH)).toBe(true);

    const loaded = GraphBuilder.load(TEST_PATH);
    expect(loaded.nodes["task:p16-task"]).toBeTruthy();

    rmSync(TEST_PATH, { force: true });
  });

  it("load returns empty graph for missing file", () => {
    const graph = GraphBuilder.load("/tmp/nonexistent-graph.json");
    expect(graph.nodes).toEqual({});
    expect(graph.edges).toEqual([]);
  });
});

describe("P16 Tradeoff B/C Action", () => {
  it("tradeoff B switches to probe mode", async () => {
    let blockCount = 0;
    const provider: LLMProvider = {
      async call(params): Promise<LLMResponse> {
        const lastMsg = params.messages?.[params.messages.length - 1]?.content ?? "";
        if (lastMsg.includes("Enumerate all wire-level risks")) {
          return { message: { role: "assistant", content: "[]" }, finish_reason: "stop", usage: { ...emptyUsage } };
        }
        if (lastMsg.includes("Verify each risk")) {
          return { message: { role: "assistant", content: '{"verdict":"clean"}' }, finish_reason: "stop", usage: { ...emptyUsage } };
        }
        if (lastMsg.includes("Patch to Review")) {
          return { message: { role: "assistant", content: '{"verdict":"PASS","issues":[]}' }, finish_reason: "stop", usage: { ...emptyUsage } };
        }
        if (lastMsg.includes("Directive") || lastMsg.includes("PEAN Gate")) {
          if (blockCount < 3) {
            blockCount++;
            return { message: { role: "assistant", content: "edit", tool_calls: [
              { id: `c${blockCount}`, type: "function", function: { name: "write", arguments: JSON.stringify({ file_path: "src/secrets.ts", content: "x" }) } },
            ] }, finish_reason: "tool_calls", usage: { ...emptyUsage, cache_hit_ratio: 95 - blockCount * 10 } };
          }
          return { message: { role: "assistant", content: "```diff\n```" }, finish_reason: "stop", usage: { ...emptyUsage, cache_hit_ratio: 85 } };
        }
        return { message: { role: "assistant", content: directive() }, finish_reason: "stop", usage: { ...emptyUsage } };
      },
    };

    const phases: string[] = [];
    const summary = await runAgentLoop({
      provider, tools: mockTools(), mode: "memory",
      problem: "Fix API serialization bug", taskId: "p16-tradeoff-b",
      onTradeoffRequired: async () => "B",
      onEvent: (e) => { if (e.type === "step_complete" && e.phase) phases.push(e.phase); },
    });

    expect(phases).toContain("probe_plan");
    expect(phases).toContain("probe_verify");
  });

  it("tradeoff C pauses (escalates)", async () => {
    let blockCount = 0;
    const provider: LLMProvider = {
      async call(params): Promise<LLMResponse> {
        const lastMsg = params.messages?.[params.messages.length - 1]?.content ?? "";
        if (lastMsg.includes("Patch to Review")) {
          return { message: { role: "assistant", content: '{"verdict":"PASS","issues":[]}' }, finish_reason: "stop", usage: { ...emptyUsage } };
        }
        if (lastMsg.includes("Directive") || lastMsg.includes("PEAN Gate")) {
          if (blockCount < 3) {
            blockCount++;
            return { message: { role: "assistant", content: "edit", tool_calls: [
              { id: `c${blockCount}`, type: "function", function: { name: "write", arguments: JSON.stringify({ file_path: "src/secrets.ts", content: "x" }) } },
            ] }, finish_reason: "tool_calls", usage: { ...emptyUsage, cache_hit_ratio: 95 - blockCount * 10 } };
          }
          return { message: { role: "assistant", content: "```diff\n```" }, finish_reason: "stop", usage: { ...emptyUsage, cache_hit_ratio: 85 } };
        }
        return { message: { role: "assistant", content: directive() }, finish_reason: "stop", usage: { ...emptyUsage } };
      },
    };

    const summary = await runAgentLoop({
      provider, tools: mockTools(), mode: "memory",
      problem: "Fix bug", taskId: "p16-tradeoff-c",
      onTradeoffRequired: async () => "C",
    });

    expect(summary.escalated).toBe(true);
  });
});
