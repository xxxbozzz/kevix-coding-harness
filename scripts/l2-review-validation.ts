// L2 Review-loop Validation
// Trap tasks designed to test whether Review catches Worker mistakes.
// Usage: DEEPSEEK_API_KEY=sk-xxx npx tsx scripts/l2-review-validation.ts

import { writeFileSync, mkdirSync } from "node:fs";
import { runAgentLoop } from "../src/loop/agent-loop.js";
import { DeepSeekProvider } from "../src/provider/deepseek.js";
import { bashDefinition, executeBash } from "../src/tools/bash.js";
import { readDefinition, executeRead } from "../src/tools/read.js";
import { writeDefinition, executeWrite } from "../src/tools/write.js";
import { editDefinition, executeEdit } from "../src/tools/edit.js";
import { grepDefinition, executeGrep } from "../src/tools/grep.js";
import { globDefinition, executeGlob } from "../src/tools/glob.js";
import type { ToolDefinition, ToolCall, ToolResult, EngineEvent } from "../src/types.js";

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) { console.error("DEEPSEEK_API_KEY not set"); process.exit(1); }

const TOOLS: ToolDefinition[] = [
  bashDefinition, readDefinition, writeDefinition,
  editDefinition, grepDefinition, globDefinition,
];

async function executeTool(call: ToolCall): Promise<ToolResult> {
  const name = call.function.name;
  let args: Record<string, unknown>;
  try { args = JSON.parse(call.function.arguments); }
  catch { return { tool_call_id: call.id, content: "Invalid JSON args", is_error: true }; }
  try {
    switch (name) {
      case "bash": return await executeBash(args);
      case "read": return await executeRead(args);
      case "write": return await executeWrite(args);
      case "edit": return await executeEdit(args);
      case "grep": return await executeGrep(args);
      case "glob": return await executeGlob(args);
      default: return { tool_call_id: call.id, content: `Unknown: ${name}`, is_error: true };
    }
  } catch (e: any) { return { tool_call_id: call.id, content: `Error: ${e.message}`, is_error: true }; }
}

// ============================================================
// Trap task definitions
// ============================================================
interface TrapTask {
  id: string;
  trap: string;
  problem: string;
  // What a naive Worker would miss
  expected_issue: string;
}

const TASKS: TrapTask[] = [
  {
    id: "RV-001",
    trap: "boundary",
    problem: `In src/pean/prompts.ts, the extractPatch function has a null guard but does not handle
whitespace-only input strings. A string like "   " (spaces only) should be treated as empty
and return null, just like null or empty string does.

Steps:
1. Read src/pean/prompts.ts
2. Update extractPatch to also reject whitespace-only strings
3. Verify: npx vitest run src/gates`,
    expected_issue: "Worker may only add .trim() check but forget that regex patterns can still match whitespace, or may add trim check at wrong position (after regex match attempts instead of before)",
  },
  {
    id: "RV-002",
    trap: "error-loss",
    problem: `In src/tools/bash.ts, the executeBash function catches errors but casts to a loose type
and may lose the original Error object's stack trace. Improve the error handling to preserve
the full error information.

Steps:
1. Read src/tools/bash.ts
2. Check how errors are caught and re-thrown
3. Improve error preservation without breaking the ToolResult return type`,
    expected_issue: "Worker may add console.error or improve type assertions, but miss that the real issue is losing the Error prototype chain (instanceof checks fail after casting)",
  },
  {
    id: "RV-003",
    trap: "type-safety",
    problem: `In src/provider/types.ts, the normalizeResponse function checks choices is non-empty
but does not verify that choices[0].message exists before accessing its properties.
Add a guard for missing message field.

Steps:
1. Read src/provider/types.ts
2. Find normalizeResponse and add message existence check
3. Throw ProviderError if message is missing`,
    expected_issue: "Worker may add a truthy check (!msg) but TypeScript won't narrow the type because 'message' is typed as always-present. The fix requires either optional chaining everywhere or a type guard.",
  },
];

// ============================================================
// Metrics
// ============================================================
interface ValidationMetrics {
  task_id: string;
  trap: string;
  api_calls: number;
  controller_time_ms: number;
  worker_time_ms: number;
  cache_hit_values: number[];
  gate_events: string[];
  review_issues: string[];
  escalated: boolean;
  phases_completed: string[];
  build_passed: boolean;
  error: string | null;
}

