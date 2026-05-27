// Tradeoff B real API smoke test
// Memory mode → gate events → tradeoff → B → probe mode verified
// Usage: DEEPSEEK_API_KEY=sk-xxx npx tsx scripts/tradeoff-b-smoke.ts

import { runAgentLoop } from "../src/loop/agent-loop.js";
import { DeepSeekProvider } from "../src/provider/deepseek.js";
import { GraphBuilder } from "../src/graph/builder.js";
import { getTaskHistory, getStats } from "../src/graph/query.js";
import { bashDefinition, executeBash } from "../src/tools/bash.js";
import { readDefinition, executeRead } from "../src/tools/read.js";
import { writeDefinition, executeWrite } from "../src/tools/write.js";
import { editDefinition, executeEdit } from "../src/tools/edit.js";
import { grepDefinition, executeGrep } from "../src/tools/grep.js";
import { globDefinition, executeGlob } from "../src/tools/glob.js";
import type { ToolDefinition, ToolCall, ToolResult, EngineEvent, TradeoffEvidence, TradeoffOption, TradeoffChoice } from "../src/types.js";

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) { console.error("DEEPSEEK_API_KEY not set"); process.exit(1); }

const { dirname, resolve } = await import("node:path");
const { fileURLToPath } = await import("node:url");
const ENGINE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KEVIX_ROOT = resolve(ENGINE_ROOT, "..");
const GRAPH_PATH = resolve(KEVIX_ROOT, ".kevix/graph.json");
const ARTIFACT_PATH = resolve(KEVIX_ROOT, "results/tradeoff-b-smoke.json");

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

async function main() {
  const startedAt = new Date().toISOString();
  console.log("=".repeat(70));
  console.log("  Tradeoff B Real API Smoke Test");
  console.log("=".repeat(70));
  console.log(`  Model: deepseek-v4-pro  |  Start: memory  |  Graph: ${GRAPH_PATH}`);
  console.log();

  // Load existing graph + wire builder for auto-population
  const existingGraph = GraphBuilder.load(GRAPH_PATH);
  const graphBuilder = new GraphBuilder(existingGraph);
  console.log(`  Graph: ${Object.keys(existingGraph.nodes).length} nodes from previous runs`);

  const provider = new DeepSeekProvider(API_KEY, { model: "deepseek-v4-pro" });
  const tools = { definitions: TOOLS, execute: executeTool };

  // Metrics
  const phases: string[] = [];
  const cacheValues: number[] = [];
  const tradeoffEvents: Array<{ signals: string[] }> = [];
  let tradeoffChoice: TradeoffChoice | null = null;

  const summary = await runAgentLoop({
    provider, tools,
    mode: "memory",
    problem: `Create a new lightweight benchmark runner at src/pean/perf.ts.
It should export "measure(fn: () => void, label: string): { label: string, duration_ms: number }".
Implementation:
1. Use performance.now() for timing
2. Catch and report errors without throwing
3. Return { label, duration_ms }

Also create tests/perf.test.ts with 3 test cases, and update src/index.ts to export the new module.
Run the tests with "npx vitest run tests/perf.test.ts" to verify.`,
    taskId: `tradeoff-b-${Date.now()}`,
    graph: existingGraph,
    graphBuilder,

    onTradeoffRequired: async (evidence: TradeoffEvidence, options: TradeoffOption[]): Promise<TradeoffChoice> => {
      tradeoffEvents.push({ signals: evidence.activeSignals });
      tradeoffChoice = "B";
      console.log();
      console.log(`  ⚠️  TRADEOFF REQUIRED`);
      console.log(`  Signals: ${evidence.activeSignals.join(", ")}`);
      console.log(`  Gate count: ${evidence.gateCount}  |  Cache trend: ${evidence.cacheTrend}`);
      console.log(`  Choosing: B (upgrade to probe)`);
      console.log();
      return "B";
    },

    onEvent: (e: EngineEvent) => {
      switch (e.type) {
        case "step_complete":
          if (e.phase) phases.push(e.phase);
          break;
        case "tradeoff_required":
          tradeoffEvents.push({ signals: e.evidence.activeSignals });
          break;
        case "api_call":
          cacheValues.push(e.usage.cache_hit_ratio);
          break;
      }
    },
  });

  // Results
  const passed = phases.includes("probe_plan") && phases.includes("probe_verify") && tradeoffEvents.length > 0 && tradeoffChoice === "B";
  const artifact = {
    test: "tradeoff-b-smoke",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    model: "deepseek-v4-pro",
    phases,
    phases_include_probe_plan: phases.includes("probe_plan"),
    phases_include_probe_verify: phases.includes("probe_verify"),
    tradeoff_events: tradeoffEvents.length,
    tradeoff_choice: tradeoffChoice,
    cache_values: cacheValues,
    api_calls: summary.request_count,
    exit_code: passed ? 0 : 1,
    passed,
    error: null,
    summary: {
      escalated: summary.escalated,
      review_issues: summary.review_issues,
    },
  };

  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(dirname(ARTIFACT_PATH), { recursive: true });
  writeFileSync(ARTIFACT_PATH, JSON.stringify(artifact, null, 2));

  console.log("=".repeat(70));
  console.log("  RESULTS");
  console.log("=".repeat(70));
  console.log(`  Phases: ${phases.join(" → ")}`);
  console.log(`  Phases include probe_plan: ${artifact.phases_include_probe_plan}`);
  console.log(`  Phases include probe_verify: ${artifact.phases_include_probe_verify}`);
  console.log(`  Tradeoff events: ${artifact.tradeoff_events}`);
  console.log(`  Tradeoff choice: ${artifact.tradeoff_choice}`);
  console.log(`  API calls: ${artifact.api_calls}`);
  console.log();

  // Save graph populated by engine run
  graphBuilder.save(GRAPH_PATH);

  // Verify graph persistence
  const loaded = GraphBuilder.load(GRAPH_PATH);
  console.log(`  Graph saved: ${GRAPH_PATH} (${Object.keys(loaded.nodes).length} nodes, ${loaded.edges.length} edges)`);
  console.log(`  Artifact saved: ${ARTIFACT_PATH}`);
  console.log();

  console.log(passed ? "  PASS: Tradeoff B control plane verified" : "  FAIL: Not all conditions met");
  process.exit(passed ? 0 : 1);
}

main().catch(async (e) => {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(dirname(ARTIFACT_PATH), { recursive: true });
  writeFileSync(ARTIFACT_PATH, JSON.stringify({
    test: "tradeoff-b-smoke",
    started_at: null,
    finished_at: new Date().toISOString(),
    model: "deepseek-v4-pro",
    phases: [],
    tradeoff_events: 0,
    tradeoff_choice: null,
    cache_values: [],
    api_calls: 0,
    exit_code: 1,
    passed: false,
    error: e instanceof Error ? e.message : String(e),
  }, null, 2));
  console.error("FATAL:", e);
  process.exit(1);
});
