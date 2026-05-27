// P57: Kevix Memory Wiki routing tests

import { describe, expect, it } from "vitest";
import { GraphBuilder } from "../src/graph/builder.js";
import { recommendModeFromWiki } from "../src/graph/memory-wiki.js";
import { runAgentLoop } from "../src/loop/agent-loop.js";
import type { EngineEvent, LLMResponse, TokenUsage } from "../src/types.js";
import type { LLMProvider, ToolExecutor } from "../src/loop/agent-loop.js";

const usage: TokenUsage = {
  prompt_tokens: 10,
  completion_tokens: 5,
  prompt_cache_hit_tokens: 0,
  prompt_cache_miss_tokens: 10,
  total_tokens: 15,
  cache_hit_ratio: 0,
};

const directive = [
  "## Product Intent",
  "Fix boolean serialization in src/api/handler.ts.",
  "",
  "## Hidden Semantics",
  "The API boundary must preserve true and false values.",
  "",
  "## Acceptance Tests",
  "Run npm test.",
  "",
  "## Implementation Constraints",
  "Keep public signatures.",
  "",
  "## Red Flags",
  "None.",
  "",
  "## Coding Worker Directive",
  "Read src/api/handler.ts and apply the smallest correct fix.",
].join("\n");

function snapshot(taskId: string, mode: string, problem: string, phasesCompleted: string[], escalated = false): EngineEvent {
  return {
    type: "state_snapshot",
    snapshot: {
      taskId,
      mode,
      directive,
      phasesCompleted,
      tokenUsage: usage,
      gateEvents: [],
      patch: null,
      timestamp: Date.now(),
      ...(escalated ? { escalated: true } : {}),
    },
  };
}

function graphWithMemoryFailProbePass() {
  const builder = new GraphBuilder();
  const problem = "Fix boolean serialization in src/api/handler.ts";

  builder.handleEvent(snapshot("memory-fail", "memory", problem, ["controller"]), "memory-fail", problem, "memory");
  builder.handleEvent({ type: "escalate", issues: ["memory missed wire-level boolean encoding"], cycles: 2 }, "memory-fail", problem, "memory");

  builder.handleEvent(snapshot("probe-pass", "probe", problem, ["controller"]), "probe-pass", problem, "probe");
  builder.handleEvent(snapshot("probe-pass", "probe", problem, ["controller", "probe_plan", "worker", "probe_verify"]), "probe-pass", problem, "probe");

  return builder.toGraph();
}

function graphWithMemoryPass() {
  const builder = new GraphBuilder();
  const problem = "Fix null handling in src/user.ts";
  builder.handleEvent(snapshot("memory-pass", "memory", problem, ["controller"]), "memory-pass", problem, "memory");
  builder.handleEvent(snapshot("memory-pass", "memory", problem, ["controller", "worker", "worker"]), "memory-pass", problem, "memory");
  return builder.toGraph();
}

function tools(): ToolExecutor {
  return { definitions: [], execute: async (c) => ({ tool_call_id: c.id, content: "ok" }) };
}

function provider(): LLMProvider {
  return {
    async call(params): Promise<LLMResponse> {
      const last = params.messages.at(-1)?.content ?? "";
      if (last.includes("Enumerate all wire-level risks")) {
        return { message: { role: "assistant", content: "[]" }, finish_reason: "stop", usage };
      }
      if (last.includes("Verify each risk")) {
        return { message: { role: "assistant", content: '{"verdict":"clean"}' }, finish_reason: "stop", usage };
      }
      if (last.includes("Directive")) {
        return { message: { role: "assistant", content: "```diff\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n```" }, finish_reason: "stop", usage };
      }
      if (last.includes("Patch to Review")) {
        return { message: { role: "assistant", content: '{"verdict":"PASS","issues":[]}' }, finish_reason: "stop", usage };
      }
      return { message: { role: "assistant", content: directive }, finish_reason: "stop", usage };
    },
  };
}

describe("P57 Memory Wiki routing", () => {
  it("recommends probe when similar memory failed and probe passed", () => {
    const decision = recommendModeFromWiki(
      graphWithMemoryFailProbePass(),
      "Fix API boolean serialization in src/api/handler.ts",
      "auto",
    );

    expect(decision.recommendedMode).toBe("probe");
    expect(decision.confidence).toBe("high");
    expect(decision.reason).toContain("memory failed");
    expect(decision.evidence.map((e) => e.taskId)).toContain("probe-pass");
    expect(decision.evidence.map((e) => e.taskId)).toContain("memory-fail");
  });

  it("recommends memory when similar memory passed without failures", () => {
    const decision = recommendModeFromWiki(
      graphWithMemoryPass(),
      "Fix null handling in src/user.ts",
      "auto",
    );

    expect(decision.recommendedMode).toBe("memory");
    expect(decision.confidence).toBe("low");
  });

  it("falls back to auto when there is no useful history", () => {
    const decision = recommendModeFromWiki(
      graphWithMemoryPass(),
      "Fix unrelated parser in src/parser.ts",
      "auto",
    );

    expect(decision.recommendedMode).toBe("auto");
    expect(decision.confidence).toBe("none");
  });

  it("auto mode enters probe path when wiki recommends probe", async () => {
    const advisories: EngineEvent[] = [];
    const summary = await runAgentLoop({
      provider: provider(),
      tools: tools(),
      mode: "auto",
      problem: "Fix API boolean serialization in src/api/handler.ts",
      taskId: "wiki-route",
      graph: graphWithMemoryFailProbePass(),
      onEvent: (e) => {
        if (e.type === "advisory") advisories.push(e);
      },
    });

    expect(advisories.some((e) => e.type === "advisory" && e.signal === "memory_wiki_route")).toBe(true);
    expect(summary.phases_completed).toContain("probe_plan");
    expect(summary.phases_completed).toContain("probe_verify");
  });
});