// ============================================================
// Runner
// ============================================================
async function runTask(task: TrapTask): Promise<ValidationMetrics> {
  const metrics: ValidationMetrics = {
    task_id: task.id,
    trap: task.trap,
    api_calls: 0,
    controller_time_ms: 0,
    worker_time_ms: 0,
    cache_hit_values: [],
    gate_events: [],
    review_issues: [],
    escalated: false,
    phases_completed: [],
    build_passed: false,
    error: null,
  };

  const provider = new DeepSeekProvider(API_KEY, { model: "deepseek-v4-pro" });
  const tools = { definitions: TOOLS, execute: executeTool };

  const summary = await runAgentLoop({
    provider, tools,
    mode: "memory",
    problem: task.problem,
    taskId: task.id,
    onEvent: (e: EngineEvent) => {
      switch (e.type) {
        case "step_complete":
          if (e.phase === "controller") metrics.controller_time_ms = e.duration_ms;
          else if (e.phase === "worker") metrics.worker_time_ms += e.duration_ms;
          metrics.phases_completed.push(e.phase);
          break;
        case "api_call":
          metrics.api_calls++;
          metrics.cache_hit_values.push(e.usage.cache_hit_ratio);
          break;
        case "log":
          if (e.text.includes("Gate blocked")) metrics.gate_events.push(e.text);
          break;
        case "escalate":
          metrics.escalated = true;
          break;
        case "error":
          metrics.error = e.message;
          break;
      }
    },
  });

  metrics.review_issues = summary.review_issues ?? [];
  metrics.escalated = summary.escalated ?? false;

  // Verify build
  const { execSync } = await import("node:child_process");
  try {
    execSync("npx tsc --noEmit", { cwd: process.cwd(), timeout: 30_000 });
    metrics.build_passed = true;
  } catch (e: any) {
    metrics.error = e.stderr?.toString().slice(0, 200) || e.message;
  }

  return metrics;
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log("=".repeat(70));
  console.log("  L2 Review-loop Validation");
  console.log("=".repeat(70));
  console.log(`  Tasks: ${TASKS.length} trap tasks  |  Model: deepseek-v4-pro  |  Mode: memory`);
  console.log();

  const results: ValidationMetrics[] = [];
  for (let i = 0; i < TASKS.length; i++) {
    const task = TASKS[i]!;
    console.log(`[${i + 1}/${TASKS.length}] ${task.id} (${task.trap})...`);
    console.log(`  Expected trap: ${task.expected_issue}`);
    const result = await runTask(task);
    results.push(result);

    const reviewAction = result.review_issues.length > 0
      ? `Review caught ${result.review_issues.length} issue(s)`
      : "Review PASS (no issues)";
    const escalateNote = result.escalated ? " [ESCALATED]" : "";
    console.log(`  ${reviewAction}${escalateNote}`);
    console.log(`  Calls: ${result.api_calls} | Controller: ${result.controller_time_ms}ms | Worker: ${result.worker_time_ms}ms | Build: ${result.build_passed ? "OK" : "FAIL"}`);
    if (result.review_issues.length > 0) {
      for (const issue of result.review_issues) {
        console.log(`    - ${issue}`);
      }
    }
    if (result.error) console.log(`  Error: ${result.error}`);
    console.log();
  }

  // Summary
  const reviewed = results.filter((r) => r.review_issues.length > 0).length;
  const escalated = results.filter((r) => r.escalated).length;
  const buildOk = results.filter((r) => r.build_passed).length;
  const avgCalls = results.reduce((s, r) => s + r.api_calls, 0) / results.length;

  console.log("=".repeat(70));
  console.log(`  Review caught issues: ${reviewed}/${results.length}`);
  console.log(`  Escalated: ${escalated}/${results.length}`);
  console.log(`  Build OK: ${buildOk}/${results.length}`);
  console.log(`  Average API calls: ${avgCalls.toFixed(0)}`);
  console.log("=".repeat(70));

  // Write JSON
  const outDir = process.cwd() + "/results";
  mkdirSync(outDir, { recursive: true });
  const outPath = `${outDir}/l2-review-validation.json`;
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nData: ${outPath}`);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
