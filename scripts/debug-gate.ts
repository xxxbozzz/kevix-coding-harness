// Quick debug: does the agent loop complete with gate-blocked tool_call?
import { runAgentLoop } from "../src/loop/agent-loop.js";

let phase = 0;
const provider = {
  async call(_params: any) {
    phase++;
    console.log(`  [phase ${phase}] called, lastMsg first 80 chars: "${(_params.messages[_params.messages.length - 1]?.content ?? "").slice(0, 80)}"`);
    if (phase === 1) {
      return { message: { role: "assistant", content: `## Product Intent\nFix.\n\n## Hidden Semantics\nEdge.\n\n## Acceptance Tests\n1. t.\n\n## Implementation Constraints\nNone.\n\n## Red Flags\n- src/auth/secrets.ts\n\n## Coding Worker Directive\nEdit.` }, finish_reason: "stop", usage: { prompt_tokens: 100, completion_tokens: 50, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 100, total_tokens: 150, cache_hit_ratio: 0 } };
    }
    if (phase === 2) {
      return { message: { role: "assistant", content: "editing", tool_calls: [{ id: "c1", type: "function", function: { name: "write", arguments: `{"file_path":"src/auth/secrets.ts","content":"x"}` } }] }, finish_reason: "tool_calls", usage: { prompt_tokens: 100, completion_tokens: 50, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 100, total_tokens: 150, cache_hit_ratio: 0 } };
    }
    console.log(`  [phase ${phase}] returning final patch`);
    return { message: { role: "assistant", content: "Fixed: ```diff\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n```" }, finish_reason: "stop", usage: { prompt_tokens: 100, completion_tokens: 50, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 100, total_tokens: 150, cache_hit_ratio: 0 } };
  },
};

const tools = {
  definitions: [],
  async execute(call: any) {
    console.log(`  EXECUTE called for: ${call.function.name} — THIS SHOULD NOT HAPPEN`);
    return { tool_call_id: call.id, content: "executed" };
  },
};

async function main() {
  console.log("Starting debug test...");
  const t0 = Date.now();
  const timeout = setTimeout(() => {
    console.log("TIMEOUT after 5s — agent loop is stuck!");
    process.exit(1);
  }, 5000);

  const result = await runAgentLoop({
    provider: provider as any,
    tools: tools as any,
    mode: "memory",
    problem: "Fix",
    taskId: "debug",
    onEvent: (e: any) => {
      if (e.type === "log") console.log(`  [LOG] ${e.text}`);
      if (e.type === "error") console.log(`  [ERROR] ${e.message}`);
    },
  });

  clearTimeout(timeout);
  console.log(`\nCompleted in ${Date.now() - t0}ms`);
  console.log(`phases: ${result.phases_completed.join(" → ")}`);
  console.log("PASS");
}

main().catch((e) => { console.error("FAIL:", e); process.exit(1); });
