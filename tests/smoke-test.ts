// Simple smoke test — no test framework needed.
// Run with: npx tsx tests/smoke-test.ts

import { runAgentLoop } from "../src/loop/agent-loop.js";
import type { LLMProvider, ToolExecutor } from "../src/loop/agent-loop.js";
import type { ChatMessage, ToolDefinition, LLMResponse, TokenUsage } from "../src/types.js";

const emptyUsage: TokenUsage = {
  prompt_tokens: 100, completion_tokens: 50,
  prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 100,
  total_tokens: 150, cache_hit_ratio: 0,
};

const mockProvider: LLMProvider = {
  async call(params): Promise<LLMResponse> {
    const lastMsg = params.messages[params.messages.length - 1]?.content ?? "";
    if (!lastMsg.includes("Directive") && !lastMsg.includes("directive")) {
      return { message: { role: "assistant", content: `## Product Intent\nTest fix.\n\n## Hidden Semantics\nEdge cases.\n\n## Acceptance Tests\n1. Works.\n\n## Implementation Constraints\nNone.\n\n## Red Flags\nNone.\n\n## Coding Worker Directive\nFix it.` }, finish_reason: "stop", usage: { ...emptyUsage } };
    }
    return { message: { role: "assistant", content: "```diff\n--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-old\n+new\n```" }, finish_reason: "stop", usage: { ...emptyUsage } };
  },
};

const mockTools: ToolExecutor = {
  definitions: [],
  async execute(call) { return { tool_call_id: call.id, content: "ok" }; },
};

async function main() {
  console.log("Test 1: memory mode...");
  const r1 = await runAgentLoop({
    provider: mockProvider, tools: mockTools, mode: "memory",
    problem: "Fix bug", taskId: "smoke-1",
  });
  console.log(`  phases: ${r1.phases_completed.join(" → ")}`);
  console.assert(r1.phases_completed.includes("controller"), "Missing controller");
  console.assert(r1.phases_completed.includes("worker"), "Missing worker");
  console.log("  PASS");

  console.log("Test 2: auto mode...");
  const r2 = await runAgentLoop({
    provider: mockProvider, tools: mockTools, mode: "auto",
    problem: "Fix bug", taskId: "smoke-2",
  });
  console.log(`  phases: ${r2.phases_completed.join(" → ")}`);
  console.assert(r2.phases_completed.includes("assess"), "Missing assess");
  console.log("  PASS");

  console.log("Test 3: probe mode...");
  const r3 = await runAgentLoop({
    provider: mockProvider, tools: mockTools, mode: "probe",
    problem: "Fix bug", taskId: "smoke-3",
  });
  console.log(`  phases: ${r3.phases_completed.join(" → ")}`);
  console.assert(r3.phases_completed.includes("probe_verify"), "Missing probe_verify");
  console.log("  PASS");

  console.log("\nAll smoke tests passed!");
}

main().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
