// L2 Smoke Test — kevix engine on real DeepSeek API
// ===================================================
// Runs memory mode (Controller → Worker) on a real bug in kevix/engine.
//
// Task: Replace plain `throw new Error(...)` in agent-loop.ts with
//       structured `LoopExhaustedError` from errors.ts.
//
// Usage: DEEPSEEK_API_KEY=sk-xxx npx tsx scripts/l2-smoke.ts

import { runAgentLoop } from "../src/loop/agent-loop.js";
import { DeepSeekProvider } from "../src/provider/deepseek.js";
import { bashDefinition, executeBash } from "../src/tools/bash.js";
import { readDefinition, executeRead } from "../src/tools/read.js";
import { writeDefinition, executeWrite } from "../src/tools/write.js";
import { editDefinition, executeEdit } from "../src/tools/edit.js";
import { grepDefinition, executeGrep } from "../src/tools/grep.js";
import { globDefinition, executeGlob } from "../src/tools/glob.js";
import type { ToolDefinition, ToolCall, ToolResult } from "../src/types.js";

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) {
  console.error("DEEPSEEK_API_KEY not set");
  process.exit(1);
}

const TOOLS: ToolDefinition[] = [
  bashDefinition, readDefinition, writeDefinition,
  editDefinition, grepDefinition, globDefinition,
];

async function executeTool(call: ToolCall): Promise<ToolResult> {
  const name = call.function.name;
  let args: Record<string, unknown>;
  try { args = JSON.parse(call.function.arguments); }
  catch { return { tool_call_id: call.id, content: "Invalid JSON arguments", is_error: true }; }

  try {
    switch (name) {
      case "bash": return await executeBash(args);
      case "read": return await executeRead(args);
      case "write": return await executeWrite(args);
      case "edit": return await executeEdit(args);
      case "grep": return await executeGrep(args);
      case "glob": return await executeGlob(args);
      default: return { tool_call_id: call.id, content: `Unknown tool: ${name}`, is_error: true };
    }
  } catch (e: any) {
    return { tool_call_id: call.id, content: `Tool error: ${e.message}`, is_error: true };
  }
}

const PROBLEM = `In the file src/loop/agent-loop.ts at the bottom of the runToolLoop function,
there is a plain "throw new Error(...)" for the max tool rounds case.
Replace it with "throw new LoopExhaustedError(rounds)" which is already defined
in src/errors.ts (class LoopExhaustedError extends KevixError).

Steps:
1. grep for "throw new Error" in src/loop/agent-loop.ts to find the exact line
2. read the surrounding context
3. use edit to replace the throw statement
4. verify the import for LoopExhaustedError exists at the top of the file`;

async function main() {
  console.log("=".repeat(60));
  console.log("  kevix L2 Smoke Test — Memory Mode on Real API");
  console.log("=".repeat(60));
  console.log(`  Task: Fix throw new Error → LoopExhaustedError in agent-loop.ts`);
  console.log(`  Model: deepseek-v4-pro`);
  console.log();

  const provider = new DeepSeekProvider(API_KEY, { model: "deepseek-v4-pro" });
  const tools = {
    definitions: TOOLS,
    execute: executeTool,
  };

  const summary = await runAgentLoop({
    provider,
    tools,
    mode: "memory",
    problem: PROBLEM,
    taskId: `l2-smoke-${Date.now()}`,
    onEvent: (e) => {
      switch (e.type) {
        case "step_start":
          console.log(`\n[${e.phase.toUpperCase()}] Starting...`);
          break;
        case "step_complete":
          console.log(`[${e.phase.toUpperCase()}] Done (${e.duration_ms}ms)`);
          break;
        case "directive":
          console.log(`\n--- Directive ---\nProduct Intent: ${e.directive.product_intent.slice(0, 120)}...`);
          break;
        case "api_call":
          console.log(`  API call #${e.request_index}: ${e.usage.prompt_tokens}p/${e.usage.completion_tokens}c | cache ${e.usage.cache_hit_ratio}%`);
          break;
        case "log":
          console.log(`  ${e.text}`);
          break;
        case "error":
          console.error(`  ERROR: ${e.message}`);
          break;
      }
    },
  });

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Phases: ${summary.phases_completed.join(" → ")}`);
  console.log(`  API calls: ${summary.request_count}`);
  console.log(`${"=".repeat(60)}`);
}

main().catch((e) => {
  console.error("L2 Smoke FAILED:", e.message);
  process.exit(1);
});
